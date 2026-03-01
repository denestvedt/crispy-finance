'use client'

import { useQuery } from '@tanstack/react-query'

export interface AccountSubtypeBalanceProjection {
  account_type: string
  account_subtype: string
  liquidity_tier: string | null
  balance_cents: number
  updated_at: string
}

export function useAccountSubtypeBalances(householdId: string) {
  return useQuery({
    queryKey: ['projection', 'account-subtype-balances', householdId],
    enabled: Boolean(householdId),
    staleTime: 30_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const response = await fetch(`/api/projections/account-balances?${params.toString()}`, { method: 'GET' })

      if (!response.ok) return [] as AccountSubtypeBalanceProjection[]
      const payload = (await response.json()) as { ok: boolean; data?: AccountSubtypeBalanceProjection[] }
      return payload.ok ? (payload.data ?? []) : []
    },
  })
}
