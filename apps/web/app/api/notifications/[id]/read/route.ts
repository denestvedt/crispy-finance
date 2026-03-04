import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'

export async function PATCH(_req: Request, { params }: { params: { id: string } }) {
  try {
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
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (error) {
      return errorResponse(400, { code: 'MARK_READ_FAILED', message: error.message, retryable: false })
    }

    return successResponse({ id: params.id, is_read: true })
  } catch (error) {
    return errorResponse(500, {
      code: 'INTERNAL_ERROR',
      message: error instanceof Error ? error.message : 'Unexpected error',
      retryable: false,
    })
  }
}
