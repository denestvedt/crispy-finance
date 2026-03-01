import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { reserveIdempotencyKey } from '../_shared/idempotency.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('plaid-link-exchange', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

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

  logger.info('plaid_link_exchange_processed', {
    accepted_count: accepted.length,
    duplicate_count: duplicates.length,
  })

  return Response.json({
    function: 'plaid-link-exchange',
    status: 'accepted',
    acceptedCount: accepted.length,
    duplicateCount: duplicates.length,
    acceptedTransactionIds: accepted,
    duplicateTransactionIds: duplicates,
  })
})
