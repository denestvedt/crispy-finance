'use client'

import type { ReactNode } from 'react'

export function ModuleCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase text-slate-400">{title}</p>
      <div className="mt-2">{children}</div>
    </article>
  )
}

export function LoadingState({ label }: { label: string }) {
  return <p className="text-sm text-slate-400">Loading {label}…</p>
}

export function ErrorState({ message }: { message: string }) {
  return <p className="rounded border border-rose-700 bg-rose-950 p-2 text-sm text-rose-200">{message}</p>
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-500">{message}</p>
}
