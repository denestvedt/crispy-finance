'use client'

import { useMemo } from 'react'

import { VirtualizedLedgerTable } from '@/components/ledger/VirtualizedLedgerTable'
import { useLedgerEntries } from '@/lib/queries/useLedgerEntries'
import type { LedgerEntriesResponse } from '@/lib/queries/useLedgerEntries'

const HOUSEHOLD_ID = process.env.NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID ?? ''

export default function TransactionsPage() {
  const ledger = useLedgerEntries(HOUSEHOLD_ID)

  const entries = useMemo(
    () => (ledger.data?.pages as LedgerEntriesResponse[] | undefined)?.flatMap((page) => page.items) ?? [],
    [ledger.data?.pages],
  )

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>

      {!HOUSEHOLD_ID && <p className="rounded border border-amber-700 bg-amber-950 p-3 text-amber-200">Set NEXT_PUBLIC_DEFAULT_HOUSEHOLD_ID to load ledger data.</p>}
      {ledger.isLoading && <p className="text-slate-400">Loading transaction ledger…</p>}
      {ledger.isError && <p className="rounded border border-rose-700 bg-rose-950 p-3 text-rose-200">Could not load the ledger. Retry once connectivity is restored.</p>}
      {!ledger.isLoading && !ledger.isError && entries.length === 0 && <p className="text-slate-400">No transactions recorded yet.</p>}

      {entries.length > 0 && <VirtualizedLedgerTable entries={entries} />}

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-2 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => ledger.fetchNextPage()}
          disabled={!ledger.hasNextPage || ledger.isFetchingNextPage}
        >
          {ledger.isFetchingNextPage ? 'Loading more…' : ledger.hasNextPage ? 'Load older transactions' : 'End of ledger'}
        </button>

        {ledger.isFetching && !ledger.isFetchingNextPage && <span className="text-xs text-slate-500">Refreshing…</span>}
      </div>
    </section>
  )
}
