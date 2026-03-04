'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Obligation {
  id: string
  name: string
  obligation_type: 'recurring' | 'irregular' | 'contingent'
  estimated_amount: number
  frequency: string | null
  probability: number
  next_due_date: string | null
  is_active: boolean
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function DueBadge({ dueDate }: { dueDate: string | null }) {
  const days = daysUntil(dueDate)
  if (days === null) return <span className="text-slate-500">No date</span>
  if (days < 0) return <span className="rounded bg-rose-900 px-1.5 py-0.5 text-xs text-rose-200">Overdue</span>
  if (days <= 7) return <span className="rounded bg-amber-900 px-1.5 py-0.5 text-xs text-amber-200">Due in {days}d</span>
  if (days <= 30) return <span className="rounded bg-yellow-900 px-1.5 py-0.5 text-xs text-yellow-200">Due in {days}d</span>
  return <span className="text-slate-400 text-xs">Due in {days}d</span>
}

function AddObligationForm({
  householdId,
  onSuccess,
}: {
  householdId: string
  onSuccess: () => void
}) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    name: '',
    obligation_type: 'recurring' as 'recurring' | 'irregular' | 'contingent',
    frequency: 'monthly',
    estimated_amount: '',
    probability: '1',
    next_due_date: '',
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/obligations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          ...form,
          estimated_amount: parseFloat(form.estimated_amount),
          probability: parseFloat(form.probability),
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } }
        throw new Error(body.error?.message ?? 'Failed to add obligation')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['obligations', householdId] })
      onSuccess()
      setForm({ name: '', obligation_type: 'recurring', frequency: 'monthly', estimated_amount: '', probability: '1', next_due_date: '' })
    },
    onError: (e: Error) => setError(e.message),
  })

  return (
    <form
      onSubmit={(ev) => { ev.preventDefault(); setError(null); mutation.mutate() }}
      className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
    >
      <h3 className="text-sm font-semibold text-slate-200">Add obligation</h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs text-slate-400">
          Name
          <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          Type
          <select value={form.obligation_type} onChange={(e) => setForm((f) => ({ ...f, obligation_type: e.target.value as typeof form.obligation_type }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
            <option value="recurring">Recurring</option>
            <option value="irregular">Irregular</option>
            <option value="contingent">Contingent</option>
          </select>
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          Frequency
          <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annual">Annual</option>
            <option value="one_time">One time</option>
          </select>
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          Estimated amount ($)
          <input required type="number" step="0.01" min="0.01" value={form.estimated_amount}
            onChange={(e) => setForm((f) => ({ ...f, estimated_amount: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
        </label>

        {form.obligation_type === 'contingent' && (
          <label className="block space-y-1 text-xs text-slate-400">
            Probability (0–1)
            <input type="number" step="0.01" min="0" max="1" value={form.probability}
              onChange={(e) => setForm((f) => ({ ...f, probability: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
          </label>
        )}

        <label className="block space-y-1 text-xs text-slate-400">
          Next due date
          <input type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
        </label>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      <button type="submit" disabled={mutation.isPending}
        className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
        {mutation.isPending ? 'Adding…' : 'Add obligation'}
      </button>
    </form>
  )
}

export function ObligationsClient({ householdId }: { householdId: string }) {
  const [tab, setTab] = useState<'library' | 'calendar'>('library')
  const [showForm, setShowForm] = useState(false)

  const { data, isLoading, isError } = useQuery<Obligation[]>({
    queryKey: ['obligations', householdId],
    enabled: Boolean(householdId),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId, is_active: 'true' })
      const res = await fetch(`/api/obligations?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: Obligation[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  const obligations = data ?? []
  const now = new Date().toISOString().slice(0, 10)
  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const calendarItems = obligations
    .filter((o) => o.next_due_date && o.next_due_date >= now && o.next_due_date <= in90Days)
    .sort((a, b) => (a.next_due_date ?? '').localeCompare(b.next_due_date ?? ''))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex rounded-lg border border-slate-700 p-0.5">
          {(['library', 'calendar'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-3 py-1.5 text-sm capitalize transition ${tab === t ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
          {showForm ? 'Cancel' : '+ Add obligation'}
        </button>
      </div>

      {showForm && <AddObligationForm householdId={householdId} onSuccess={() => setShowForm(false)} />}

      {isLoading && <p className="text-slate-400">Loading obligations…</p>}
      {isError && <p className="rounded border border-rose-700 bg-rose-950 p-3 text-rose-200">Failed to load obligations.</p>}

      {tab === 'library' && !isLoading && (
        <>
          {obligations.length === 0 ? (
            <p className="text-slate-400">No obligations yet. Add one above to begin accrual tracking.</p>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Frequency</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                    <th className="px-4 py-2">Next due</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => (
                    <tr key={o.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                      <td className="px-4 py-2 text-slate-100">{o.name}</td>
                      <td className="px-4 py-2 capitalize text-slate-300">{o.obligation_type}</td>
                      <td className="px-4 py-2 capitalize text-slate-400">{o.frequency?.replaceAll('_', ' ') ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-200">{fmt(o.estimated_amount)}</td>
                      <td className="px-4 py-2 text-slate-300">{fmtDate(o.next_due_date)}</td>
                      <td className="px-4 py-2"><DueBadge dueDate={o.next_due_date} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'calendar' && !isLoading && (
        <>
          <p className="text-xs text-slate-500">Next 90 days</p>
          {calendarItems.length === 0 ? (
            <p className="text-slate-400">No obligations due in the next 90 days.</p>
          ) : (
            <div className="space-y-2">
              {calendarItems.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{o.name}</p>
                    <p className="text-xs text-slate-400 capitalize">{o.obligation_type} · {o.frequency?.replaceAll('_', ' ')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-slate-200">{fmt(o.estimated_amount)}</p>
                    <DueBadge dueDate={o.next_due_date} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
