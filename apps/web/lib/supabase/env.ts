export type SupabaseEnv = {
  url: string
  anonKey: string
}

function coalesce(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value && value.trim()))?.trim() ?? ''
}

export function getSupabaseEnv(): SupabaseEnv {
  const url = coalesce(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_URL)
  const anonKey = coalesce(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  )

  return { url, anonKey }
}

export function hasSupabaseEnv() {
  const { url, anonKey } = getSupabaseEnv()
  return Boolean(url && anonKey)
}
