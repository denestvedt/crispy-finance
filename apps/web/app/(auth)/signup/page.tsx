'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const supabase = createClient()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    const {
      data: { session },
      error: signUpError,
    } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!session) {
      setNotice('Account created. Check your inbox to verify your email, then log in.')
      setLoading(false)
      return
    }

    const bootstrapResponse = await fetch('/api/auth/bootstrap-household', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: fullName }),
    })

    if (!bootstrapResponse.ok) {
      const body = (await bootstrapResponse.json().catch(() => null)) as { error?: string } | null
      setError(body?.error ?? 'Signed up, but failed to initialize your household.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <main className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Create account</h1>
      <form onSubmit={onSubmit} className="space-y-3 rounded-md border border-slate-800 p-4">
        <label className="block space-y-1 text-sm">
          <span>Full name</span>
          <input
            required
            type="text"
            autoComplete="name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-2"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>

      <p className="text-sm text-slate-400">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-400 hover:text-blue-300">
          Log in
        </Link>
      </p>
    </main>
  )
}
