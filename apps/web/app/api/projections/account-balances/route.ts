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
      .from('household_account_subtype_projection')
      .select('account_type, account_subtype, liquidity_tier, balance_cents, updated_at')
      .eq('household_id', household_id)
      .order('account_type', { ascending: true })
      .order('account_subtype', { ascending: true })

    if (error) {
      return errorResponse(400, {
        code: 'ACCOUNT_BALANCES_PROJECTION_READ_FAILED',
        message: error.message,
        retryable: true,
      })
    }

    return successResponse(data ?? [])
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request query',
      retryable: false,
    })
  }
}
