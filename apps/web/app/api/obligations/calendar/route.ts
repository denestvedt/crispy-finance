import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'
import { parsePagination, paginationConfig } from '@/app/api/_lib/pagination'

const querySchema = z.object({
  household_id: z.string().uuid(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(req: Request) {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()
    const pagination = parsePagination(req.url)

    const startDate = query.start_date ?? new Date().toISOString().slice(0, 10)
    const endDate = query.end_date ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data, error } = await supabase
      .from('obligations')
      .select('id, name, obligation_type, estimated_amount_cents, next_due_date, is_active')
      .eq('household_id', query.household_id)
      .eq('is_active', true)
      .gte('next_due_date', startDate)
      .lte('next_due_date', endDate)
      .order('next_due_date', { ascending: true })
      .range(pagination.from, pagination.to)

    if (error) {
      return errorResponse(400, { code: 'OBLIGATIONS_CALENDAR_FAILED', message: error.message, retryable: true })
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
