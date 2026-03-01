import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'
import { buildLogContext, createLogger } from '../_shared/logging.ts'

serve(async (req) => {
  const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
  const logger = createLogger(buildLogContext('calculate-position', payload, req))

  if (req.method !== 'POST') {
    logger.warn('method_not_allowed', { method: req.method })
    return new Response('Method Not Allowed', { status: 405 })
  }

  logger.info('calculate_position_requested')
  const { data, error } = await supabaseAdmin.rpc('calculate_true_liquid_position', {
    p_household_id: payload.household_id,
    p_as_of: payload.as_of ?? null,
  })

  if (error) {
    logger.error('calculate_position_failed', { error: error.message })
    return Response.json({ code: 'CALCULATE_POSITION_FAILED', message: error.message }, { status: 400 })
  }

  logger.info('calculate_position_succeeded')
  return Response.json(data?.[0] ?? null)
})
