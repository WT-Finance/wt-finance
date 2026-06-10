import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// v4.13 (ADR-0109): cliente POR REQUEST, ciente da sessão em cookies httpOnly.
// As RPCs passam a correr com o JWT do usuário (role `authenticated`, timeout 8s)
// em vez de `anon` (3s) — pré-requisito do enforcement no banco (ADR-0108).
// Em RSC, gravar cookie é proibido pelo Next — o setAll engole o erro (o refresh
// de sessão é responsabilidade do middleware; aqui só LEMOS a sessão corrente).

export type ServerClient = ReturnType<typeof createServerClient<Database>>

export async function getServerClient(): Promise<ServerClient> {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!rawUrl || !anonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios.'
    )
  }

  const supabaseUrl = rawUrl.replace(/\/(rest\/v1\/?)?$/, '')
  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server Component: cookies são read-only — o middleware cuida do refresh.
        }
      },
    },
  })
}
