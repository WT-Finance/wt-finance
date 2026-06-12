import { describe, it, expect } from 'vitest'
import type { ZodType } from 'zod'
import {
  operacoesWeddingsSchema, carteiraWeddingsSchema, tendenciaMargemSchema,
  rankingVendedoresRangeSchema, vendasReceitaNegativaSchema, executivaKpisSchema,
  vendasEmAbertoSchema, cargaValidacaoSchema, cargaPromocaoSchema,
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
  // v4.15.0/F2-real: validar_carga_staging é NÃO-destrutivo (só lê a staging) → seguro
  // rodar contra a RPC viva. promover_carga_vendas é destrutivo (swap da base) → NÃO
  // entra aqui; seu schema é coberto pelo teste estrutural abaixo.
  { fn: 'validar_carga_staging',         params: {},                                                                     schema: cargaValidacaoSchema },
]

describe.skipIf(!ON)('contrato RPC — schema parseRpc (F7) aceita o retorno REAL', () => {
  it.each(CONTRATOS_PARSE_RPC)('$fn ↔ schema Zod', async ({ fn, params, schema }) => {
    const d = await rpc(fn, params)
    const r = schema.safeParse(d)
    expect(r.success, r.success ? '' : `${fn} drift: ${JSON.stringify(r.error!.issues.slice(0, 6))}`).toBe(true)
  })
})

// promover_carga_vendas é DESTRUTIVO (trunca + recarrega a base) — não pode ser chamado
// num teste. Cobrimos o SHAPE do seu retorno (o jsonb do transform) estruturalmente: o
// caminho real (finalizarVendasAction) usa cargaPromocaoSchema via parseRpc, então o
// contrato precisa aceitar { vendas_count, fato_venda_item_count } com extras tolerados.
describe('contrato RPC — schema de promover_carga_vendas (estrutural, RPC destrutiva)', () => {
  it('cargaPromocaoSchema aceita o retorno do transform (counts + extras)', () => {
    const r = cargaPromocaoSchema.safeParse({ vendas_count: 27305, fato_venda_item_count: 41000, dim_produto_count: 120 })
    expect(r.success).toBe(true)
  })
  it('cargaValidacaoSchema aceita o retorno de staging vazia (sem range)', () => {
    const r = cargaValidacaoSchema.safeParse({ ok: false, total: 0, erros: ['Nenhuma linha válida na carga — arquivo vazio ou inválido.'] })
    expect(r.success).toBe(true)
  })
})

// ── v4.13: contrato do RBAC (ADRs 0106-0108) ─────────────────────────────────
// Valida as 4 propriedades de segurança verificáveis por REST:
//  1. paridade do catálogo de áreas banco↔app;
//  2. o caminho NEGADO do guard (anon + enforcement simulado → 42501/403);
//  3. a janela de compatibilidade (anon + flag OFF → leitura segue 200 — S5);
//  4. mutações destrutivas INACESSÍVEIS a anon (revogação dura da 0122).

const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

async function rpcAnonStatus(fn: string, body: Record<string, unknown>): Promise<number> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON as string,
      Authorization: `Bearer ${ANON as string}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  // consome o corpo para não vazar handle
  await res.text()
  return res.status
}

describe.skipIf(!ON || !ANON)('contrato RBAC — guards e revogações (v4.13)', () => {
  it('catálogo de áreas: banco (app.rbac_areas) ↔ app (AREAS) idênticos', async () => {
    const { AREAS } = await import('./auth/areas')
    const areas = await rpc('admin_listar_areas', {}) as unknown as Array<{ area: string }>
    expect(Array.isArray(areas)).toBe(true)
    expect(areas.map(a => a.area).sort()).toEqual([...AREAS].sort())
  })

  it('get_minhas_permissoes: shape estável mesmo sem usuário (service role)', async () => {
    const d = await rpc('get_minhas_permissoes', {}) as { registrado?: boolean; ativo?: boolean; permissoes?: unknown[] }
    expect(d.registrado).toBe(false)
    expect(d.ativo).toBe(false)
    expect(Array.isArray(d.permissoes)).toBe(true)
  })

  it('guard NEGA anon com enforcement simulado (rbac_verificar_guard → 403)', async () => {
    const status = await rpcAnonStatus('rbac_verificar_guard', { p_area: 'executiva' })
    expect(status).toBeGreaterThanOrEqual(400) // 42501 → 403 no PostgREST
  })

  // Pós-ativação (v4.13.1): o enforcement está LIGADO em produção, então a leitura
  // anônima é NEGADA. (Antes da ativação este teste afirmava o contrário — a janela
  // de compatibilidade com a flag OFF; ver ADR-0108 e o runbook.)
  it('enforcement ATIVO: leitura anônima é negada (sem JWT → 42501)', async () => {
    const status = await rpcAnonStatus('get_executiva_kpis', {
      p_from: '2026-01-01', p_to: '2026-01-31', p_setor: 'todos',
    })
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('mutações destrutivas INACESSÍVEIS a anon (revogação dura)', async () => {
    // Caminho antigo (coexiste) + pipeline atômico (0116/0118, usado pelo caminho real
    // da UI via service role): TODAS service_role-only → anon negado (v4.15.0/F2-real).
    const comLinhas = new Set(['inserir_lote_raw', 'inserir_lote_staging'])
    for (const fn of [
      'truncate_dynamic_tables', 'inserir_lote_raw',
      'limpar_staging_vendas', 'inserir_lote_staging', 'validar_carga_staging', 'promover_carga_vendas',
    ]) {
      const status = await rpcAnonStatus(fn, comLinhas.has(fn) ? { p_linhas: [] } : {})
      expect(status, `${fn} deveria estar revogada para anon`).toBeGreaterThanOrEqual(400)
    }
  })

  it('RPCs de administração exigem JWT (anon → erro)', async () => {
    const status = await rpcAnonStatus('admin_listar_usuarios', {})
    expect(status).toBeGreaterThanOrEqual(400)
  })

  // v4.14: solicitação de acesso pública × admin de solicitações fechado.
  it('admin_listar_solicitacoes nega anon (sem JWT → erro)', async () => {
    const status = await rpcAnonStatus('admin_listar_solicitacoes', {})
    expect(status).toBeGreaterThanOrEqual(400)
  })

  it('solicitar_acesso é acessível por anon (e-mail inválido → 200 ok:false, sem inserir)', async () => {
    // E-mail inválido de propósito: a RPC responde 200 sem gravar nada (não deixa lixo).
    const status = await rpcAnonStatus('solicitar_acesso', { p_email: 'invalido-sem-arroba' })
    expect(status).toBe(200)
  })
})
