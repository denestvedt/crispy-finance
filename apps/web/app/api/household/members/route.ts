import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'

const querySchema = z.object({ household_id: z.string().uuid() })

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('household_members')
      .select('id, user_id, role, display_name, pay_schedule, gross_annual_salary, created_at')
      .eq('household_id', household_id)
      .order('created_at', { ascending: true })

    if (error) {
      return errorResponse(400, { code: 'MEMBERS_FETCH_FAILED', message: error.message, retryable: true })
    }

    return successResponse(data ?? [])
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid query',
      retryable: false,
    })
  }
}
