import { CountryCode, Products } from 'plaid'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getPlaidClient } from '@/lib/plaid/client'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'

const schema = z.object({
  household_id: z.string().uuid(),
})

export async function POST(req: Request) {
  try {
    const { household_id } = await parseJson(req, schema)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return errorResponse(401, { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false })
    }

    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', household_id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership) {
      return errorResponse(403, { code: 'FORBIDDEN', message: 'Not a member of this household', retryable: false })
    }

    const plaid = getPlaidClient()
    const webhookUrl = process.env.PLAID_WEBHOOK_URL

    const response = await plaid.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: 'Household CFO',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
      ...(webhookUrl ? { webhook: webhookUrl } : {}),
    })

    return successResponse({ link_token: response.data.link_token })
  } catch (error) {
    return errorResponse(500, {
      code: 'LINK_TOKEN_FAILED',
      message: error instanceof Error ? error.message : 'Failed to create Plaid link token',
      retryable: false,
    })
  }
}
