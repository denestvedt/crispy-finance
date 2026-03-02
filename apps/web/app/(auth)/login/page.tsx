'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    const bootstrapResponse = await fetch('/api/auth/bootstrap-household', { method: 'POST' })
    if (!bootstrapResponse.ok) {
      const body = (await bootstrapResponse.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? 'Unable to prepare your household workspace.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-slate-800 p-4">
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="text-sm text-slate-400">
        New here?{' '}
        <Link href="/signup" className="text-blue-400 hover:text-blue-300">
          Create an account
        </Link>
      </p>
    </main>
  )
}
