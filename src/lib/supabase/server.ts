import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type ServerClient = ReturnType<typeof createClient<Database>>
let _client: ServerClient | null = null

export function getServerClient(): ServerClient {
  if (_client) return _client

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!rawUrl || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.'
    )
  }

  const supabaseUrl = rawUrl.replace(/\/(rest\/v1\/?)?$/, '')

  _client = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false },
  })
  return _client
}
