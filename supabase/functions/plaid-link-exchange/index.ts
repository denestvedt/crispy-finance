import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { reserveIdempotencyKey } from '../_shared/idempotency.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const transactionIds: string[] = Array.isArray(payload.plaid_transaction_ids)
    ? payload.plaid_transaction_ids.map((id: unknown) => String(id))
    : []

  const accepted: string[] = []
  const duplicates: string[] = []

  for (const transactionId of transactionIds) {
    const keyResult = await reserveIdempotencyKey({
      householdId: payload.household_id,
      source: 'plaid_transaction',
      sourceEventId: transactionId,
    })

    if (keyResult.isDuplicate) {
      duplicates.push(transactionId)
    } else {
      accepted.push(transactionId)
    }
  }

  return Response.json({
    function: 'plaid-link-exchange',
    status: 'accepted',
    acceptedCount: accepted.length,
    duplicateCount: duplicates.length,
    acceptedTransactionIds: accepted,
    duplicateTransactionIds: duplicates,
  })
})
