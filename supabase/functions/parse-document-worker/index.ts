import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { reserveIdempotencyKey } from '../_shared/idempotency.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

const MAX_ATTEMPTS = 5
const RETRY_DELAY_MINUTES = 5

const totalCentsFromPayload = (payload: Record<string, unknown>) => {
  const values = Array.isArray(payload.line_items_cents) ? payload.line_items_cents : []
  return values.reduce((sum, value) => sum + BigInt(value as string | number), 0n)
}

serve(async (req) => {
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('parse-document-worker', body, req))

  if (!['POST', 'GET'].includes(req.method)) {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const batchSize = Number(body.batch_size ?? 25)
  const nowIso = new Date().toISOString()

  logger.info('worker_batch_requested', { batch_size: batchSize })

  const { data: queued, error: queueError } = await supabaseAdmin
    .from('document_parse_ingest')
    .select('id, household_id, document_parse_id, payload, attempt_count, created_at')
    .in('status', ['pending', 'retryable'])
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (queueError) {
    logger.error('worker_queue_fetch_failed', { error: queueError.message })
    throw queueError
  }

  const processed: Array<Record<string, unknown>> = []

  for (const record of queued ?? []) {
    const recordLogger = logger.child({
      household_id: record.household_id as string,
      entry_id: record.id as string,
      event_id: record.document_parse_id as string,
    })

    const attemptCount = (record.attempt_count as number) + 1

    await supabaseAdmin
      .from('document_parse_ingest')
      .update({
        status: 'processing',
        attempt_count: attemptCount,
        last_error: null,
        next_retry_at: null,
      })
      .eq('id', record.id)

    try {
      const payload = (record.payload ?? {}) as Record<string, unknown>
      const parseJobId = crypto.randomUUID()
      const reviewArtifacts = {
        parser_version: 'v1',
        confidence_score: payload.confidence_score ?? null,
        extracted_line_items: payload.line_items ?? [],
      }

      await supabaseAdmin
        .from('document_parse_ingest')
        .update({
          status: 'upload_recorded',
        })
        .eq('id', record.id)

      await supabaseAdmin
        .from('document_parse_ingest')
        .update({
          status: 'parse_job_created',
          parse_job_id: parseJobId,
        })
        .eq('id', record.id)

      await supabaseAdmin
        .from('document_parse_ingest')
        .update({
          status: 'review_artifacts_ready',
          review_artifacts: reviewArtifacts,
        })
        .eq('id', record.id)

      const idempotency = await reserveIdempotencyKey({
        householdId: record.household_id as string,
        source: 'document_parse',
        sourceEventId: record.document_parse_id as string,
      })

      let journalEntryId: string | null = null
      if (!idempotency.isDuplicate) {
        const centsTotal = totalCentsFromPayload(payload)
        const { data: entryData, error: entryError } = await supabaseAdmin
          .from('journal_entries')
          .insert({
            household_id: record.household_id,
            entry_type: 'transaction',
            source: 'document_upload',
            description: `Parsed document ${record.document_parse_id} total ${(Number(centsTotal) / 100).toFixed(2)}`,
            entry_date: new Date().toISOString().slice(0, 10),
            effective_date: new Date().toISOString().slice(0, 10),
            is_posted: false,
          })
          .select('id')
          .single()

        if (entryError) {
          throw entryError
        }

        journalEntryId = entryData.id
      }

      const processedAt = new Date().toISOString()
      const latencyMs =
        new Date(processedAt).getTime() - new Date(record.created_at as string).getTime()

      await supabaseAdmin.from('ingestion_latency_metrics').insert({
        pipeline: 'document_parse',
        ingest_record_id: record.id,
        latency_ms: Math.max(latencyMs, 0),
      })

      await supabaseAdmin
        .from('document_parse_ingest')
        .update({
          status: 'posting_confirmed',
          posting_journal_entry_id: journalEntryId,
          processed_at: processedAt,
          next_retry_at: null,
          last_error: null,
        })
        .eq('id', record.id)

      recordLogger.info('worker_record_processed', {
        posting_journal_entry_id: journalEntryId,
        parse_job_id: parseJobId,
        latency_ms: Math.max(latencyMs, 0),
      })
      processed.push({
        id: record.id,
        documentParseId: record.document_parse_id,
        status: 'posting_confirmed',
        parseJobId,
        journalEntryId,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const deadLetter = attemptCount >= MAX_ATTEMPTS
      const nextRetryAt = deadLetter
        ? null
        : new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000).toISOString()

      await supabaseAdmin.from('ingestion_failure_metrics').insert({
        pipeline: 'document_parse',
        ingest_record_id: record.id,
        attempt_count: attemptCount,
        is_dead_letter: deadLetter,
        error_message: message,
      })

      await supabaseAdmin
        .from('document_parse_ingest')
        .update({
          status: deadLetter ? 'dead_letter' : 'retryable',
          last_error: message,
          next_retry_at: nextRetryAt,
          dead_lettered_at: deadLetter ? new Date().toISOString() : null,
        })
        .eq('id', record.id)

      recordLogger.error('worker_record_failed', {
        error: message,
        dead_lettered: deadLetter,
        attempt_count: attemptCount,
      })
      processed.push({
        id: record.id,
        documentParseId: record.document_parse_id,
        status: deadLetter ? 'dead_letter' : 'retryable',
        error: message,
      })
    }
  }

  logger.info('worker_batch_completed', { processed_count: processed.length })
  return Response.json({
    function: 'parse-document-worker',
    processedCount: processed.length,
    records: processed,
  })
})
