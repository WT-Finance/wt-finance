import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { areasDoSetor } from '@/lib/auth/areas'
import { parseRpc, mixProdutoSchema } from '@/lib/schemas-rpc'

const schema = z.object({
  from:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  setor:  z.enum(['todos', 'Lazer', 'Weddings', 'Corporativo']).optional().default('todos'),
  limit:  z.coerce.number().int().min(1).max(50).optional().default(10),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  const { from, to, setor, limit } = parsed.data

  // Guard v4.13: área(s) do setor pedido ('todos' → executiva|performance).
  const sessao = await requireAreaApi(areasDoSetor(setor))
  if (sessao instanceof Response) return sessao

  const client = await getServerClient()
  const res = await client.rpc('get_mix_produto', {
    p_from: from, p_to: to, p_setor: setor, p_limite: limit,
  })
  // v5.10.0/D4-006: era `data as unknown as MixProduto` — cast cego, enquanto o
  // consumidor irmão (performance-content.tsx:118) já validava a MESMA RPC com o
  // MESMO schema. Agora as duas pontas usam `parseRpc`: erro de RPC ou drift de
  // contrato → null (logado em parseRpc) → 500, no molde de tendencia-margem.
  // O contrato vivo é provado em rpc-contrato.test.ts (caso `get_mix_produto`).
  const mix = parseRpc(mixProdutoSchema, res, 'get_mix_produto')
  if (mix === null) return Response.json({ error: 'get_mix_produto' }, { status: 500 })
  return Response.json(mix)
}
