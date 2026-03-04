'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

interface ClosePeriodResponse {
  close_entry_id: string | null
  replayed: boolean
  net_income_cents: number
}

interface AccountSubtypeBalance {
  account_type: string
  account_subtype: string
  balance_cents: number
}

type Step = 'review' | 'reconcile' | 'confirm' | 'report'

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function StepIndicator({ current, steps }: { current: Step; steps: Step[] }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const idx = steps.indexOf(current)
        const isComplete = i < idx
        const isActive = step === current
        return (
          <div key={step} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border
              ${isComplete ? 'bg-emerald-700 border-emerald-600 text-white' : ''}
              ${isActive ? 'bg-blue-700 border-blue-500 text-white' : ''}
              ${!isComplete && !isActive ? 'border-slate-700 text-slate-500' : ''}`}>
              {isComplete ? '✓' : i + 1}
            </div>
            <span className={`text-sm capitalize ${isActive ? 'text-white' : 'text-slate-500'}`}>{step}</span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-slate-700" />}
          </div>
        )
      })}
    </div>
  )
}

export default function ClosePage() {
  const queryClient = useQueryClient()
  const [householdId, setHouseholdId] = useState('')
  const [step, setStep] = useState<Step>('review')
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10))
  const [confirmed, setConfirmed] = useState(false)
  const [closeResult, setCloseResult] = useState<ClosePeriodResponse | null>(null)

  // Fetch household ID on mount
  const _ = useQuery({
    queryKey: ['close-household-id'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (data?.household_id) setHouseholdId(data.household_id)
      return data?.household_id ?? null
    },
  })

  const balances = useQuery<AccountSubtypeBalance[]>({
    queryKey: ['projection', 'account-subtype-balances', householdId],
    enabled: Boolean(householdId),
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/projections/account-balances?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: AccountSubtypeBalance[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  const unpostedCount = useQuery<number>({
    queryKey: ['unposted-entries', householdId],
    enabled: Boolean(householdId) && step === 'reconcile',
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/ledger/entries?${params}&is_posted=false`)
      if (!res.ok) return 0
      const body = (await res.json()) as { ok: boolean; data?: { items: unknown[] } }
      return body.ok ? (body.data?.items?.length ?? 0) : 0
    },
  })

  const idempotencyKey = useMemo(() => `close-${householdId}-${periodEnd}`, [householdId, periodEnd])

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/close/period', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          period_end: periodEnd,
          idempotency_key: idempotencyKey,
        }),
      })
      if (!response.ok) throw new Error(`Close request failed (${response.status})`)
      const payload = (await response.json()) as { ok: boolean; data?: ClosePeriodResponse }
      if (!payload.ok || !payload.data) throw new Error('Close request returned error')
      return payload.data
    },
    onSuccess: (data) => {
      setCloseResult(data)
      setStep('report')
      queryClient.invalidateQueries({ queryKey: ['projection', 'position', householdId] })
      queryClient.invalidateQueries({ queryKey: ['projection', 'account-subtype-balances', householdId] })
    },
  })

  const allBalances = balances.data ?? []
  const incomeTotal = allBalances.filter((b) => b.account_type === 'income').reduce((s, b) => s + b.balance_cents, 0)
  const expenseTotal = allBalances.filter((b) => b.account_type === 'expense').reduce((s, b) => s + b.balance_cents, 0)
  const netIncome = incomeTotal - expenseTotal

  const STEPS: Step[] = ['review', 'reconcile', 'confirm', 'report']

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Period Close</h1>
        <p className="mt-1 text-sm text-slate-400">
          A deliberate ritual to record period results and reset for the next period.
        </p>
      </div>

      <StepIndicator current={step} steps={STEPS} />

      {/* Step 1: Review */}
      {step === 'review' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Review period</h2>

          <label className="block space-y-1 text-sm text-slate-400">
            Period end date
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
              className="mt-1 block rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" />
          </label>

          {balances.isLoading && <p className="text-sm text-slate-400">Loading period summary…</p>}

          {!balances.isLoading && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Period summary</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Total income</p>
                  <p className="font-mono text-emerald-300">{fmt(incomeTotal)}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Total expenses</p>
                  <p className="font-mono text-rose-300">{fmt(expenseTotal)}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Net result</p>
                  <p className={`font-mono font-semibold ${netIncome >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                    {fmt(netIncome)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <button onClick={() => setStep('reconcile')} disabled={!householdId}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
            Next: Reconcile →
          </button>
        </div>
      )}

      {/* Step 2: Reconcile */}
      {step === 'reconcile' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Reconcile</h2>
          <p className="text-sm text-slate-400">Check for unposted entries before closing.</p>

          {unpostedCount.isLoading && <p className="text-sm text-slate-400">Checking for unposted items…</p>}

          {!unpostedCount.isLoading && (
            <div className={`rounded-lg border p-4 ${
              (unpostedCount.data ?? 0) > 0
                ? 'border-amber-700 bg-amber-950'
                : 'border-emerald-700 bg-emerald-950'
            }`}>
              {(unpostedCount.data ?? 0) > 0 ? (
                <p className="text-sm text-amber-200">
                  ⚠ {unpostedCount.data} unposted journal {unpostedCount.data === 1 ? 'entry' : 'entries'} found.
                  Review the Transactions page and post or discard before closing.
                </p>
              ) : (
                <p className="text-sm text-emerald-200">✓ No unposted entries. Ready to close.</p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('review')}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              ← Back
            </button>
            <button onClick={() => setStep('confirm')}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white">
              Next: Confirm →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-slate-200">Confirm close</h2>

          <div className="rounded-lg border border-amber-700 bg-amber-950 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-200">⚠ This action is irreversible</p>
            <p className="text-sm text-amber-300">
              Closing the period will zero out all income and expense accounts, roll the net result
              ({fmt(netIncome)}) into retained equity, and take a balance sheet snapshot as of {periodEnd}.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5" />
            <span className="text-sm text-slate-300">
              I understand this close is permanent. I have reviewed the period summary and confirmed
              all entries are reconciled.
            </span>
          </label>

          <div className="flex gap-3">
            <button onClick={() => setStep('reconcile')}
              className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
              ← Back
            </button>
            <button
              onClick={() => closeMutation.mutate()}
              disabled={!confirmed || closeMutation.isPending}
              className="rounded bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-rose-600"
            >
              {closeMutation.isPending ? 'Closing period…' : 'Close period'}
            </button>
          </div>

          {closeMutation.isError && (
            <p className="text-sm text-rose-400">
              {(closeMutation.error as Error).message}. Reconcile unposted entries and retry.
            </p>
          )}
        </div>
      )}

      {/* Step 4: Report */}
      {step === 'report' && closeResult && (
        <div className="space-y-4">
          <h2 className="text-base font-semibold text-emerald-300">✓ Period closed</h2>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Closing report</h3>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500 text-xs">Period end</dt>
                <dd className="text-slate-100 font-medium">{periodEnd}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">Net income for period</dt>
                <dd className={`font-mono font-semibold ${closeResult.net_income_cents >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  {fmt(closeResult.net_income_cents)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">Close entry ID</dt>
                <dd className="font-mono text-xs text-slate-300">{closeResult.close_entry_id ?? 'n/a'}</dd>
              </div>
              <div>
                <dt className="text-slate-500 text-xs">Status</dt>
                <dd className="text-slate-100">{closeResult.replayed ? 'Replayed (already closed)' : 'Newly closed'}</dd>
              </div>
            </dl>

            <p className="text-xs text-slate-500">
              Balance sheet snapshot taken. Income and expense accounts reset to zero.
              Net result applied to retained equity.
            </p>
          </div>

          <button
            onClick={() => { setStep('review'); setCloseResult(null); setConfirmed(false) }}
            className="rounded border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            Close another period
          </button>
        </div>
      )}
    </section>
  )
}
