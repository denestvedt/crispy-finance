'use client'

import type { TrueLiquidPosition } from '@household-cfo/types'
import { useQuery } from '@tanstack/react-query'

const EMPTY_POSITION: TrueLiquidPosition = {
  gross_cash: 0,
  accrued_liabilities: 0,
  outstanding_credit_balances: 0,
  provisioned_obligations: 0,
  true_liquid_position: 0,
  as_of: new Date(0).toISOString(),
}

export function usePosition(householdId: string) {
  return useQuery({
    queryKey: ['projection', 'position', householdId],
    enabled: Boolean(householdId),
    staleTime: 15_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const response = await fetch(`/api/projections/position?${params.toString()}`, { method: 'GET' })

      if (!response.ok) return EMPTY_POSITION
      const payload = (await response.json()) as { ok: boolean; data?: TrueLiquidPosition }
      return payload.ok ? (payload.data ?? EMPTY_POSITION) : EMPTY_POSITION
    },
  })
}
