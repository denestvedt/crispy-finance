import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'
import { parsePagination, paginationConfig } from '@/app/api/_lib/pagination'

const querySchema = z.object({
  household_id: z.string().uuid(),
  unread_only: z.enum(['true', 'false']).optional(),
})

export async function GET(req: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()
    const pagination = parsePagination(req.url)

    let builder = supabase
      .from('notifications')
      .select('id, type, title, body, data, is_read, created_at')
      .eq('household_id', query.household_id)

    if (query.unread_only === 'true') {
      builder = builder.eq('is_read', false)
    }

    const { data, error } = await builder
      .order('is_read', { ascending: true })
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to)

    if (error) {
      return errorResponse(400, { code: 'NOTIFICATIONS_FEED_FAILED', message: error.message, retryable: true })
    }

    return successResponse({
      items: data ?? [],
      page: pagination.page,
      page_size: pagination.pageSize,
      default_page_size: paginationConfig.defaultPageSize,
      max_page_size: paginationConfig.maxPageSize,
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request query',
      retryable: false,
    })
  }
}
