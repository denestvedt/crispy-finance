import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

import { supabaseAdmin } from '../_shared/client.ts'

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  const payload = await req.json().catch(() => ({}))

  const { data, error } = await supabaseAdmin.rpc('run_daily_accruals', {
    p_household_id: payload.household_id ?? null,
    p_run_date: payload.run_date ?? null,
  })

  if (error) {
    return Response.json({ code: 'RUN_DAILY_ACCRUALS_FAILED', message: error.message }, { status: 400 })
  }

  return Response.json({
    function: 'run-daily-accruals',
    status: 'accepted',
    result: data?.[0] ?? { posted_count: 0, posted_total_cents: 0 },
  })
})
