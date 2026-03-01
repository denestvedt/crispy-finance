import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('period-close', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  logger.info('period_close_requested')
  const { data, error } = await supabaseAdmin.rpc('close_period', {
    p_household_id: payload.household_id,
    p_period_end: payload.period_end,
    p_idempotency_key: payload.idempotency_key ?? null,
  })

  if (error) {
    logger.error('period_close_failed', { error: error.message })
    return Response.json({ code: 'CLOSE_PERIOD_FAILED', message: error.message }, { status: 400 })
  }

  logger.info('period_close_succeeded')
  return Response.json({ function: 'period-close', status: 'accepted', result: data?.[0] ?? null })
})
