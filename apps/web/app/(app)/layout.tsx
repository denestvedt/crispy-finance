import Link from 'next/link'
import type { ReactNode } from 'react'

const navItems = [
  'dashboard',
  'balance-sheet',
  'obligations',
  'transactions',
  'documents',
  'close',
  'household',
  'accounts',
  'notifications'
]

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-slate-800 p-3 text-sm">
        <ul className="flex gap-4">
          {navItems.map((item) => (
            <li key={item}>
              <Link href={`/${item}`} className="text-slate-300 hover:text-white capitalize">
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
