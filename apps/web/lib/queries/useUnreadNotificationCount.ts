'use client'

import { useQuery } from '@tanstack/react-query'

interface UnreadProjectionResponse {
  unread_count: number
  updated_at: string | null
}

const EMPTY_UNREAD: UnreadProjectionResponse = {
  unread_count: 0,
  updated_at: null,
}

export function useUnreadNotificationCount(householdId: string) {
  return useQuery({
    queryKey: ['projection', 'notifications', 'unread', householdId],
    enabled: Boolean(householdId),
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const response = await fetch(`/api/projections/notifications/unread-count?${params.toString()}`, { method: 'GET' })

      if (!response.ok) return EMPTY_UNREAD
      const payload = (await response.json()) as { ok: boolean; data?: UnreadProjectionResponse }
      return payload.ok ? (payload.data ?? EMPTY_UNREAD) : EMPTY_UNREAD
    },
  })
}
