'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID ?? ''

interface ClosePeriodResponse {
  close_entry_id: string | null
  replayed: boolean
  net_income_cents: number
}

export default function ClosePage() {
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const idempotencyKey = useMemo(
    () => `close-${HOUSEHOLD_ID}-${periodEnd}`,
    [periodEnd],
  )

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/close/period', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          household_id: HOUSEHOLD_ID,
          period_end: periodEnd,
          idempotency_key: idempotencyKey,
        }),
      })

      if (!response.ok) {
        throw new Error(`Close request failed (${response.status})`)
      }

      const payload = (await response.json()) as { ok: boolean; data?: ClosePeriodResponse }
      if (!payload.ok || !payload.data) {
        throw new Error('Close request failed')
      }

      return payload.data
    },
    onMutate: async () => {
      // Safe optimistic UI because close operation is idempotent via key.
      setOptimisticMessage(`Close requested for ${periodEnd}.`)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projection', 'position', HOUSEHOLD_ID] })
      setOptimisticMessage(null)
    },
  })

  return (
    <section className="space-y-3">
      <h1 className="text-xl font-semibold">Close period</h1>

      <label className="block space-y-2 text-sm">
        <span className="text-slate-300">Period end</span>
        <input
          type="date"
          value={periodEnd}
          onChange={(event) => setPeriodEnd(event.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
      </label>

      <button
        type="button"
        onClick={() => closeMutation.mutate()}
        disabled={!HOUSEHOLD_ID || closeMutation.isPending}
        className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
      >
        {closeMutation.isPending ? 'Closing period…' : 'Run period close'}
      </button>

      {optimisticMessage && <p className="text-emerald-300">{optimisticMessage}</p>}
      {closeMutation.isError && <p className="text-rose-300">Unable to close period. Reconcile and retry.</p>}
      {closeMutation.data && (
        <p className="text-slate-300">
          Posted close entry {closeMutation.data.close_entry_id ?? 'n/a'} ({closeMutation.data.replayed ? 'replayed' : 'new'}).
        </p>
      )}
    </section>
  )
}
