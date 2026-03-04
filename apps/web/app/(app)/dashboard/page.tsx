import Link from 'next/link'
import type { Route } from 'next'

import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { createClient } from '@/lib/supabase/server'
import { ensureHouseholdMembership } from '@/lib/supabase/ensure-household'

type HouseholdRef = { name: string } | { name: string }[] | null

const quickLinks = [
  {
    path: '/accounts',
    title: 'Accounts',
    description: 'Connect banks and manage financial accounts',
    accent: 'border-l-blue-500',
  },
  {
    path: '/balance-sheet',
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity snapshot',
    accent: 'border-l-emerald-500',
  },
  {
    path: '/transactions',
    title: 'Transactions',
    description: 'Browse and manually record journal entries',
    accent: 'border-l-violet-500',
  },
  {
    path: '/obligations',
    title: 'Obligations',
    description: 'Track recurring bills and upcoming due dates',
    accent: 'border-l-amber-500',
  },
  {
    path: '/close',
    title: 'Period Close',
    description: 'Close the accounting period and reset P&L',
    accent: 'border-l-rose-500',
  },
  {
    path: '/household',
    title: 'Household',
    description: 'Members, pay schedule, and home valuation',
    accent: 'border-l-teal-500',
  },
]

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    await ensureHouseholdMembership(supabase, user).catch(() => {
      // Non-fatal: membership may already exist or be created by a race
    })
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, display_name, created_at, households(name)')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const householdId = membership?.household_id ?? ''
  const householdRecord = membership?.households as HouseholdRef
  const householdName = Array.isArray(householdRecord) ? householdRecord[0]?.name : householdRecord?.name
  const displayName = membership?.display_name

  return (
    <div className="space-y-8">
      {/* Welcome header */}
      <div className="border-b border-slate-800 pb-6">
        <h1 className="text-2xl font-semibold text-white">
          {displayName ? `Welcome back, ${displayName}` : 'Dashboard'}
        </h1>
        {householdName && (
          <p className="mt-1 text-sm text-slate-400">{householdName}</p>
        )}
        {!householdId && (
          <p className="mt-3 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
            Your household is being set up — refresh the page in a moment.
          </p>
        )}
      </div>

      {/* Financial modules */}
      {householdId && <DashboardClient householdId={householdId} />}

      {/* Quick access */}
      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Quick access
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.path}
              href={link.path as Route}
              className={`group rounded-lg border border-l-2 border-slate-800 bg-slate-900 p-4 transition-colors hover:border-slate-700 hover:bg-slate-800/60 ${link.accent}`}
            >
              <p className="text-sm font-medium text-slate-100 group-hover:text-white">
                {link.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
