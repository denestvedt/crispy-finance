'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

interface MemberRecord {
  household_id: string
  role: string
  display_name: string
  pay_schedule: string | null
  pay_day_1: number | null
  pay_day_2: number | null
  gross_annual_salary: number
  households: { name: string } | { name: string }[] | null
}

interface HouseholdMember {
  id: string
  user_id: string
  role: string
  display_name: string
  pay_schedule: string | null
  gross_annual_salary: number
  created_at: string
}

interface HomeValuation {
  id: string
  estimated_value: number
  valuation_date: string
  notes: string | null
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </div>
  )
}

function PayScheduleForm({ householdId, member }: { householdId: string; member: MemberRecord }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    display_name: member.display_name,
    pay_schedule: member.pay_schedule ?? 'biweekly',
    pay_day_1: String(member.pay_day_1 ?? 1),
    pay_day_2: String(member.pay_day_2 ?? 15),
    gross_annual_salary: String(member.gross_annual_salary ?? 0),
  })
  const [success, setSuccess] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/household/member', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          display_name: form.display_name,
          pay_schedule: form.pay_schedule,
          pay_day_1: parseInt(form.pay_day_1),
          pay_day_2: form.pay_schedule === 'semimonthly' ? parseInt(form.pay_day_2) : null,
          gross_annual_salary: parseFloat(form.gross_annual_salary),
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } }
        throw new Error(body.error?.message ?? 'Update failed')
      }
    },
    onSuccess: () => {
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['household-members', householdId] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs text-slate-400">
          Display name
          <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          Pay schedule
          <select value={form.pay_schedule} onChange={(e) => setForm((f) => ({ ...f, pay_schedule: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100">
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="semimonthly">Semimonthly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          {form.pay_schedule === 'semimonthly' ? 'Pay day 1 (day of month)' : 'Pay day (day of month)'}
          <input type="number" min="1" max="28" value={form.pay_day_1}
            onChange={(e) => setForm((f) => ({ ...f, pay_day_1: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
        </label>

        {form.pay_schedule === 'semimonthly' && (
          <label className="block space-y-1 text-xs text-slate-400">
            Pay day 2 (day of month)
            <input type="number" min="1" max="28" value={form.pay_day_2}
              onChange={(e) => setForm((f) => ({ ...f, pay_day_2: e.target.value }))}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
          </label>
        )}

        <label className="block space-y-1 text-xs text-slate-400">
          Gross annual salary ($)
          <input type="number" step="1000" min="0" value={form.gross_annual_salary}
            onChange={(e) => setForm((f) => ({ ...f, gross_annual_salary: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={mutation.isPending}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {success && <span className="text-xs text-emerald-400">Saved</span>}
        {mutation.isError && <span className="text-xs text-rose-400">{(mutation.error as Error).message}</span>}
      </div>
    </form>
  )
}

function HomeValuationForm({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ estimated_value: '', notes: '' })
  const [success, setSuccess] = useState(false)

  const latest = useQuery<HomeValuation | null>({
    queryKey: ['home-valuation', householdId],
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/household/home-valuation?${params}`)
      if (!res.ok) return null
      const body = (await res.json()) as { ok: boolean; data?: HomeValuation }
      return body.ok ? (body.data ?? null) : null
    },
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/household/home-valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          estimated_value: parseFloat(form.estimated_value),
          notes: form.notes || null,
        }),
      })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } }
        throw new Error(body.error?.message ?? 'Failed to save valuation')
      }
    },
    onSuccess: () => {
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['home-valuation', householdId] })
      setTimeout(() => setSuccess(false), 3000)
    },
  })

  return (
    <div className="space-y-3">
      {latest.data && (
        <p className="text-sm text-slate-300">
          Current value: <span className="font-mono">{fmt(latest.data.estimated_value)}</span>
          <span className="ml-2 text-xs text-slate-500">as of {new Date(latest.data.valuation_date).toLocaleDateString()}</span>
        </p>
      )}

      <form onSubmit={(e) => { e.preventDefault(); mutation.mutate() }} className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-xs text-slate-400">
          New estimated value ($)
          <input required type="number" step="1000" min="0" value={form.estimated_value}
            onChange={(e) => setForm((f) => ({ ...f, estimated_value: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 font-mono" />
        </label>

        <label className="block space-y-1 text-xs text-slate-400">
          Notes (optional)
          <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100" />
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={mutation.isPending}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-60">
            {mutation.isPending ? 'Saving…' : 'Update home value'}
          </button>
          {success && <span className="text-xs text-emerald-400">Saved</span>}
          {mutation.isError && <span className="text-xs text-rose-400">{(mutation.error as Error).message}</span>}
        </div>
      </form>
    </div>
  )
}

export function HouseholdClient({
  householdId,
  currentMembership,
}: {
  householdId: string
  currentMembership: MemberRecord | null
}) {
  const householdName =
    Array.isArray(currentMembership?.households)
      ? currentMembership?.households[0]?.name
      : (currentMembership?.households as { name: string } | null)?.name

  const members = useQuery<HouseholdMember[]>({
    queryKey: ['household-members', householdId],
    enabled: Boolean(householdId),
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/household/members?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: HouseholdMember[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-slate-400 text-sm">
        Household: <span className="text-slate-100 font-medium">{householdName ?? 'Unnamed'}</span>
        <span className="ml-2 text-slate-600">({householdId})</span>
      </p>

      {currentMembership && (
        <SectionCard title="My pay schedule &amp; salary">
          <PayScheduleForm householdId={householdId} member={currentMembership} />
        </SectionCard>
      )}

      <SectionCard title="Home valuation">
        <p className="text-xs text-slate-500">
          Manually update your home&apos;s estimated market value for the balance sheet.
        </p>
        <HomeValuationForm householdId={householdId} />
      </SectionCard>

      <SectionCard title="Members">
        {members.isLoading && <p className="text-sm text-slate-400">Loading members…</p>}
        {members.data && members.data.length > 0 && (
          <div className="space-y-2">
            {members.data.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded border border-slate-800 px-3 py-2 text-sm">
                <div>
                  <span className="text-slate-100">{m.display_name}</span>
                  <span className="ml-2 text-xs text-slate-500 capitalize">{m.role}</span>
                </div>
                {m.gross_annual_salary > 0 && (
                  <span className="font-mono text-xs text-slate-400">{fmt(m.gross_annual_salary)}/yr</span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-slate-500">
          To invite a second member, share your household ID: <span className="font-mono text-slate-400">{householdId}</span>
        </p>
      </SectionCard>
    </div>
  )
}
