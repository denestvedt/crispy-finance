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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse(401, {
        code: 'UNAUTHORIZED',
        message: userError?.message ?? 'User not authenticated',
        retryable: false,
      })
    }

    const { data, error } = await supabase
      .from('household_unread_notifications_projection')
      .select('unread_count, updated_at')
      .eq('household_id', household_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return errorResponse(400, {
        code: 'UNREAD_NOTIFICATIONS_PROJECTION_READ_FAILED',
        message: error.message,
        retryable: true,
      })
    }

    return successResponse({ unread_count: data?.unread_count ?? 0, updated_at: data?.updated_at ?? null })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request query',
      retryable: false,
    })
  }
}
