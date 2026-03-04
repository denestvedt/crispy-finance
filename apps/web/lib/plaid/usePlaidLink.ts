'use client'

import { useState, useCallback } from 'react'
import { usePlaidLink as useReactPlaidLink } from 'react-plaid-link'

interface UsePlaidLinkOptions {
  householdId: string
  onSuccess?: (createdAccountCount: number) => void
  onError?: (message: string) => void
}

export function usePlaidLink({ householdId, onSuccess, onError }: UsePlaidLinkOptions) {
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLinkToken = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId }),
      })
      const body = (await res.json()) as { ok: boolean; data?: { link_token: string }; error?: { message: string } }
      if (!body.ok || !body.data) throw new Error(body.error?.message ?? 'Failed to get link token')
      setLinkToken(body.data.link_token)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to start Plaid link'
      setError(msg)
      onError?.(msg)
    } finally {
      setLoading(false)
    }
  }, [householdId, onError])

  const { open, ready } = useReactPlaidLink({
    token: linkToken,
    onSuccess: async (publicToken) => {
      setLoading(true)
      try {
        const res = await fetch('/api/plaid/exchange', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ household_id: householdId, public_token: publicToken }),
        })
        const body = (await res.json()) as { ok: boolean; data?: { created_account_count: number }; error?: { message: string } }
        if (!body.ok) throw new Error(body.error?.message ?? 'Token exchange failed')
        onSuccess?.(body.data?.created_account_count ?? 0)
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to connect bank account'
        setError(msg)
        onError?.(msg)
      } finally {
        setLoading(false)
        setLinkToken(null)
      }
    },
    onExit: () => setLinkToken(null),
  })

  const startLink = useCallback(async () => {
    if (linkToken && ready) {
      open()
    } else {
      await fetchLinkToken()
    }
  }, [linkToken, ready, open, fetchLinkToken])

  // Auto-open when token is ready
  if (linkToken && ready) {
    open()
  }

  return { startLink, loading, error }
}
