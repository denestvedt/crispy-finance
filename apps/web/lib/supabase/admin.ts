import { createClient } from '@supabase/supabase-js'

import { getSupabaseEnv } from '@/lib/supabase/env'

function getServiceRoleKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
}

export function hasServiceRoleEnv() {
  const { url } = getSupabaseEnv()
  return Boolean(url && getServiceRoleKey())
}

export function createAdminClient() {
  const { url } = getSupabaseEnv()
  const serviceRoleKey = getServiceRoleKey()

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase admin client is not configured')
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
