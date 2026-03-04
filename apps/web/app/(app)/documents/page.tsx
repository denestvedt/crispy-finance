import { createClient } from '@/lib/supabase/server'
import { DocumentsClient } from '@/components/documents/DocumentsClient'

export default async function DocumentsPage() {
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
      <h1 className="text-xl font-semibold">Documents</h1>
      {householdId ? (
        <DocumentsClient householdId={householdId} />
      ) : (
        <p className="text-slate-400">No household found. Complete sign-up to continue.</p>
      )}
    </section>
  )
}
