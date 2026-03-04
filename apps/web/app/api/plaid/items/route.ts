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

    const { data, error } = await supabase
      .from('plaid_items')
      .select('id, plaid_item_id, institution_name, status, last_synced_at, error_code, created_at')
      .eq('household_id', household_id)
      .order('created_at', { ascending: true })

    if (error) {
      return errorResponse(400, { code: 'PLAID_ITEMS_FETCH_FAILED', message: error.message, retryable: true })
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
