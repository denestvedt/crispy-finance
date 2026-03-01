import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()
  const closingLinesCents = Array.isArray(payload.closing_line_amounts_cents)
    ? payload.closing_line_amounts_cents.map((amount: number | string) => BigInt(amount))
    : []

  const closeNetCents = sumCents(closingLinesCents)

  return Response.json({
    function: 'period-close',
    status: 'accepted',
    lineCount: closingLinesCents.length,
    closeNetAmount: centsToDecimalString(closeNetCents),
  })
})
