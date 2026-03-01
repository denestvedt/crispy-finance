import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'

const querySchema = z.object({
  household_id: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('get_household_liquid_position_projection', {
      p_household_id: household_id,
    })

    if (error) {
      return errorResponse(400, {
        code: 'POSITION_PROJECTION_READ_FAILED',
        message: error.message,
        retryable: true,
      })
    }

    return successResponse(data?.[0] ?? null)
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request query',
      retryable: false,
    })
  }
}
