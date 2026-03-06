import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, hasServiceRoleEnv } from '@/lib/supabase/admin'
import { ensureHouseholdMembershipAsAdmin } from '@/lib/supabase/ensure-household-admin'
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

    if (hasServiceRoleEnv()) {
      try {
        const admin = createAdminClient()
        const result = await ensureHouseholdMembershipAsAdmin(admin, user, { displayName: body.displayName })
        return NextResponse.json({ ok: true, householdId: result.householdId, created: result.created })
      } catch (adminError) {
        const adminMessage = adminError instanceof Error ? adminError.message : 'Unable to initialize household'
        return NextResponse.json({ error: adminMessage }, { status: 500 })
      }
    }

    const isRlsInsertBlock = message.toLowerCase().includes('row-level security policy')
    if (isRlsInsertBlock) {
      return NextResponse.json(
        {
          error:
            'Household setup is blocked by database RLS policy. In Vercel, set SUPABASE_SERVICE_ROLE_KEY under Project Settings → Environment Variables for this deployment environment (Preview/Production), redeploy, or apply migration supabase/migrations/011_household_insert_policy.sql.',
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
