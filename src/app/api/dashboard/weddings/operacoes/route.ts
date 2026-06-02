import { type NextRequest } from 'next/server'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import type { ListaOperacoes } from '@/types/api'

const schema = z.object({
  status:          z.enum(['passado', 'futuro', 'sem_data', 'todos']).default('todos'),
  periodo_inicio:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodo_fim:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  subsetor:        z.enum(['COMERCIAL', 'CONVIDADOS', 'PRODUÇÃO', 'PLANEJAMENTO', 'NÃO_CLASSIFICADO', 'todos'])
                    .default('todos'),
  busca:           z.string().max(100).optional(),
  ordenar_por:     z.enum(['data_evento', 'nome_casal', 'hotel', 'faturamento', 'receita', 'margem', 'custos', 'resultado', 'ml', 'duracao', 'tipo_contrato', 'convidados']).default('data_evento'),
  direcao:         z.enum(['asc', 'desc']).default('desc'),
  pagina:          z.coerce.number().int().min(1).default(1),
  por_pagina:      z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: NextRequest): Promise<Response> {
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const p = parsed.data
  const { data, error } = await getServerClient().rpc('get_operacoes_weddings', {
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
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data as unknown as ListaOperacoes)
}
