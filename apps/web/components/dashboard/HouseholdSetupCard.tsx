'use client'

import { useState } from 'react'

export function HouseholdSetupCard() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retrySetup() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/bootstrap-household', { method: 'POST' })
      const body = (await res.json().catch(() => ({}))) as { error?: string }

      if (!res.ok) {
        throw new Error(body.error ?? 'Unable to initialize your household.')
      }

      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to initialize your household.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-700/40 bg-amber-950/20 p-4">
      <p className="text-sm text-amber-200">Your household setup is incomplete, so budgeting modules are hidden right now.</p>
      <p className="text-xs text-amber-300/80">
        Click below to finish setup. If this keeps failing in Vercel Preview/Production, add
        <span className="font-mono"> SUPABASE_SERVICE_ROLE_KEY </span>
        under Project Settings → Environment Variables for that environment and redeploy.
      </p>

      <button
        type="button"
        onClick={retrySetup}
        disabled={loading}
        className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-60"
      >
        {loading ? 'Initializing…' : 'Finish household setup'}
      </button>

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  )
}
