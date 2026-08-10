import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// As RPCs do Inventário de Ativos (migration 0248) não estão no `database.ts` gerado — que
// está CONGELADO desde ~v4.29. Mesma convenção de acervo/faturamento/solicitações/metas:
// helper de tipagem frouxa, e o SHAPE do retorno validado por `parseRpc` no call-site.
//
// ⚠️ O `.call(db, …)` não é enfeite: `SupabaseClient.rpc` é método de PROTÓTIPO cujo corpo é
// `this.rest.rpc(...)`. Guardar a referência numa variável DESTACA o método e o `this` vira
// undefined em runtime (corpo de classe é sempre strict) — foi o que custou 18 dias de
// solicitações de acesso perdidas na v5.3.5. Parênteses preservam; atribuição destrói.
export function rpcPatrimonio(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
