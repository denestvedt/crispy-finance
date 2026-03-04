import { AccountType as PlaidAccountType, AccountSubtype as PlaidAccountSubtype, CountryCode } from 'plaid'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'
import { getPlaidClient } from '@/lib/plaid/client'
import { errorResponse, parseJson, successResponse } from '@/app/api/_lib/contracts'
import type { AccountSubtype, AccountType, LiquidityTier } from '@household-cfo/types'

const schema = z.object({
  household_id: z.string().uuid(),
  public_token: z.string().min(1),
})

/** Map a Plaid account type/subtype to our chart-of-accounts fields. */
function mapPlaidAccount(
  type: string,
  subtype: string | null,
): { account_type: AccountType; account_subtype: AccountSubtype; liquidity_tier: LiquidityTier | null } {
  if (type === PlaidAccountType.Depository) {
    return { account_type: 'asset', account_subtype: 'cash_equivalent', liquidity_tier: 'cash_equivalent' }
  }
  if (type === PlaidAccountType.Credit) {
    return { account_type: 'liability', account_subtype: 'current_liability', liquidity_tier: null }
  }
  if (type === PlaidAccountType.Loan) {
    const isMortgage = subtype === PlaidAccountSubtype.Mortgage
    return {
      account_type: 'liability',
      account_subtype: isMortgage ? 'mortgage' : 'long_term_liability',
      liquidity_tier: null,
    }
  }
  if (type === PlaidAccountType.Investment) {
    return { account_type: 'asset', account_subtype: 'near_liquid', liquidity_tier: 'near_liquid' }
  }
  return { account_type: 'asset', account_subtype: 'near_liquid', liquidity_tier: 'near_liquid' }
}

export async function POST(req: Request) {
  try {
    const { household_id, public_token } = await parseJson(req, schema)

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

    const exchangeRes = await plaid.itemPublicTokenExchange({ public_token })
    const { access_token, item_id } = exchangeRes.data

    const [itemRes, accountsRes] = await Promise.all([
      plaid.itemGet({ access_token }),
      plaid.accountsGet({ access_token }),
    ])

    const institutionId = itemRes.data.item.institution_id
    let institutionName: string | null = null
    if (institutionId) {
      const instRes = await plaid.institutionsGetById({ institution_id: institutionId, country_codes: [CountryCode.Us] })
      institutionName = instRes.data.institution.name
    }

    const { error: itemUpsertError } = await supabase.from('plaid_items').upsert(
      {
        household_id,
        plaid_item_id: item_id,
        plaid_access_token: access_token,
        institution_name: institutionName,
        status: 'active',
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'plaid_item_id' },
    )

    if (itemUpsertError) {
      return errorResponse(500, { code: 'ITEM_UPSERT_FAILED', message: itemUpsertError.message, retryable: true })
    }

    const createdAccountIds: string[] = []
    for (const plaidAccount of accountsRes.data.accounts) {
      const mapping = mapPlaidAccount(plaidAccount.type, plaidAccount.subtype ?? null)
      const balance = plaidAccount.balances.current ?? 0

      const { data: insertedAccount, error: accountError } = await supabase
        .from('accounts')
        .insert({
          household_id,
          ...mapping,
          name: plaidAccount.name,
          external_account_id: plaidAccount.account_id,
          plaid_item_id: item_id,
          is_system: false,
          current_balance: balance,
        })
        .select('id')
        .single()

      if (accountError) {
        // Account likely already exists — refresh its balance
        await supabase
          .from('accounts')
          .update({ current_balance: balance })
          .eq('external_account_id', plaidAccount.account_id)
          .eq('household_id', household_id)
      } else if (insertedAccount) {
        createdAccountIds.push(insertedAccount.id)
      }
    }

    return successResponse({
      plaid_item_id: item_id,
      institution_name: institutionName,
      created_account_count: createdAccountIds.length,
      created_account_ids: createdAccountIds,
    })
  } catch (error) {
    return errorResponse(500, {
      code: 'EXCHANGE_FAILED',
      message: error instanceof Error ? error.message : 'Token exchange failed',
      retryable: false,
    })
  }
}
