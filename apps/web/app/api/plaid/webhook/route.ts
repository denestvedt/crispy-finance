import { z } from 'zod'
import type { PlaidWebhookRequest, PlaidWebhookResponse } from '@household-cfo/types'

import { createClient } from '@/lib/supabase/server'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid(),
  webhook_event_id: z.string().min(1),
  transaction_amounts_cents: z.array(z.number().int()),
  idempotency_key: z.string().min(8),
}) satisfies z.ZodType<PlaidWebhookRequest>

export async function POST(req: Request) {
  try {
    const payload = await parseJson(req, schema)
    const supabase = await createClient()

    const amount = payload.transaction_amounts_cents.reduce((acc, current) => acc + current, 0)

    const { data, error } = await supabase.rpc('post_journal_entry', {
      p_household_id: payload.household_id,
      p_entry_date: null,
      p_effective_date: null,
      p_description: `Plaid webhook ${payload.webhook_event_id}`,
      p_entry_type: 'transaction',
      p_source: 'plaid',
      p_lines: [
        { account_id: '00000000-0000-0000-0000-000000000000', amount_cents: Math.abs(amount), side: amount >= 0 ? 'debit' : 'credit' },
        { account_id: '00000000-0000-0000-0000-000000000000', amount_cents: Math.abs(amount), side: amount >= 0 ? 'credit' : 'debit' },
      ],
      p_idempotency_key: payload.idempotency_key,
    })

    if (error) {
      return errorResponse(400, {
        code: 'PLAID_WEBHOOK_FAILED',
        message: error.message,
        retryable: false,
      })
    }

    return successResponse<PlaidWebhookResponse>({
      webhook_event_id: payload.webhook_event_id,
      net_amount_cents: amount,
      transaction_count: payload.transaction_amounts_cents.length,
      replayed: Boolean(data?.[0]?.replayed),
    })
  } catch (error) {
    return errorResponse(400, {
      code: 'INVALID_REQUEST',
      message: error instanceof Error ? error.message : 'Invalid request payload',
      retryable: false,
    })
  }
}
