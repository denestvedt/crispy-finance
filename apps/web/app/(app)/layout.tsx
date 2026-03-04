import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { ensureHouseholdMembership } from '@/lib/supabase/ensure-household'
import { createClient } from '@/lib/supabase/server'
import { NavLinks } from '@/components/layout/NavLinks'
import { SignOutButton } from '@/components/layout/SignOutButton'

type HouseholdRef = { name: string } | { name: string }[] | null

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  try {
    await ensureHouseholdMembership(supabase, user)
  } catch (error) {
    console.error('Failed to ensure household membership for authenticated user', error)
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('display_name, households(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const displayName = membership?.display_name ?? user.email ?? 'User'
  const householdRef = membership?.households as HouseholdRef
  const householdName = Array.isArray(householdRef) ? householdRef[0]?.name : householdRef?.name

  return (
    <div className="flex min-h-screen flex-col">
      {/* Top header */}
      <header className="border-b border-slate-800 bg-slate-950 px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-white">Household CFO</span>
            {householdName && (
              <>
                <span className="text-slate-700">/</span>
                <span className="text-sm text-slate-400">{householdName}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 hidden sm:block">{displayName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="border-b border-slate-800 bg-slate-900/50 px-4">
        <div className="mx-auto max-w-7xl">
          <NavLinks />
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
