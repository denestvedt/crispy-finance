'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface Notification {
  id: string
  type: string
  title: string
  body: string
  is_read: boolean
  created_at: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function typeLabel(type: string): string {
  return type.replaceAll('_', ' ')
}

export function NotificationsClient({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery<Notification[]>({
    queryKey: ['notifications', householdId],
    enabled: Boolean(householdId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const params = new URLSearchParams({ household_id: householdId })
      const res = await fetch(`/api/notifications/feed?${params}`)
      if (!res.ok) return []
      const body = (await res.json()) as { ok: boolean; data?: { items: Notification[] } }
      return body.ok ? (body.data?.items ?? []) : []
    },
  })

  const markRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
      if (!res.ok) throw new Error('Failed to mark notification as read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', householdId] })
      queryClient.invalidateQueries({ queryKey: ['projection', 'notifications', 'unread', householdId] })
    },
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId }),
      })
      if (!res.ok) throw new Error('Failed to mark all notifications as read')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', householdId] })
      queryClient.invalidateQueries({ queryKey: ['projection', 'notifications', 'unread', householdId] })
    },
  })

  const notifications = data ?? []
  const unreadCount = notifications.filter((n) => !n.is_read).length

  return (
    <div className="space-y-3 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          {unreadCount > 0 ? (
            <span className="text-amber-300 font-medium">{unreadCount} unread</span>
          ) : (
            'All caught up'
          )}
        </p>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
          >
            Mark all as read
          </button>
        )}
      </div>

      {isLoading && <p className="text-slate-400">Loading notifications…</p>}
      {isError && (
        <p className="rounded border border-rose-700 bg-rose-950 p-3 text-sm text-rose-200">
          Failed to load notifications.
        </p>
      )}

      {!isLoading && notifications.length === 0 && (
        <p className="text-slate-400">No notifications yet.</p>
      )}

      {notifications.length > 0 && (
        <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 bg-slate-900">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-3 px-4 py-3 transition ${n.is_read ? 'opacity-60' : ''}`}
            >
              {!n.is_read && <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />}
              {n.is_read && <div className="mt-1.5 h-2 w-2 flex-shrink-0" />}

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-xs text-slate-500">{timeAgo(n.created_at)}</p>
                    <p className="text-xs text-slate-600 capitalize mt-0.5">{typeLabel(n.type)}</p>
                  </div>
                </div>
              </div>

              {!n.is_read && (
                <button
                  onClick={() => markRead.mutate(n.id)}
                  disabled={markRead.isPending}
                  className="flex-shrink-0 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
                  title="Mark as read"
                >
                  ✓
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
