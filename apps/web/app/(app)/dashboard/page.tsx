import { DashboardClient } from '@/components/dashboard/DashboardClient'
import { ModuleCard } from '@/components/dashboard/ModuleState'
import { createClient } from '@/lib/supabase/server'

type HouseholdRef = { name: string } | { name: string }[] | null

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role, display_name, households(name)')
    .eq('user_id', user?.id ?? '')
    .maybeSingle()

  const householdId = membership?.household_id ?? ''
  const householdRecord = membership?.households as HouseholdRef
  const householdName = Array.isArray(householdRecord)
    ? householdRecord[0]?.name
    : householdRecord?.name

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <ModuleCard title="Household loaded">
        {!membership && <p className="text-sm text-slate-400">No household found yet.</p>}
        {membership && (
          <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-slate-400">Household</dt>
              <dd className="font-medium text-white">{householdName ?? 'Unnamed household'}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Household ID</dt>
              <dd className="font-mono text-xs text-white">{householdId}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Member</dt>
              <dd className="font-medium text-white">{membership.display_name}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Role</dt>
              <dd className="font-medium capitalize text-white">{membership.role}</dd>
            </div>
          </dl>
        )}
      </ModuleCard>

      {householdId ? <DashboardClient householdId={householdId} /> : null}
    </section>
  )
}
