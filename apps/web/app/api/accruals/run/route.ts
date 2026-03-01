import { z } from 'zod'
import type { RunDailyAccrualsRequest, RunDailyAccrualsResponse } from '@household-cfo/types'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid().optional(),
  run_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idempotency_key: z.string().min(8).optional(),
}) satisfies z.ZodType<RunDailyAccrualsRequest>

export async function POST(req: Request) {
  try {
    const payload = await parseJson(req, schema)
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('run_daily_accruals', {
      p_household_id: payload.household_id ?? null,
      p_run_date: payload.run_date ?? null,
    })

    if (error) {
      return errorResponse(400, { code: 'RUN_DAILY_ACCRUALS_FAILED', message: error.message, retryable: true })
    }

    const row = data?.[0]

    return successResponse<RunDailyAccrualsResponse>({
      posted_count: Number(row?.posted_count ?? 0),
      posted_total_cents: Number(row?.posted_total_cents ?? 0),
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
