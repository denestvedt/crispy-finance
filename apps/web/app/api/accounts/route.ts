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
      .from('accounts')
      .select('id, name, account_type, account_subtype, liquidity_tier, current_balance, is_system, plaid_item_id, created_at')
      .eq('household_id', household_id)
      .eq('is_active', true)
      .order('account_type', { ascending: true })
      .order('name', { ascending: true })

    if (error) {
      return errorResponse(400, { code: 'ACCOUNTS_FETCH_FAILED', message: error.message, retryable: true })
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
