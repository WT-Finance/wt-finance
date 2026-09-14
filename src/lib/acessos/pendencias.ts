import 'server-only'
import { cache } from 'react'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc } from '@/lib/schemas-rpc'

// v5.9.3/M6 — contagem de solicitações de acesso PENDENTES (badge da sidebar em
// 'admin/acessos' + pill da página). RPC 0266, nascida fora do database.ts de então —
// mesmo padrão de helper de tipagem frouxa de src/lib/solicitacoes/rpc.ts (não
// importado de lá: é privado àquele módulo e a duplicação de 6 linhas é mais barata
// que expor um tipo interno de outro domínio). `cache()` deduplica no mesmo request
// (layout já é o único chamador hoje).

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function call<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T | null> {
  const sb = await getServerClient()
  const res = await (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
  return parseRpc(schema, res, fn)
}

export const getAcessosPendentes = cache(() => call('admin_acesso_solicitacoes_pendentes', {}, z.number()))
