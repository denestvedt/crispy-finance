import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('run-daily-accruals', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  logger.info('daily_accrual_requested')
  const { data, error } = await supabaseAdmin.rpc('run_daily_accruals', {
    p_household_id: payload.household_id ?? null,
    p_run_date: payload.run_date ?? null,
  })

  if (error) {
    logger.error('daily_accrual_failed', { error: error.message })
    return Response.json({ code: 'RUN_DAILY_ACCRUALS_FAILED', message: error.message }, { status: 400 })
  }

  logger.info('daily_accrual_succeeded')
  return Response.json({
    function: 'run-daily-accruals',
    status: 'accepted',
    result: data?.[0] ?? { posted_count: 0, posted_total_cents: 0 },
  })
})
