import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const webhookEventId = String(payload.webhook_event_id ?? '')
  const householdId = String(payload.household_id ?? '')
  const plaidItemId = payload.plaid_item_id ? String(payload.plaid_item_id) : null

  if (!webhookEventId || !householdId) {
    return Response.json(
      { error: 'webhook_event_id and household_id are required' },
      { status: 400 },
    )
  }

  const transactionIds = Array.isArray(payload.transaction_ids)
    ? payload.transaction_ids.map((transactionId: string | number) => String(transactionId))
    : []

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
    throw error
  }

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
