import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json().catch(() => ({}))

  const { data, error } = await supabaseAdmin.rpc('calculate_true_liquid_position', {
    p_household_id: payload.household_id,
    p_as_of: payload.as_of ?? null,
  })

  if (error) {
    return Response.json({ code: 'CALCULATE_POSITION_FAILED', message: error.message }, { status: 400 })
  }

  return Response.json(data?.[0] ?? null)
})
