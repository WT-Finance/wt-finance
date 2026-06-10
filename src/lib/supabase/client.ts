'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// v4.13 (ADR-0109): browser client com sessão em cookies (compartilhada com o
// servidor via @supabase/ssr). Client components que chamam RPC direto (drawers)
// carregam o JWT do usuário automaticamente — o guard do banco (ADR-0108) passa
// a valer também para essas chamadas.

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getBrowserClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/(rest\/v1\/?)?$/, '')
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  _client = createBrowserClient<Database>(url, key)
  return _client
}
