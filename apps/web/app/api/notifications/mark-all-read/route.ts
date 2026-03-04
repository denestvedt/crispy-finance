import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({ household_id: z.string().uuid() })

export async function PATCH(req: Request) {
  try {
    const { household_id } = await parseJson(req, schema)
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false })
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('household_id', household_id)
      .eq('user_id', user.id)
      .eq('is_read', false)

    if (error) {
      return errorResponse(400, { code: 'MARK_ALL_READ_FAILED', message: error.message, retryable: false })
    }

    return successResponse({ marked_read: true })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
