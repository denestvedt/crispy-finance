'use client'

import { TrueLiquidPositionCard } from '@/components/position/TrueLiquidPositionCard'
import { useAccountSubtypeBalances } from '@/lib/queries/useAccountSubtypeBalances'
import { usePosition } from '@/lib/queries/usePosition'
import { useUnreadNotificationCount } from '@/lib/queries/useUnreadNotificationCount'

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID ?? ''

function moneyFromCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
}

export default function DashboardPage() {
  const position = usePosition(HOUSEHOLD_ID)
  const balances = useAccountSubtypeBalances(HOUSEHOLD_ID)
  const unreadCount = useUnreadNotificationCount(HOUSEHOLD_ID)

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <TrueLiquidPositionCard position={position.data ?? {
        gross_cash: 0,
        accrued_liabilities: 0,
        outstanding_credit_balances: 0,
        provisioned_obligations: 0,
        true_liquid_position: 0,
        as_of: new Date(0).toISOString(),
      }} />

      <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase text-slate-400">Unread notifications</p>
        <p className="financial-number mt-2 text-3xl font-semibold">{unreadCount.data?.unread_count ?? 0}</p>
      </article>

      <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs uppercase text-slate-400">Account balances by subtype</p>
        <ul className="mt-2 space-y-1 text-sm text-slate-300">
          {(balances.data ?? []).slice(0, 6).map((item) => (
            <li key={`${item.account_type}-${item.account_subtype}-${item.liquidity_tier ?? 'none'}`} className="flex justify-between">
              <span>{item.account_type} / {item.account_subtype}</span>
              <span className="financial-number">{moneyFromCents(item.balance_cents)}</span>
            </li>
          ))}
          {(balances.data?.length ?? 0) === 0 && <li className="text-slate-500">No projected balances yet.</li>}
        </ul>
      </article>
    </section>
  )
}
