import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: existingMembership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  if (existingMembership) {
    return NextResponse.json({ ok: true })
  }

  const body = (await request.json().catch(() => ({}))) as { displayName?: string }
  const displayName = body.displayName?.trim() || user.user_metadata.full_name || user.email || 'Owner'

  const householdName = `${displayName.split(' ')[0] ?? 'My'} Household`

  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({ name: householdName })
    .select('id')
    .single()

  if (householdError || !household) {
    return NextResponse.json({ error: householdError?.message ?? 'Could not create household' }, { status: 500 })
  }

  const { error: memberInsertError } = await supabase.from('household_members').insert({
    household_id: household.id,
    user_id: user.id,
    role: 'owner',
    display_name: displayName,
  })

  if (memberInsertError) {
    return NextResponse.json({ error: memberInsertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, householdId: household.id })
}
