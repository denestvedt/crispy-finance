import { createClient } from '@/lib/supabase/server'
import { BalanceSheetClient } from '@/components/balance-sheet/BalanceSheetClient'

export default async function BalanceSheetPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user?.id ?? '')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const householdId = membership?.household_id ?? ''

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Balance Sheet</h1>
      {householdId ? (
        <BalanceSheetClient householdId={householdId} />
      ) : (
        <p className="text-slate-400">No household found.</p>
      )}
    </section>
  )
}
