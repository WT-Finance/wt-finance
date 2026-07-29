import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// As RPCs da DRE (migrations 0204–0208) não estão no database.ts gerado (congelado
// ~v4.29) — mesma convenção de metas/acervo/faturamento: helper de tipagem frouxa
// que casta UMA vez e devolve {data:unknown,error}; o SHAPE é validado por parseRpc
// (schemas.ts deste módulo) no call-site, com caso vivo em rpc-contrato.test.ts.
export function rpcDre(
  db: ServerClient,
  fn: string,
  args: Record<string, unknown> = {},
): Promise<RpcLike> {
  const call = db.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<RpcLike>
  return call.call(db, fn, args)
}
