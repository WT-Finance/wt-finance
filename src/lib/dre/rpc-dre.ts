import type { ServerClient } from '@/lib/supabase/server'
import type { RpcLike } from '@/lib/rpc'

// As RPCs da DRE (migrations 0204–0208) nasceram quando o database.ts era tratado como
// congelado (hoje é GERADO — ADR-0173): helper de tipagem frouxa LEGADO, como metas/acervo,
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
