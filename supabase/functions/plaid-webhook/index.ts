import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('plaid-webhook', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const webhookEventId = String(payload.webhook_event_id ?? '')
  const householdId = String(payload.household_id ?? '')
  const plaidItemId = payload.plaid_item_id ? String(payload.plaid_item_id) : null

  if (!webhookEventId || !householdId) {
    logger.warn('validation_failed', { reason: 'missing_webhook_event_or_household' })
    return Response.json(
      { error: 'webhook_event_id and household_id are required' },
      { status: 400 },
    )
  }

  const transactionIds = Array.isArray(payload.transaction_ids)
    ? payload.transaction_ids.map((transactionId: string | number) => String(transactionId))
    : []

  const requestLogger = logger.child({ household_id: householdId, event_id: webhookEventId })
  requestLogger.info('webhook_ingest_requested', { transaction_count: transactionIds.length })

  const { data, error } = await supabaseAdmin
    .from('plaid_webhook_ingest')
    .insert({
      household_id: householdId,
      webhook_event_id: webhookEventId,
      plaid_item_id: plaidItemId,
      transaction_ids: transactionIds,
      payload,
    })
    .select('id, status, created_at')
    .single()

  if (error?.code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('plaid_webhook_ingest')
      .select('id, status, created_at')
      .eq('webhook_event_id', webhookEventId)
      .single()

    requestLogger.info('webhook_duplicate_ignored', { ingest_id: existing?.id })
    return Response.json({
      function: 'plaid-webhook',
      status: 'duplicate_ignored',
      webhookEventId,
      ingestId: existing?.id,
      ingestStatus: existing?.status,
      queuedAt: existing?.created_at,
    })
  }

  if (error) {
    requestLogger.error('webhook_ingest_failed', { error: error.message })
    throw error
  }

  requestLogger.info('webhook_ingested', { ingest_id: data.id, ingest_status: data.status })
  return Response.json({
    function: 'plaid-webhook',
    status: 'accepted',
    webhookEventId,
    ingestId: data.id,
    ingestStatus: data.status,
    queuedAt: data.created_at,
    transactionCount: transactionIds.length,
  })
})
