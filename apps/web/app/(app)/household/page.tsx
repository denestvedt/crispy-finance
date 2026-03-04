import { createClient } from '@/lib/supabase/server'
import { HouseholdClient } from '@/components/household/HouseholdClient'

export default async function HouseholdPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role, display_name, pay_schedule, pay_day_1, pay_day_2, gross_annual_salary, households(name)')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const householdId = membership?.household_id ?? ''

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Household Settings</h1>
      {householdId ? (
        <HouseholdClient householdId={householdId} currentMembership={membership} />
      ) : (
        <p className="text-slate-400">No household found.</p>
      )}
    </section>
  )
}
