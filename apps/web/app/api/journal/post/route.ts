import { z } from 'zod'
import type { PostJournalEntryRequest, PostJournalEntryResponse } from '@household-cfo/types'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const lineSchema = z.object({
  account_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  side: z.enum(['debit', 'credit']),
  memo: z.string().optional(),
})

const schema = z.object({
  household_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().min(1),
  entry_type: z.enum(['transaction', 'accrual', 'close', 'adjustment', 'provision', 'income_accrual']),
  source: z.enum(['plaid', 'manual', 'document_upload', 'system_accrual', 'period_close']),
  lines: z.array(lineSchema).min(2),
  idempotency_key: z.string().min(8),
}) satisfies z.ZodType<PostJournalEntryRequest>

export async function POST(req: Request) {
  try {
    const payload = await parseJson(req, schema)
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('post_journal_entry', {
      p_household_id: payload.household_id,
      p_entry_date: payload.entry_date ?? null,
      p_effective_date: payload.effective_date ?? null,
      p_description: payload.description,
      p_entry_type: payload.entry_type,
      p_source: payload.source,
      p_lines: payload.lines,
      p_idempotency_key: payload.idempotency_key,
    })

    if (error) {
      return errorResponse(400, {
        code: 'POST_JOURNAL_ENTRY_FAILED',
        message: error.message,
        retryable: false,
      })
    }

    const row = data?.[0]

    return successResponse<PostJournalEntryResponse>({
      journal_entry_id: row?.journal_entry_id,
      replayed: Boolean(row?.replayed),
      is_posted: Boolean(row?.is_posted),
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
