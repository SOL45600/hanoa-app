import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  console.log('[Supabase] URL:', url ? url.slice(0, 30) + '...' : 'MISSING')
  console.log('[Supabase] KEY:', key ? key.slice(0, 20) + '...' : 'MISSING')
  return createBrowserClient(url!, key!)
}
