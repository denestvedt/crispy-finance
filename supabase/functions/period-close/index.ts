import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json()

  const { data, error } = await supabaseAdmin.rpc('close_period', {
    p_household_id: payload.household_id,
    p_period_end: payload.period_end,
    p_idempotency_key: payload.idempotency_key ?? null,
  })

  if (error) {
    return Response.json({ code: 'CLOSE_PERIOD_FAILED', message: error.message }, { status: 400 })
  }

  return Response.json({ function: 'period-close', status: 'accepted', result: data?.[0] ?? null })
})
