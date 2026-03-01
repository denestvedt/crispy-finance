import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'
import { reserveIdempotencyKey } from '../_shared/idempotency.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const parseId = String(payload.document_parse_id ?? '')

  if (!parseId) {
    return Response.json({ error: 'document_parse_id is required' }, { status: 400 })
  }

  const idempotency = await reserveIdempotencyKey({
    householdId: payload.household_id,
    source: 'document_parse',
    sourceEventId: parseId,
  })

  if (idempotency.isDuplicate) {
    return Response.json({ status: 'duplicate_ignored', documentParseId: parseId })
  }

  const lineItemsCents = Array.isArray(payload.line_items_cents)
    ? payload.line_items_cents.map((amount: number | string) => BigInt(amount))
    : []

  const totalCents = sumCents(lineItemsCents)

  return Response.json({
    function: 'parse-document',
    status: 'accepted',
    documentParseId: parseId,
    lineItemCount: lineItemsCents.length,
    parsedTotal: centsToDecimalString(totalCents),
  })
})
