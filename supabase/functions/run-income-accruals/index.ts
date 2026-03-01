import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { centsToDecimalString, sumCents } from '../_shared/ledger.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('run-income-accruals', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  const incomeAccrualsCents = Array.isArray(payload.income_accruals_cents)
    ? payload.income_accruals_cents.map((amount: number | string) => BigInt(amount))
    : []

  const totalIncomeCents = sumCents(incomeAccrualsCents)
  logger.info('income_accrual_aggregated', {
    posted_count: incomeAccrualsCents.length,
    posted_total: centsToDecimalString(totalIncomeCents),
  })

  return Response.json({
    function: 'run-income-accruals',
    status: 'accepted',
    postedCount: incomeAccrualsCents.length,
    postedTotal: centsToDecimalString(totalIncomeCents),
  })
})
