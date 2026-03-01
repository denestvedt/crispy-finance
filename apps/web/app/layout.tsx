import './globals.css'
import type { ReactNode } from 'react'

import { QueryProvider } from '@/components/QueryProvider'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
