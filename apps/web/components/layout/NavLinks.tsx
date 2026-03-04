'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Route } from 'next'

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/accounts', label: 'Accounts' },
  { path: '/balance-sheet', label: 'Balance Sheet' },
  { path: '/transactions', label: 'Transactions' },
  { path: '/obligations', label: 'Obligations' },
  { path: '/documents', label: 'Documents' },
  { path: '/close', label: 'Close' },
  { path: '/household', label: 'Household' },
  { path: '/notifications', label: 'Notifications' },
]

export function NavLinks() {
  const pathname = usePathname()

  return (
    <ul className="flex gap-1 overflow-x-auto">
      {navItems.map((item) => {
        const isActive = pathname === item.path
        return (
          <li key={item.path}>
            <Link
              href={item.path as Route}
              className={`block whitespace-nowrap px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'border-b-2 border-blue-500 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
