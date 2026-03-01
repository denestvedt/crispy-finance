import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'
import { reserveIdempotencyKey } from '../_shared/idempotency.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const webhookEventId = String(payload.webhook_event_id ?? '')

  if (!webhookEventId) {
    return Response.json({ error: 'webhook_event_id is required' }, { status: 400 })
  }

  const idempotency = await reserveIdempotencyKey({
    householdId: payload.household_id,
    source: 'plaid_webhook',
    sourceEventId: webhookEventId,
  })

  if (idempotency.isDuplicate) {
    return Response.json({ status: 'duplicate_ignored', webhookEventId })
  }

  const transactionAmountsCents = Array.isArray(payload.transaction_amounts_cents)
    ? payload.transaction_amounts_cents.map((amount: number | string) => BigInt(amount))
    : []

  const netAmountCents = sumCents(transactionAmountsCents)

  return Response.json({
    function: 'plaid-webhook',
    status: 'accepted',
    webhookEventId,
    transactionCount: transactionAmountsCents.length,
    netAmount: centsToDecimalString(netAmountCents),
  })
})
