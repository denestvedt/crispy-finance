import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { ensureHouseholdMembership } from '@/lib/supabase/ensure-household'

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as { displayName?: string }

  try {
    const result = await ensureHouseholdMembership(supabase, user, {
      displayName: body.displayName,
    })

    return NextResponse.json({ ok: true, householdId: result.householdId, created: result.created })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to initialize household'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
