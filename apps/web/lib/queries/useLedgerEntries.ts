'use client'

import { useInfiniteQuery } from '@tanstack/react-query'

export interface LedgerEntry {
  id: string
  entry_date: string
  effective_date: string
  description: string
  entry_type: string
  source: string
  is_posted: boolean
  created_at: string
}

export interface LedgerEntriesResponse {
  items: LedgerEntry[]
  next_cursor: string | null
  page_size: number
}

export function useLedgerEntries(householdId: string, pageSize = 40) {
  return useInfiniteQuery({
    queryKey: ['ledger', 'entries', householdId, pageSize],
    enabled: Boolean(householdId),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage: LedgerEntriesResponse) => lastPage.next_cursor,
    queryFn: async ({ pageParam }: { pageParam: string | null }): Promise<LedgerEntriesResponse> => {
      const params = new URLSearchParams({
        household_id: householdId,
        page_size: String(pageSize),
      })

      if (pageParam) {
        params.set('cursor', pageParam)
      }

      const response = await fetch(`/api/ledger/entries?${params.toString()}`, { method: 'GET' })

      if (!response.ok) {
        throw new Error(`Failed to fetch ledger entries (${response.status})`)
      }

      const payload = (await response.json()) as { ok: boolean; data?: LedgerEntriesResponse }
      if (!payload.ok || !payload.data) {
        throw new Error('Failed to fetch ledger entries')
      }

      return payload.data
    },
  })
}
