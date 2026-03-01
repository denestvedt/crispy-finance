'use client'

import { useMemo, useState } from 'react'

import type { LedgerEntry } from '@/lib/queries/useLedgerEntries'

const ROW_HEIGHT = 56
const VIEWPORT_HEIGHT = 560
const OVERSCAN = 8

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function VirtualizedLedgerTable({ entries }: { entries: LedgerEntry[] }) {
  const [scrollTop, setScrollTop] = useState(0)

  const [startIndex, endIndex, offsetTop] = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + OVERSCAN * 2
    const end = Math.min(entries.length, start + visibleCount)
    return [start, end, start * ROW_HEIGHT] as const
  }, [entries.length, scrollTop])

  const visibleRows = entries.slice(startIndex, endIndex)
  const totalHeight = entries.length * ROW_HEIGHT

  return (
    <div
      className="max-h-[560px] overflow-auto rounded-lg border border-slate-800"
      style={{ height: VIEWPORT_HEIGHT }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {visibleRows.map((entry) => (
            <div
              key={entry.id}
              className="grid h-14 grid-cols-[120px_120px_1fr_140px_120px_100px] items-center border-b border-slate-800 bg-slate-900 px-3 text-sm"
            >
              <span className="text-slate-300">{formatDate(entry.entry_date)}</span>
              <span className="text-slate-400">{formatDate(entry.effective_date)}</span>
              <span className="truncate text-slate-200">{entry.description}</span>
              <span className="capitalize text-slate-300">{entry.entry_type.replaceAll('_', ' ')}</span>
              <span className="capitalize text-slate-400">{entry.source.replaceAll('_', ' ')}</span>
              <span className={entry.is_posted ? 'text-emerald-300' : 'text-amber-300'}>{entry.is_posted ? 'Posted' : 'Pending'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
