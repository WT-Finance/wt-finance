import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// As RPCs da Estante (0272) não estão no `database.ts` gerado — que está CONGELADO desde
// ~v4.29. Mesma convenção de patrimônio/acervo/metas: helper de tipagem frouxa, e o SHAPE
// do retorno validado por `parseRpc` no call-site.
//
// ⚠️ O `.call(db, …)` não é enfeite: `SupabaseClient.rpc` é método de PROTÓTIPO cujo corpo é
// `this.rest.rpc(...)`. Guardar a referência numa variável DESTACA o método e o `this` vira
// undefined em runtime (custou 18 dias de solicitações perdidas na v5.3.5).
export function rpcEstante(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
