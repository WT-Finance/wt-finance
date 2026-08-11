import type { ServerClient } from '@/lib/supabase/server'
import type { getBrowserClient } from '@/lib/supabase/client'
import type { RpcLike } from '@/lib/rpc'

// As RPCs de Metas (migration 0175) não estão no database.ts gerado — mesma
// convenção de acervo/faturamento/solicitações, que chamam RPCs novas por um
// helper de tipagem frouxa em vez de regenerar/editar o database.ts. O SHAPE do
// retorno é validado por parseRpc no call-site (metasListarSchema etc.).

// SupabaseClient<Database, "public"> em ambos (createServerClient/createBrowserClient
// têm a mesma assinatura de retorno) — a união só documenta que o Comparativo (v5.6.1,
// client) chama esta mesma função com o client de browser, sem duplicar o helper.
type BrowserClient = ReturnType<typeof getBrowserClient>

export function rpcMetas(
  db: ServerClient | BrowserClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
