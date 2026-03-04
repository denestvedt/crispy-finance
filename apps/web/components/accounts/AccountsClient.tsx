'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlaidLink } from '@/lib/plaid/usePlaidLink'

interface Account {
  id: string
  name: string
  account_type: string
  account_subtype: string
  liquidity_tier: string | null
  current_balance: number
  is_system: boolean
  plaid_item_id: string | null
}

interface PlaidItem {
  id: string
  plaid_item_id: string
  institution_name: string | null
  status: 'active' | 'error' | 'disconnected'
  last_synced_at: string | null
  error_code: string | null
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function StatusBadge({ status }: { status: PlaidItem['status'] }) {
  if (status === 'active') return <span className="rounded bg-emerald-900 px-1.5 py-0.5 text-xs text-emerald-200">Active</span>
  if (status === 'error') return <span className="rounded bg-rose-900 px-1.5 py-0.5 text-xs text-rose-200">Error</span>
  return <span className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300">Disconnected</span>
}

function ConnectBankButton({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const { startLink, loading, error } = usePlaidLink({
    householdId,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts', householdId] })
      queryClient.invalidateQueries({ queryKey: ['plaid-items', householdId] })
    },
  })

  return (
    <div className="space-y-1">
      <button
        onClick={startLink}
        disabled={loading}
        className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60 hover:bg-blue-500"
      >
        {loading ? 'Connecting…' : 'Connect bank account'}
      </button>
      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}

export function AccountsClient({ householdId }: { householdId: string }) {
  const accounts = useQuery<Account[]>({
    queryKey: ['accounts', householdId],
    enabled: Boolean(householdId),
    staleTime: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/accounts?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: Account[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  const plaidItems = useQuery<PlaidItem[]>({
    queryKey: ['plaid-items', householdId],
    enabled: Boolean(householdId),
    staleTime: 60_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/plaid/items?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: PlaidItem[] }
      return body.ok ? (body.data ?? []) : []
    },
  })

  const accountList = accounts.data ?? []
  const plaidList = plaidItems.data ?? []

  // Group accounts by account_type
  const byType = (type: string) => accountList.filter((a) => a.account_type === type)
  const assetTotal = byType('asset').reduce((s, a) => s + a.current_balance, 0)
  const liabilityTotal = byType('liability').reduce((s, a) => s + a.current_balance, 0)

  return (
    <div className="space-y-6">
      {/* Bank connections */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-300">Bank connections</h2>
          <ConnectBankButton householdId={householdId} />
        </div>

        {plaidItems.isLoading && <p className="text-sm text-slate-400">Loading connections…</p>}
        {plaidList.length === 0 && !plaidItems.isLoading && (
          <p className="text-sm text-slate-400">No bank accounts connected. Click "Connect bank account" to link via Plaid.</p>
        )}
        {plaidList.length > 0 && (
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800">
            {plaidList.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{item.institution_name ?? 'Unknown institution'}</p>
                  {item.last_synced_at && (
                    <p className="text-xs text-slate-500">
                      Last synced {new Date(item.last_synced_at).toLocaleString()}
                    </p>
                  )}
                  {item.error_code && <p className="text-xs text-rose-400">Error: {item.error_code}</p>}
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">
          Accounts
          {accountList.length > 0 && (
            <span className="ml-2 text-slate-500 font-normal">
              {accountList.length} total
            </span>
          )}
        </h2>

        {accounts.isLoading && <p className="text-sm text-slate-400">Loading accounts…</p>}
        {accounts.isError && <p className="rounded border border-rose-700 bg-rose-950 p-3 text-sm text-rose-200">Failed to load accounts.</p>}

        {!accounts.isLoading && accountList.length === 0 && (
          <p className="text-sm text-slate-400">No accounts yet. Connect a bank account to see your accounts here.</p>
        )}

        {accountList.length > 0 && (
          <>
            {(['asset', 'liability'] as const).map((type) => {
              const items = byType(type)
              if (items.length === 0) return null
              return (
                <div key={type} className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 capitalize">{type}s</h3>
                    <span className={`font-mono text-sm ${type === 'liability' ? 'text-rose-400' : 'text-emerald-300'}`}>
                      {fmt(type === 'asset' ? assetTotal : liabilityTotal)}
                    </span>
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {items.map((acct) => (
                        <tr key={acct.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-4 py-2.5 text-slate-100">{acct.name}</td>
                          <td className="px-4 py-2.5 text-slate-400 capitalize text-xs">{acct.account_subtype.replaceAll('_', ' ')}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-slate-200">{fmt(acct.current_balance)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {acct.plaid_item_id ? (
                              <span className="text-xs text-slate-500">Plaid</span>
                            ) : (
                              <span className="text-xs text-slate-600">Manual</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}
