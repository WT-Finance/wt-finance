import 'server-only' // M15 (v4.17.0): cliente service_role NUNCA pode vazar p/ o bundle client — falha o build se importado em componente client.
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Lazy singleton: o cliente só é criado na primeira chamada a getAdminClient().
// Isso garante que as env vars estejam carregadas antes da inicialização,
// independente da ordem de imports no script seed.

type AdminClient = ReturnType<typeof createClient<Database>>
let _client: AdminClient | null = null

export function getAdminClient(): AdminClient {
  if (_client) return _client

  const rawUrl =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!rawUrl || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY são obrigatórios. ' +
      'Verifique o arquivo .env.local.'
    )
  }

  const supabaseUrl = rawUrl.replace(/\/(rest\/v1\/?)?$/, '')

  _client = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })
  return _client
}
