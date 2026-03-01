import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const accrualAmountsCents = Array.isArray(payload.accrual_amounts_cents)
    ? payload.accrual_amounts_cents.map((amount: number | string) => BigInt(amount))
    : []

  const postedTotalCents = sumCents(accrualAmountsCents)

  return Response.json({
    function: 'run-daily-accruals',
    status: 'accepted',
    postedCount: accrualAmountsCents.length,
    postedTotal: centsToDecimalString(postedTotalCents),
  })
})
