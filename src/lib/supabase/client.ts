'use client'

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

let _client: ReturnType<typeof createClient<Database>> | null = null

export function getBrowserClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/(rest\/v1\/?)?$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  _client = createClient<Database>(url, key, { auth: { persistSession: false } })
  return _client
}
