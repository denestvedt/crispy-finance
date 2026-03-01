import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, successResponse } from '@/app/api/_lib/contracts'
import { parseCursorPagination, paginationConfig } from '@/app/api/_lib/pagination'

const querySchema = z.object({
  household_id: z.string().uuid(),
})

const cursorSchema = z.object({
  created_at: z.string().datetime(),
  id: z.string().uuid(),
})

type LedgerEntryRow = {
  id: string
  entry_date: string
  effective_date: string
  description: string
  entry_type: string
  source: string
  is_posted: boolean
  created_at: string
}

function decodeCursor(cursor: string | null): z.infer<typeof cursorSchema> | null {
  if (!cursor) return null

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    return cursorSchema.parse(parsed)
  } catch {
    return null
  }
}

function encodeCursor(entry: LedgerEntryRow): string {
  return Buffer.from(
    JSON.stringify({
      created_at: entry.created_at,
      id: entry.id,
    }),
    'utf8',
  ).toString('base64url')
}

export async function GET(req: Request) {
  try {
    const { household_id } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const supabase = await createClient()
    const pagination = parseCursorPagination(req.url)
    const cursor = decodeCursor(pagination.cursor)

    if (pagination.cursor && !cursor) {
      return errorResponse(400, {
        code: 'INVALID_CURSOR',
        message: 'Cursor is malformed or expired.',
        retryable: false,
      })
    }

    let query = supabase
      .from('journal_entries')
      .select('id, entry_date, effective_date, description, entry_type, source, is_posted, created_at')
      .eq('household_id', household_id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(pagination.pageSize + 1)

    if (cursor) {
      query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`)
    }

    const { data, error } = await query

    if (error) {
      return errorResponse(400, { code: 'LEDGER_LIST_FAILED', message: error.message, retryable: true })
    }

    const rows = (data ?? []) as LedgerEntryRow[]
    const hasMore = rows.length > pagination.pageSize
    const items = hasMore ? rows.slice(0, pagination.pageSize) : rows
    const nextCursor = hasMore ? encodeCursor(items[items.length - 1]) : null

    return successResponse({
      items,
      next_cursor: nextCursor,
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
