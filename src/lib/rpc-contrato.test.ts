import { describe, it, expect } from 'vitest'
import type { ZodType } from 'zod'
import {
  operacoesWeddingsSchema, carteiraWeddingsSchema, tendenciaMargemSchema,
  rankingVendedoresRangeSchema, vendasReceitaNegativaSchema, executivaKpisSchema,
  vendasEmAbertoSchema,
} from './schemas-rpc'

// CONTRATO das RPCs críticas (números que a diretoria vê). Bate via REST com a
// service role (padrão de verificação do projeto) e valida SHAPE + INVARIANTES de
// negócio. skipIf sem credenciais → o gate `npm test` passa offline; com .env.local
// carregado (vitest.setup.ts), roda de verdade. Só LEITURA — nunca escreve.

// A URL do .env pode vir como host puro OU já com /rest/v1 (e/ou trailing slash).
// Normalizamos para o host e remontamos o endpoint REST — evita /rest/v1//rest/v1.
const RAW = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const HOST = RAW.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ON = Boolean(HOST && KEY)

async function rpc(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: KEY as string,
      Authorization: `Bearer ${KEY as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${fn} → HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

describe.skipIf(!ON)('contrato RPC — shape + invariantes', () => {
  it('get_mix_produto: produtos[] tipados e soma dos % ≈ 100', async () => {
    const d = await rpc('get_mix_produto', {
      p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings', p_limite: 10,
    }) as { produtos?: Array<{ produto_nome: string; faturamento: number; pct_faturamento: number }>; outros?: { pct_faturamento?: number } }

    expect(Array.isArray(d.produtos)).toBe(true)
    if (d.produtos && d.produtos.length) {
      const p = d.produtos[0]
      expect(typeof p.produto_nome).toBe('string')
      expect(typeof p.faturamento).toBe('number')
      expect(typeof p.pct_faturamento).toBe('number')
      const soma = d.produtos.reduce((a, x) => a + (x.pct_faturamento ?? 0), 0) + (d.outros?.pct_faturamento ?? 0)
      expect(soma).toBeGreaterThan(95)
      expect(soma).toBeLessThan(105)
    }
  })

  it('get_vendas_em_aberto: { total:number, vendas:[] } e vendas ≤ limite', async () => {
    const d = await rpc('get_vendas_em_aberto', { p_setor: 'Weddings', p_limite: 50, p_offset: 0 }) as
      { total?: number; vendas?: unknown[] }
    expect(typeof d.total).toBe('number')
    expect(Array.isArray(d.vendas)).toBe(true)
    expect((d.vendas ?? []).length).toBeLessThanOrEqual(50)
  })

  it('get_executiva_kpis: faturamento/receita/margem coerentes (margem ≈ receita/fat)', async () => {
    const d = await rpc('get_executiva_kpis', {
      p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings',
      p_ant_from: '2025-01-01', p_ant_to: '2025-12-31',
      p_yoy_from: '2025-01-01', p_yoy_to: '2025-12-31',
    }) as { faturamento?: { valor: number }; receita?: { valor: number }; margem_pct?: { valor: number } }

    expect(typeof d.faturamento?.valor).toBe('number')
    expect(typeof d.receita?.valor).toBe('number')
    expect(typeof d.margem_pct?.valor).toBe('number')
    const fat = d.faturamento!.valor
    if (fat > 0) {
      const margemEsperada = (d.receita!.valor / fat) * 100
      expect(Math.abs(d.margem_pct!.valor - margemEsperada)).toBeLessThan(0.5)
    }
  })
})

// F7 (v4.12.1): o schema Zod de cada RPC consumida por parseRpc PRECISA aceitar o
// retorno REAL — senão parseRpc devolve null e a rota dá HTTP 500 / a tela degrada.
// Foi exatamente o que escapou na Lista de Operações (get_operacoes_weddings): o
// schema exigia passageiros_raw, que a RPC não emite. Este bloco roda o schema real
// contra a RPC real e guarda contra essa classe de regressão em TODAS as 7 RPCs do M2.
const CONTRATOS_PARSE_RPC: Array<{ fn: string; params: Record<string, unknown>; schema: ZodType }> = [
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'data_evento', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
  { fn: 'get_carteira_weddings',         params: { p_metric: 'casamentos' },                                              schema: carteiraWeddingsSchema },
  { fn: 'get_tendencia_margem',          params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings' },       schema: tendenciaMargemSchema },
  { fn: 'get_ranking_vendedores_range',  params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings', p_limite: 100 }, schema: rankingVendedoresRangeSchema },
  { fn: 'get_vendas_receita_negativa',   params: { p_setor: 'Weddings', p_from: '2020-01-01', p_to: '2099-12-31' },       schema: vendasReceitaNegativaSchema },
  { fn: 'get_executiva_kpis',            params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings' },       schema: executivaKpisSchema },
  { fn: 'get_vendas_em_aberto',          params: { p_setor: 'Weddings', p_limite: 50, p_offset: 0 },                      schema: vendasEmAbertoSchema },
]

describe.skipIf(!ON)('contrato RPC — schema parseRpc (F7) aceita o retorno REAL', () => {
  it.each(CONTRATOS_PARSE_RPC)('$fn ↔ schema Zod', async ({ fn, params, schema }) => {
    const d = await rpc(fn, params)
    const r = schema.safeParse(d)
    expect(r.success, r.success ? '' : `${fn} drift: ${JSON.stringify(r.error!.issues.slice(0, 6))}`).toBe(true)
  })
})
