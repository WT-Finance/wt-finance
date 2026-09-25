import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { tokenMaquina } from '@/lib/auth/credencial-maquina'

// Cliente da credencial de máquina que APLICA as cargas (v6.0.0/M5).
//
// Por que existe, e por que não é `getAdminClient()`: o `service_role` é chave-mestra — ignora
// `app.exigir_acesso` (tem ramo TRUSTED explícito) e alcança todo o banco. Foi exatamente essa
// superfície que o incidente de 10/09/2026 transformou em 306 mil linhas apagadas: numa
// plataforma em que a RPC é a porta de escrita, chamar função sem saber o que ela faz com a
// chave-mestra é executar comando arbitrário.
//
// A role `ingestor` (0274) é o oposto disso: `EXECUTE` só nas RPCs do pipeline das cinco bases,
// allowlist DERIVADA do código (`rpcs-ingestor.ts` → `scripts/credencial/derivar-allowlist.mjs`),
// nenhuma leitura de negócio, nenhum `truncar_*` de base viva, e **nenhum acesso ao schema `raw`**
// — ela só alcança as RPCs, que são `SECURITY DEFINER`. Medido em 22/09 assumindo a identidade:
// com `SET LOCAL ROLE ingestor` + claims do JWT, um `SELECT` direto em `raw.*` volta
// `permission denied for schema raw`, e a mesma sessão aplica a carga inteira pela RPC.
//
// FAIL-CLOSED de propósito: sem `SUPABASE_INGESTOR_SENHA` isto LANÇA, com a mensagem operacional
// que `tokenMaquina` já produz. Cair de volta no `service_role` seria desfazer a versão inteira
// em silêncio, no exato momento em que a proteção mais importa — e "sem dado" nunca deve ser o
// resultado de um erro de configuração (a mesma regra que `tokenMaquina` documenta).

type ClienteIngestor = ReturnType<typeof createClient<Database>>

/** Token de máquina cacheado por `tokenMaquina`; o cliente é recriado quando o token muda, o que
 *  na prática acontece uma vez por hora (validade do access token do Auth). */
let cache: { token: string; cliente: ClienteIngestor } | null = null

/**
 * Cliente Supabase autenticado como `ingestor@janus.interno`, cujo token carrega
 * `role=ingestor` (posto lá pelo `custom_access_token_hook`, migration 0275) — é esse claim que
 * o PostgREST usa no `SET ROLE`, e é dele que valem os `GRANT` da allowlist.
 */
export async function getIngestorClient(): Promise<ClienteIngestor> {
  const token = await tokenMaquina('ingestor')
  if (cache && cache.token === token) return cache.cliente

  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!rawUrl || !anonKey) {
    throw new Error(
      'SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórios ' +
      'para a credencial de ingestão. Ver docs/runbooks/credenciais-maquina-runbook.md.',
    )
  }

  const cliente = createClient<Database>(rawUrl.replace(/\/(rest\/v1\/?)?$/, ''), anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  cache = { token, cliente }
  return cliente
}
