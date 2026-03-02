'use client'

import dynamic from 'next/dynamic'

import { TrueLiquidPositionCard } from '@/components/position/TrueLiquidPositionCard'
import { EmptyState, ErrorState, LoadingState, ModuleCard } from '@/components/dashboard/ModuleState'
import { LazyChartViewport } from '@/components/dashboard/LazyChartViewport'
import { useAccountSubtypeBalances } from '@/lib/queries/useAccountSubtypeBalances'
import { usePosition } from '@/lib/queries/usePosition'
import { useRealtimeStatus } from '@/lib/queries/useRealtimeStatus'
import { useUnreadNotificationCount } from '@/lib/queries/useUnreadNotificationCount'

const PositionTrendChart = dynamic(
  () => import('@/components/dashboard/PositionTrendChart').then((mod) => mod.PositionTrendChart),
  {
    ssr: false,
    loading: () => <p className="text-sm text-slate-500">Loading chart module…</p>,
  },
)

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID ?? ''

function moneyFromCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
}

export default function DashboardPage() {
  const position = usePosition(HOUSEHOLD_ID)
  const balances = useAccountSubtypeBalances(HOUSEHOLD_ID)
  const unreadCount = useUnreadNotificationCount(HOUSEHOLD_ID)
  const realtime = useRealtimeStatus()

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="rounded-md border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-200">
        Demo data
      </div>
      <p className={`text-xs ${realtime.isOnline ? 'text-emerald-300' : 'text-amber-300'}`}>{realtime.modeLabel}</p>

      <ModuleCard title="True liquid position">
        {position.isLoading && <LoadingState label="position" />}
        {position.isError && <ErrorState message="Failed to load current position." />}
        {!position.isLoading && !position.isError && !position.data && <EmptyState message="No position snapshot available yet." />}
        {position.data && (
          <>
            <TrueLiquidPositionCard position={position.data} />
            <LazyChartViewport>
              <PositionTrendChart position={position.data} />
            </LazyChartViewport>
          </>
        )}
      </ModuleCard>

      <ModuleCard title="Unread notifications">
        {unreadCount.isLoading && <LoadingState label="notifications" />}
        {unreadCount.isError && <ErrorState message="Unable to load notification projection." />}
        {unreadCount.data && <p className="financial-number text-3xl font-semibold">{unreadCount.data.unread_count}</p>}
      </ModuleCard>

      <ModuleCard title="Account balances by subtype">
        {balances.isLoading && <LoadingState label="account balances" />}
        {balances.isError && <ErrorState message="Could not load account balances." />}
        {balances.data && balances.data.length > 0 && (
          <ul className="space-y-1 text-sm text-slate-300">
            {balances.data.slice(0, 6).map((item) => (
              <li key={`${item.account_type}-${item.account_subtype}-${item.liquidity_tier ?? 'none'}`} className="flex justify-between">
                <span>{item.account_type} / {item.account_subtype}</span>
                <span className="financial-number">{moneyFromCents(item.balance_cents)}</span>
              </li>
            ))}
          </ul>
        )}
        {balances.data && balances.data.length === 0 && <EmptyState message="No projected balances yet." />}
      </ModuleCard>
    </section>
  )
}
