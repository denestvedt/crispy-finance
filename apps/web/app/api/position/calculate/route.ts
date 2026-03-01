import { z } from 'zod'
import type { CalculatePositionRequest, CalculatePositionResponse } from '@household-cfo/types'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid(),
  as_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}) satisfies z.ZodType<CalculatePositionRequest>

export async function POST(req: Request) {
  try {
    const payload = await parseJson(req, schema)
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('calculate_true_liquid_position', {
      p_household_id: payload.household_id,
      p_as_of: payload.as_of ?? null,
    })

    if (error) {
      return errorResponse(400, {
        code: 'POSITION_CALCULATION_FAILED',
        message: error.message,
        retryable: false,
      })
    }

    return successResponse((data?.[0] ?? null) as CalculatePositionResponse)
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
