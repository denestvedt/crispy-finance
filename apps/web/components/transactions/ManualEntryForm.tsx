'use client'

import { useCallback, useId, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

type AccountRow = {
  id: string
  name: string
  account_type: string
  account_subtype: string
}

type JournalLine = {
  id: string
  account_id: string
  amount_cents: number
  side: 'debit' | 'credit'
  memo: string
}

function amountToCents(value: string): number {
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) return 0
  return Math.round(n * 100)
}

function centsToDollar(cents: number): string {
  if (!cents) return ''
  return (cents / 100).toFixed(2)
}

function newLine(side: 'debit' | 'credit'): JournalLine {
  return { id: crypto.randomUUID(), account_id: '', amount_cents: 0, side, memo: '' }
}

function sumSide(lines: JournalLine[], side: 'debit' | 'credit'): number {
  return lines.filter((l) => l.side === side).reduce((acc, l) => acc + l.amount_cents, 0)
}

export function ManualEntryForm({
  householdId,
  onSuccess,
}: {
  householdId: string
  onSuccess?: () => void
}) {
  const uid = useId()
  const queryClient = useQueryClient()

  const [description, setDescription] = useState('')
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().split('T')[0])
  const [lines, setLines] = useState<JournalLine[]>([newLine('debit'), newLine('credit')])
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Fetch accounts for dropdowns
  const { data: accounts = [] } = useQuery<AccountRow[]>({
    queryKey: ['accounts', householdId],
    queryFn: () =>
      fetch(`/api/accounts?household_id=${householdId}`)
        .then((r) => r.json())
        .then((r) => r.data ?? []),
  })

  const totalDebits = useMemo(() => sumSide(lines, 'debit'), [lines])
  const totalCredits = useMemo(() => sumSide(lines, 'credit'), [lines])
  const isBalanced = totalDebits > 0 && totalDebits === totalCredits

  const updateLine = useCallback((id: string, patch: Partial<JournalLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }, [])

  const addLine = useCallback((side: 'debit' | 'credit') => {
    setLines((prev) => [...prev, newLine(side)])
  }, [])

  const removeLine = useCallback((id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
  }, [])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        household_id: householdId,
        entry_date: entryDate,
        description,
        entry_type: 'adjustment',
        source: 'manual',
        lines: lines.map(({ account_id, amount_cents, side, memo }) => ({
          account_id,
          amount_cents,
          side,
          ...(memo ? { memo } : {}),
        })),
        idempotency_key: crypto.randomUUID(),
      }
      const res = await fetch('/api/journal/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error?.message ?? 'Failed to post entry')
      return json.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ledger-entries', householdId] })
      setDescription('')
      setEntryDate(new Date().toISOString().split('T')[0])
      setLines([newLine('debit'), newLine('credit')])
      setSubmitError(null)
      onSuccess?.()
    },
    onError: (err: Error) => {
      setSubmitError(err.message)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isBalanced) return
    if (!description.trim()) return
    if (lines.some((l) => !l.account_id)) {
      setSubmitError('All lines must have an account selected.')
      return
    }
    setSubmitError(null)
    mutation.mutate()
  }

  const imbalance = totalDebits - totalCredits

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-700 bg-slate-900 p-4">
      <h2 className="font-semibold text-slate-100">New Manual Journal Entry</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${uid}-desc`} className="block text-xs text-slate-400">
            Description <span className="text-rose-400">*</span>
          </label>
          <input
            id={`${uid}-desc`}
            type="text"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Rent payment June"
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-date`} className="block text-xs text-slate-400">
            Entry Date
          </label>
          <input
            id={`${uid}-date`}
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>

      {/* Journal lines */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_110px_auto_32px] gap-2 text-xs font-medium text-slate-500">
          <span>Account</span>
          <span>Side</span>
          <span>Amount ($)</span>
          <span>Memo</span>
          <span />
        </div>

        {lines.map((line) => (
          <JournalLineRow
            key={line.id}
            line={line}
            accounts={accounts}
            onChange={updateLine}
            onRemove={lines.length > 2 ? removeLine : undefined}
          />
        ))}
      </div>

      {/* Add line buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => addLine('debit')}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-400"
        >
          + Debit line
        </button>
        <button
          type="button"
          onClick={() => addLine('credit')}
          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-sky-600 hover:text-sky-400"
        >
          + Credit line
        </button>
      </div>

      {/* Balance indicator */}
      <div className="flex items-center gap-4 rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm">
        <span className="text-slate-400">
          Debits: <span className="font-mono text-slate-200">${centsToDollar(totalDebits) || '0.00'}</span>
        </span>
        <span className="text-slate-400">
          Credits: <span className="font-mono text-slate-200">${centsToDollar(totalCredits) || '0.00'}</span>
        </span>
        <span className="ml-auto">
          {isBalanced ? (
            <span className="font-medium text-emerald-400">✓ Balanced</span>
          ) : imbalance !== 0 ? (
            <span className="font-medium text-rose-400">
              {imbalance > 0 ? 'Debit' : 'Credit'} excess: ${centsToDollar(Math.abs(imbalance))}
            </span>
          ) : null}
        </span>
      </div>

      {submitError && (
        <p className="rounded border border-rose-700 bg-rose-950 px-3 py-2 text-sm text-rose-300">{submitError}</p>
      )}

      {mutation.isSuccess && (
        <p className="rounded border border-emerald-700 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          Journal entry posted successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={!isBalanced || !description.trim() || mutation.isPending}
        className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {mutation.isPending ? 'Posting…' : 'Post Entry'}
      </button>
    </form>
  )
}

function JournalLineRow({
  line,
  accounts,
  onChange,
  onRemove,
}: {
  line: JournalLine
  accounts: AccountRow[]
  onChange: (id: string, patch: Partial<JournalLine>) => void
  onRemove?: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-[1fr_1fr_110px_auto_32px] items-center gap-2">
      <select
        value={line.account_id}
        onChange={(e) => onChange(line.id, { account_id: e.target.value })}
        required
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <option value="">Select account…</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <select
        value={line.side}
        onChange={(e) => onChange(line.id, { side: e.target.value as 'debit' | 'credit' })}
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
      >
        <option value="debit">Debit</option>
        <option value="credit">Credit</option>
      </select>

      <input
        type="number"
        min="0.01"
        step="0.01"
        value={line.amount_cents ? (line.amount_cents / 100).toFixed(2) : ''}
        onChange={(e) => onChange(line.id, { amount_cents: amountToCents(e.target.value) })}
        placeholder="0.00"
        className="rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-right font-mono text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />

      <input
        type="text"
        value={line.memo}
        onChange={(e) => onChange(line.id, { memo: e.target.value })}
        placeholder="optional"
        className="min-w-0 rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
      />

      <button
        type="button"
        onClick={() => onRemove?.(line.id)}
        disabled={!onRemove}
        className="flex h-6 w-6 items-center justify-center rounded text-slate-600 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-20"
        title="Remove line"
      >
        ×
      </button>
    </div>
  )
}
