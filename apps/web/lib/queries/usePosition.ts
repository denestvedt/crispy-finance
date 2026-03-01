'use client'

import type { TrueLiquidPosition } from '@household-cfo/types'
import { useQuery } from '@tanstack/react-query'

const EMPTY_POSITION: TrueLiquidPosition = {
  gross_cash: 0,
  accrued_liabilities: 0,
  outstanding_credit_balances: 0,
  provisioned_obligations: 0,
  true_liquid_position: 0,
  as_of: new Date(0).toISOString()
}

export function usePosition(householdId: string) {
  return useQuery({
    queryKey: ['position', householdId],
    queryFn: async () => {
      const response = await fetch('/api/position/calculate', {
        method: 'POST',
        body: JSON.stringify({ householdId })
      })

      if (!response.ok) return EMPTY_POSITION
      return (await response.json()) as TrueLiquidPosition
    }
  })
}
