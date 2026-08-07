import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { parseRpc, operacoesWeddingsSchema } from '@/lib/schemas-rpc'
import {
  CHAVES_ORDENACAO_OPERACOES,
  CHAVE_ORDENACAO_PADRAO,
} from '@/lib/weddings/ordenacao-operacoes'

const schema = z.object({
  status:          z.enum(['passado', 'futuro', 'sem_data', 'todos']).default('todos'),
  periodo_inicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodo_fim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subsetor:        z.enum(['COMERCIAL', 'CONVIDADOS', 'PRODUÇÃO', 'PLANEJAMENTO', 'NÃO_CLASSIFICADO', 'todos'])
                    .default('todos'),
  busca:           z.string().max(100).optional(),
  // A lista vive em `@/lib/weddings/ordenacao-operacoes` para poder ser testada: um
  // guard mecânico lê o `CASE` de whitelist do SQL e compara com ela nas duas
  // direções. Ver o cabeçalho daquele arquivo — faltar chave aqui derruba a tela com
  // 400, faltar no SQL ordena por outra coisa em SILÊNCIO, e nenhum dos dois aparece
  // em tsc/lint/build. (v5.5.0, achado CRÍTICO do `revisor`.)
  ordenar_por:     z.enum(CHAVES_ORDENACAO_OPERACOES).default(CHAVE_ORDENACAO_PADRAO),
  direcao:         z.enum(['asc', 'desc']).default('desc'),
  pagina:          z.coerce.number().int().min(1).default(1),
  por_pagina:      z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: NextRequest): Promise<Response> {
  // Guard v4.13: dados exclusivos da aba Weddings.
  const sessao = await requireAreaApi('performance/weddings')
  if (sessao instanceof Response) return sessao

  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const p = parsed.data
  const client = await getServerClient()
  const res = await client.rpc('get_operacoes_weddings', {
    p_status:          p.status,
    p_periodo_inicio:  p.periodo_inicio ?? null,
    p_periodo_fim:     p.periodo_fim    ?? null,
    p_subsetor:        p.subsetor,
    p_busca:           p.busca          ?? null,
    p_ordenar_por:     p.ordenar_por,
    p_direcao:         p.direcao,
    p_pagina:          p.pagina,
    p_por_pagina:      p.por_pagina,
  })
  // F7 (v4.12.1): valida shape; erro de RPC ou drift de contrato → null (logado em parseRpc).
  const operacoes = parseRpc(operacoesWeddingsSchema, res, 'get_operacoes_weddings')
  if (operacoes === null) return Response.json({ error: 'get_operacoes_weddings' }, { status: 500 })
  return Response.json(operacoes)
}
