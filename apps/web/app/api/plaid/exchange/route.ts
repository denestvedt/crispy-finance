import { z } from 'zod'
import type { PlaidExchangeRequest, PlaidExchangeResponse } from '@household-cfo/types'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid(),
  public_token: z.string().min(1),
  plaid_transaction_ids: z.array(z.string().min(1)).default([]),
  idempotency_key: z.string().min(8),
}) satisfies z.ZodType<PlaidExchangeRequest>

export async function POST(req: Request) {
  try {
    const payload = await parseJson(req, schema)
    const supabase = await createClient()

    const accepted: string[] = []
    const duplicates: string[] = []

    for (const transactionId of payload.plaid_transaction_ids) {
      const { data, error } = await supabase.rpc('post_journal_entry', {
        p_household_id: payload.household_id,
        p_entry_date: null,
        p_effective_date: null,
        p_description: `Plaid import ${transactionId}`,
        p_entry_type: 'transaction',
        p_source: 'plaid',
        p_lines: [
          { account_id: '11111111-1111-1111-1111-111111111111', amount_cents: 1, side: 'debit' },
          { account_id: '22222222-2222-2222-2222-222222222222', amount_cents: 1, side: 'credit' },
        ],
        p_idempotency_key: `${payload.idempotency_key}:${transactionId}`,
      })

      if (error) {
        return errorResponse(400, {
          code: 'PLAID_EXCHANGE_FAILED',
          message: error.message,
          retryable: false,
        })
      }

      if (data?.[0]?.replayed) duplicates.push(transactionId)
      else accepted.push(transactionId)
    }

    return successResponse<PlaidExchangeResponse>({
      accepted_transaction_ids: accepted,
      duplicate_transaction_ids: duplicates,
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
