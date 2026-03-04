'use client'

import dynamic from 'next/dynamic'
import { useQuery } from '@tanstack/react-query'

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

function moneyFromCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value / 100)
}

type ObligationLite = {
  id: string
  estimated_amount: number
  frequency: string | null
  next_due_date: string | null
}

function expectedMonthlyCost(obligation: ObligationLite): number {
  const base = obligation.estimated_amount
  switch (obligation.frequency) {
    case 'daily':
      return base * 30
    case 'weekly':
      return base * 4.33
    case 'biweekly':
      return base * 2.17
    case 'monthly':
      return base
    case 'quarterly':
      return base / 3
    case 'annual':
      return base / 12
    case 'one_time':
      return 0
    default:
      return base
  }
}

export function DashboardClient({ householdId }: { householdId: string }) {
  const position = usePosition(householdId)
  const balances = useAccountSubtypeBalances(householdId)
  const unreadCount = useUnreadNotificationCount(householdId)
  const realtime = useRealtimeStatus()
  const obligations = useQuery<ObligationLite[]>({
    queryKey: ['obligations', householdId, 'dashboard-budget-snapshot'],
    enabled: Boolean(householdId),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId, is_active: 'true' })
      const res = await fetch(`/api/obligations?${params}`)
      if (!res.ok) {
        return []
      }
      const body = (await res.json()) as { ok: boolean; data?: ObligationLite[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  const monthlyBudgetLoad = Math.round((obligations.data ?? []).reduce((sum, item) => sum + expectedMonthlyCost(item), 0) * 100)
  const upcoming30dCount = (obligations.data ?? []).filter((item) => {
    if (!item.next_due_date) return false
    const dueAt = new Date(item.next_due_date).getTime()
    if (Number.isNaN(dueAt)) return false
    const diffDays = (dueAt - Date.now()) / (1000 * 60 * 60 * 24)
    return diffDays >= 0 && diffDays <= 30
  }).length

  return (
    <>
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

      <ModuleCard title="Budget snapshot">
        {obligations.isLoading && <LoadingState label="budget snapshot" />}
        {obligations.isError && <ErrorState message="Could not load obligations for budget snapshot." />}
        {obligations.data && obligations.data.length > 0 && (
          <dl className="space-y-2 text-sm text-slate-300">
            <div className="flex items-center justify-between">
              <dt>Expected monthly obligations</dt>
              <dd className="financial-number text-base font-semibold text-white">{moneyFromCents(monthlyBudgetLoad)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt>Due in the next 30 days</dt>
              <dd className="financial-number text-base font-semibold text-white">{upcoming30dCount}</dd>
            </div>
          </dl>
        )}
        {obligations.data && obligations.data.length === 0 && (
          <EmptyState message="No obligations yet. Open Obligations to add recurring bills and start budgeting." />
        )}
      </ModuleCard>
    </>
  )
}
