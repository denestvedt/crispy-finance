import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const incomeAccrualsCents = Array.isArray(payload.income_accruals_cents)
    ? payload.income_accruals_cents.map((amount: number | string) => BigInt(amount))
    : []

  const totalIncomeCents = sumCents(incomeAccrualsCents)

  return Response.json({
    function: 'run-income-accruals',
    status: 'accepted',
    postedCount: incomeAccrualsCents.length,
    postedTotal: centsToDecimalString(totalIncomeCents),
  })
})
