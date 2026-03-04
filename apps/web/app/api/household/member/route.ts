import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const updateSchema = z.object({
  household_id: z.string().uuid(),
  display_name: z.string().min(1).optional(),
  pay_schedule: z.enum(['weekly', 'biweekly', 'semimonthly', 'monthly']).optional(),
  pay_day_1: z.number().int().min(1).max(28).optional().nullable(),
  pay_day_2: z.number().int().min(1).max(28).optional().nullable(),
  gross_annual_salary: z.number().min(0).optional(),
})

export async function PATCH(req: Request) {
  try {
    const payload = await parseJson(req, updateSchema)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false })
    }

    const updates: Record<string, unknown> = {}
    if (payload.display_name !== undefined) updates.display_name = payload.display_name
    if (payload.pay_schedule !== undefined) updates.pay_schedule = payload.pay_schedule
    if (payload.pay_day_1 !== undefined) updates.pay_day_1 = payload.pay_day_1
    if (payload.pay_day_2 !== undefined) updates.pay_day_2 = payload.pay_day_2
    if (payload.gross_annual_salary !== undefined) updates.gross_annual_salary = payload.gross_annual_salary

    const { data, error } = await supabase
      .from('household_members')
      .update(updates)
      .eq('household_id', payload.household_id)
      .eq('user_id', user.id)
      .select('id, display_name, pay_schedule, pay_day_1, pay_day_2, gross_annual_salary')
      .single()

    if (error) {
      return errorResponse(400, { code: 'MEMBER_UPDATE_FAILED', message: error.message, retryable: false })
    }

    return successResponse(data)
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
