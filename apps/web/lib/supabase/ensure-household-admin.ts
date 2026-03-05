import type { SupabaseClient, User } from '@supabase/supabase-js'

type EnsureHouseholdMembershipResult = {
  householdId: string
  created: boolean
}

async function findExistingMembership(admin: SupabaseClient, userId: string) {
  const { data: existingMembership, error } = await admin
    .from('household_members')
    .select('household_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return existingMembership
}

export async function ensureHouseholdMembershipAsAdmin(
  admin: SupabaseClient,
  user: User,
): Promise<EnsureHouseholdMembershipResult> {
  const existingMembership = await findExistingMembership(admin, user.id)
  if (existingMembership) {
    return { householdId: existingMembership.household_id, created: false }
  }

  const displayName = user.user_metadata.full_name || user.email || 'Owner'
  const firstName = displayName.split(' ')[0] || 'My'

  const { data: household, error: householdError } = await admin
    .from('households')
    .insert({ name: `${firstName} Household` })
    .select('id')
    .single()

  if (householdError || !household) {
    throw new Error(householdError?.message ?? 'Could not create household')
  }

  const { error: memberInsertError } = await admin.from('household_members').insert({
    household_id: household.id,
    user_id: user.id,
    role: 'owner',
    display_name: displayName,
  })

  if (memberInsertError) {
    const membershipAfterError = await findExistingMembership(admin, user.id)
    if (membershipAfterError) {
      return { householdId: membershipAfterError.household_id, created: false }
    }

    throw new Error(memberInsertError.message)
  }

  return { householdId: household.id, created: true }
}
