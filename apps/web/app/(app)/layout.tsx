import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Route } from 'next'
import type { ReactNode } from 'react'

import { ensureHouseholdMembership } from '@/lib/supabase/ensure-household'
import { createClient } from '@/lib/supabase/server'

const navItems = [
  'dashboard',
  'balance-sheet',
  'obligations',
  'transactions',
  'documents',
  'close',
  'household',
  'accounts',
  'notifications',
]

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

  return (
    <div className="min-h-screen">
      <nav className="border-b border-slate-800 p-3 text-sm">
        <ul className="flex gap-4">
          {navItems.map((item) => (
            <li key={item}>
              <Link href={`/${item}` as Route} className="text-slate-300 hover:text-white capitalize">
                {item.replace('-', ' ')}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
