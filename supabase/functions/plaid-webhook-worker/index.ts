import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { reserveIdempotencyKey } from '../_shared/idempotency.ts'

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MINUTES = 5

serve(async (req) => {
  if (!['POST', 'GET'].includes(req.method)) {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const batchSize = Number(body.batch_size ?? 25)

  const nowIso = new Date().toISOString()

  const { data: queued, error: queueError } = await supabaseAdmin
    .from('plaid_webhook_ingest')
    .select('id, household_id, webhook_event_id, transaction_ids, payload, attempt_count, created_at')
    .in('status', ['pending', 'retryable'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (queueError) {
    throw queueError
  }

  const processed: Array<Record<string, unknown>> = []

  for (const record of queued ?? []) {
    const attemptCount = (record.attempt_count as number) + 1
    const { error: processingError } = await supabaseAdmin
      .from('plaid_webhook_ingest')
      .update({
        status: 'processing',
        attempt_count: attemptCount,
        last_error: null,
        next_retry_at: null,
      })
      .eq('id', record.id)

    if (processingError) {
      throw processingError
    }

    try {
      const txIds = Array.isArray(record.transaction_ids)
        ? (record.transaction_ids as string[])
        : []

      let createdEntries = 0

      for (const txId of txIds) {
        const dedup = await reserveIdempotencyKey({
          householdId: record.household_id as string,
          source: 'plaid_transaction',
          sourceEventId: `${record.webhook_event_id}:${txId}`,
        })

        if (dedup.isDuplicate) {
          continue
        }

        const { error: entryError } = await supabaseAdmin.from('journal_entries').insert({
          household_id: record.household_id,
          entry_type: 'transaction',
          source: 'plaid',
          description: `Plaid transaction ${txId} from webhook ${record.webhook_event_id}`,
          entry_date: new Date().toISOString().slice(0, 10),
          effective_date: new Date().toISOString().slice(0, 10),
          is_posted: false,
        })

        if (entryError) {
          throw entryError
        }

        createdEntries += 1
      }

      const processedAt = new Date().toISOString()
      const latencyMs =
        new Date(processedAt).getTime() - new Date(record.created_at as string).getTime()

      await supabaseAdmin.from('ingestion_latency_metrics').insert({
        pipeline: 'plaid_webhook',
        ingest_record_id: record.id,
        latency_ms: Math.max(latencyMs, 0),
      })

      await supabaseAdmin
        .from('plaid_webhook_ingest')
        .update({
          status: 'processed',
          processed_at: processedAt,
          last_error: null,
          next_retry_at: null,
        })
        .eq('id', record.id)

      processed.push({
        id: record.id,
        webhookEventId: record.webhook_event_id,
        status: 'processed',
        createdEntries,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const deadLetter = attemptCount >= MAX_ATTEMPTS
      const nextRetryAt = deadLetter
        ? null
        : new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString()

      await supabaseAdmin.from('ingestion_failure_metrics').insert({
        pipeline: 'plaid_webhook',
        ingest_record_id: record.id,
        attempt_count: attemptCount,
        is_dead_letter: deadLetter,
        error_message: message,
      })

      await supabaseAdmin
        .from('plaid_webhook_ingest')
        .update({
          status: deadLetter ? 'dead_letter' : 'retryable',
          last_error: message,
          next_retry_at: nextRetryAt,
          dead_lettered_at: deadLetter ? new Date().toISOString() : null,
        })
        .eq('id', record.id)

      processed.push({
        id: record.id,
        webhookEventId: record.webhook_event_id,
        status: deadLetter ? 'dead_letter' : 'retryable',
        error: message,
      })
    }
  }

  return Response.json({
    function: 'plaid-webhook-worker',
    processedCount: processed.length,
    records: processed,
  })
})
