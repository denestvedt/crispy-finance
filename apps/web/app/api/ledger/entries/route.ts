import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'
import { parsePagination, paginationConfig } from '@/app/api/_lib/pagination'

const querySchema = z.object({
  household_id: z.string().uuid(),
})

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()
    const pagination = parsePagination(req.url)

    const { data, error } = await supabase
      .from('journal_entries')
      .select('id, entry_date, effective_date, description, entry_type, source, is_posted, created_at', { count: 'exact' })
      .eq('household_id', household_id)
      .order('created_at', { ascending: false })
      .range(pagination.from, pagination.to)

    if (error) {
      return errorResponse(400, { code: 'LEDGER_LIST_FAILED', message: error.message, retryable: true })
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
