import type { User } from '@supabase/supabase-js'

import type { createClient } from '@/lib/supabase/server'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

type EnsureHouseholdMembershipOptions = {
  displayName?: string
}

type EnsureHouseholdMembershipResult = {
  householdId: string
  created: boolean
}

async function findExistingMembership(supabase: SupabaseServerClient, userId: string) {
  const { data: existingMembership, error: membershipError } = await supabase
    .from('household_members')
    .select('household_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  return existingMembership
}

export async function ensureHouseholdMembership(
  supabase: SupabaseServerClient,
  user: User,
  options: EnsureHouseholdMembershipOptions = {},
): Promise<EnsureHouseholdMembershipResult> {
  const existingMembership = await findExistingMembership(supabase, user.id)
  if (existingMembership) {
    return { householdId: existingMembership.household_id, created: false }
  }

  const displayName = options.displayName?.trim() || user.user_metadata.full_name || user.email || 'Owner'
  const firstName = displayName.split(' ')[0] || 'My'

  const { data: household, error: householdError } = await supabase
    .from('households')
    .insert({ name: `${firstName} Household` })
    .select('id')
    .single()

  if (householdError || !household) {
    throw new Error(householdError?.message ?? 'Could not create household')
  }

  const { error: memberInsertError } = await supabase.from('household_members').insert({
    household_id: household.id,
    user_id: user.id,
    role: 'owner',
    display_name: displayName,
  })

  if (memberInsertError) {
    const membershipAfterError = await findExistingMembership(supabase, user.id)
    if (membershipAfterError) {
      return { householdId: membershipAfterError.household_id, created: false }
    }

    throw new Error(memberInsertError.message)
  }

  return { householdId: household.id, created: true }
}
