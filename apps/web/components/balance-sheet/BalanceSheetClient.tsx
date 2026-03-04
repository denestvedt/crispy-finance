'use client'

import { useAccountSubtypeBalances } from '@/lib/queries/useAccountSubtypeBalances'
import type { AccountSubtypeBalanceProjection } from '@/lib/queries/useAccountSubtypeBalances'

function fmt(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function sumCents(rows: AccountSubtypeBalanceProjection[]): number {
  return rows.reduce((s, r) => s + r.balance_cents, 0)
}

function SectionRow({ label, cents, indent = false }: { label: string; cents: number; indent?: boolean }) {
  return (
    <tr className="border-t border-slate-800">
      <td className={`py-1.5 text-sm ${indent ? 'pl-6 text-slate-300' : 'font-medium text-slate-100'}`}>{label}</td>
      <td className={`py-1.5 text-right font-mono text-sm tabular-nums ${cents < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
        {fmt(cents)}
      </td>
    </tr>
  )
}

function SubtotalRow({ label, cents }: { label: string; cents: number }) {
  return (
    <tr className="border-t-2 border-slate-600">
      <td className="py-2 text-sm font-semibold text-slate-100">{label}</td>
      <td className={`py-2 text-right font-mono text-sm font-semibold tabular-nums ${cents < 0 ? 'text-rose-400' : 'text-emerald-300'}`}>
        {fmt(cents)}
      </td>
    </tr>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
      <table className="w-full">
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function BalanceSheetClient({ householdId }: { householdId: string }) {
  const { data, isLoading, isError } = useAccountSubtypeBalances(householdId)

  if (isLoading) return <p className="text-slate-400">Loading balance sheet…</p>
  if (isError) return <p className="rounded border border-rose-700 bg-rose-950 p-3 text-rose-200">Failed to load balance sheet.</p>
  if (!data || data.length === 0) {
    return <p className="text-slate-400">No account data yet. Connect a bank account or add manual entries to get started.</p>
  }

  const byType = (type: string) => data.filter((r) => r.account_type === type)
  const bySubtype = (type: string, subtype: string) => data.filter((r) => r.account_type === type && r.account_subtype === subtype)

  const assets = byType('asset')
  const liabilities = byType('liability')
  const equity = byType('equity')
  const income = byType('income')
  const expenses = byType('expense')

  const cashEquiv = bySubtype('asset', 'cash_equivalent')
  const nearLiquid = bySubtype('asset', 'near_liquid')
  const illiquid = bySubtype('asset', 'illiquid')
  const totalAssets = sumCents(assets)

  const currentLiab = bySubtype('liability', 'current_liability')
  const accruedLiab = bySubtype('liability', 'accrued_liability')
  const longTermLiab = bySubtype('liability', 'long_term_liability')
  const mortgage = bySubtype('liability', 'mortgage')
  const totalLiabilities = sumCents(liabilities)

  const retainedEquity = sumCents(bySubtype('equity', 'retained_equity'))
  const currentPeriodResult = sumCents(income) - sumCents(expenses)
  const totalEquity = retainedEquity + currentPeriodResult

  const asOf = data[0]?.updated_at ? new Date(data[0].updated_at).toLocaleString() : 'now'

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">As of {asOf}</p>

      {/* Assets */}
      <Section title="Assets">
        {cashEquiv.length > 0 && (
          <>
            <SectionRow label="Cash & cash equivalents" cents={sumCents(cashEquiv)} />
          </>
        )}
        {nearLiquid.length > 0 && <SectionRow label="Near-liquid assets" cents={sumCents(nearLiquid)} />}
        {illiquid.length > 0 && <SectionRow label="Illiquid assets" cents={sumCents(illiquid)} />}
        <SubtotalRow label="Total Assets" cents={totalAssets} />
      </Section>

      {/* Liabilities */}
      <Section title="Liabilities">
        {currentLiab.length > 0 && <SectionRow label="Current liabilities (credit cards)" cents={sumCents(currentLiab)} />}
        {accruedLiab.length > 0 && <SectionRow label="Accrued liabilities" cents={sumCents(accruedLiab)} />}
        {longTermLiab.length > 0 && <SectionRow label="Long-term liabilities" cents={sumCents(longTermLiab)} />}
        {mortgage.length > 0 && <SectionRow label="Mortgage" cents={sumCents(mortgage)} />}
        <SubtotalRow label="Total Liabilities" cents={totalLiabilities} />
      </Section>

      {/* Equity */}
      <Section title="Equity">
        <SectionRow label="Retained equity" cents={retainedEquity} />
        <SectionRow label="Current period result" cents={currentPeriodResult} />
        <SubtotalRow label="Total Equity" cents={totalEquity} />
      </Section>

      {/* Accounting equation check */}
      <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-400">
        <span className="font-mono">
          Assets ({fmt(totalAssets)}) = Liabilities ({fmt(totalLiabilities)}) + Equity ({fmt(totalEquity)})
        </span>
        {' '}
        {Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 2 ? (
          <span className="text-emerald-400">✓ balanced</span>
        ) : (
          <span className="text-amber-400">⚠ difference: {fmt(totalAssets - totalLiabilities - totalEquity)}</span>
        )}
      </div>
    </div>
  )
}
