import { describe, it, expect } from 'vitest'
import { z, type ZodType } from 'zod'
import {
  operacoesWeddingsSchema, carteiraWeddingsSchema, tendenciaMargemSchema,
  rankingVendedoresRangeSchema, vendasReceitaNegativaSchema, executivaKpisSchema,
  vendasEmAbertoSchema, cargaValidacaoSchema, cargaPromocaoSchema,
  mixProdutoSchema, minhasPermissoesSchema,
} from './schemas-rpc'
import {
  tiposAberturaSchema, destinatariosSchema, tiposAdminSchema, solicitacoesListaSchema,
  solicitacaoSchema, campoDefSchema,
} from './solicitacoes/schemas'

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
  // v4.16.0 Solicitações: leituras consumidas pela UI (service role → exigir_acesso
  // retorna cedo; uid nulo → listas vazias, mas o SHAPE é validado contra a RPC viva).
  { fn: 'solic_tipos_abertura',          params: {},                                                                     schema: tiposAberturaSchema },
  { fn: 'solic_destinatarios',           params: {},                                                                     schema: destinatariosSchema },
  { fn: 'admin_solic_listar_tipos',      params: {},                                                                     schema: tiposAdminSchema },
  { fn: 'solic_minhas',                  params: {},                                                                     schema: solicitacoesListaSchema },
  { fn: 'solic_caixa',                   params: { p_escopo: 'mim_e_role' },                                             schema: solicitacoesListaSchema },
  // M13 (v4.17.0): schemas consumidos por parseRpc que faltavam na lista viva F7.
  { fn: 'get_mix_produto',               params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings', p_limite: 10 }, schema: mixProdutoSchema },
  { fn: 'get_minhas_permissoes',         params: {},                                                                     schema: minhasPermissoesSchema },
  { fn: 'solic_minhas_pendencias',       params: {},                                                                     schema: z.number() },
]

describe.skipIf(!ON)('contrato RPC — schema parseRpc (F7) aceita o retorno REAL', () => {
  it.each(CONTRATOS_PARSE_RPC)('$fn ↔ schema Zod', async ({ fn, params, schema }) => {
    const d = await rpc(fn, params)
    const r = schema.safeParse(d)
    expect(r.success, r.success ? '' : `${fn} drift: ${JSON.stringify(r.error!.issues.slice(0, 6))}`).toBe(true)
  })
})

// M7 (v4.17.0): os contratos de solic_minhas/caixa rodam como service role → uid nulo →
// LISTA VAZIA, então só validavam `[]` — nunca o ITEM (shape de solic_json) nem a
// invariante NULL-safe da 0129 (sou_solicitante/sou_atendente boolean, nunca null). Como
// service role não enxerga item (visibilidade por uid), cobrimos o item com um FIXTURE
// capturado de solic_json REAL (produção, id 5). Falha sob drift: se solicitacaoSchema
// deixar de aceitar o item real, ou se as flags regredirem para não-boolean, este teste
// quebra — não passa trivialmente como o array vazio. (solic_detalhe não entra na F7 viva
// porque retorna null p/ service role.)
const SOLIC_JSON_FIXTURE = {
  id: 5, tipo_id: 5, tipo_nome: 'Lançamentos de Contas a Pagar',
  solicitante_email: 'yan@welcometrips.com.br',
  destinatario: { tipo: 'usuario', rotulo: 'carine@welcometrips.com.br' },
  data_limite: '2026-06-22', descricao: null, status: 'concluida',
  decidido_em: '2026-06-12T20:36:28.332284+00:00',
  decidido_por_email: 'carine@welcometrips.com.br', justificativa: null,
  criado_em: '2026-06-12T20:28:35.456861+00:00',
  sou_solicitante: false, sou_atendente: false,
  respostas: [
    { campo_id: 17, rotulo: 'Identificação do Fornecedor', tipo_campo: 'texto_curto', obrigatorio: true, opcoes: null, valor: 'TESTE' },
    { campo_id: 19, rotulo: 'Setor', tipo_campo: 'selecao', obrigatorio: true, opcoes: ['Trips', 'Corporativo', 'Weddings'], valor: 'Trips' },
    { campo_id: 21, rotulo: 'Valor', tipo_campo: 'moeda', obrigatorio: true, opcoes: null, valor: '1000' },
    { campo_id: 23, rotulo: 'Anexos', tipo_campo: 'anexo', obrigatorio: true, opcoes: null, valor: null },
    { campo_id: 26, rotulo: 'Prazo', tipo_campo: 'data', obrigatorio: true, opcoes: null, valor: '2026-06-22' },
  ],
  anexos: [{ campo_id: 23, id: 1, mime: 'application/pdf', nome: 'Invoice.pdf', tamanho: 165089 }],
}

describe('contrato RPC — ITEM de solic_json (M7: shape real + invariante NULL-safe 0129)', () => {
  it('solicitacaoSchema aceita um item REAL de solic_json (não só [])', () => {
    const r = solicitacaoSchema.safeParse(SOLIC_JSON_FIXTURE)
    expect(r.success, r.success ? '' : `drift do item: ${JSON.stringify(r.error!.issues.slice(0, 8))}`).toBe(true)
  })
  it('flags de papel são BOOLEAN, nunca null (coalesce da 0129)', () => {
    const r = solicitacaoSchema.parse(SOLIC_JSON_FIXTURE)
    expect(typeof r.sou_solicitante).toBe('boolean')
    expect(typeof r.sou_atendente).toBe('boolean')
  })
  it('o item-schema é estrito o suficiente p/ pegar drift (campo faltante reprova)', () => {
    const semStatus: Record<string, unknown> = { ...SOLIC_JSON_FIXTURE }
    delete semStatus.status
    expect(solicitacaoSchema.safeParse(semStatus).success).toBe(false) // se passasse, o schema seria frouxo demais
  })
})

// v4.19.0/M4: regra de data por campo (data_permite_passado / data_aviso_dias_futuro)
// trafega pela campoDefSchema (layer 5 da fontanaria). Se o schema NÃO listar as chaves,
// o Zod as DESCARTA silenciosamente (objeto sem .passthrough()) e a regra "some sem erro
// de build" — exatamente a classe de bug que o briefing alerta. Este teste prova que as
// chaves SOBREVIVEM ao parse (não basta success: tem de manter o valor).
describe('contrato — campoDefSchema preserva a regra de data (fontanaria layer 5)', () => {
  it('campo data com permite_passado=false + aviso=30 sobrevive ao parse', () => {
    const r = campoDefSchema.safeParse({
      id: 99, rotulo: 'Prazo', tipo_campo: 'data', obrigatorio: true, opcoes: null, ordem: 0,
      data_permite_passado: false, data_aviso_dias_futuro: 30,
    })
    expect(r.success, r.success ? '' : JSON.stringify(r.error!.issues)).toBe(true)
    expect(r.success && r.data.data_permite_passado).toBe(false)
    expect(r.success && r.data.data_aviso_dias_futuro).toBe(30)
  })
  it('campo data sem aviso (null) e campo legado sem as chaves são aceitos (optional)', () => {
    expect(campoDefSchema.safeParse({
      rotulo: 'Data', tipo_campo: 'data', obrigatorio: false, opcoes: null,
      data_permite_passado: true, data_aviso_dias_futuro: null,
    }).success).toBe(true)
    // Campo antigo (pré-0140): RPC pode não emitir as chaves → optional tolera.
    expect(campoDefSchema.safeParse({
      rotulo: 'Antigo', tipo_campo: 'texto_curto', obrigatorio: false, opcoes: null,
    }).success).toBe(true)
  })
})

// M10 (v4.17.0): o gate `npm test` era condicional — os blocos online (contrato/RBAC)
// usam describe.skipIf(!ON), então sem .env.local o CI ficava VERDE sem rodar a parte de
// segurança. Este teste SEMPRE roda: com REQUIRE_CONTRACT=1 (CI), FALHA se as credenciais
// faltarem (os blocos online seriam pulados quando deveriam rodar). Local, sem a flag, passa.
describe('gate de contrato — online obrigatório quando exigido (M10)', () => {
  it('REQUIRE_CONTRACT=1 exige credenciais (online não pode ser pulado)', () => {
    const exigido = process.env.REQUIRE_CONTRACT === '1'
    if (exigido) {
      expect(ON, 'REQUIRE_CONTRACT=1 mas faltam SUPABASE_URL/SERVICE_ROLE_KEY → contrato/RBAC seriam pulados').toBe(true)
    } else {
      expect(true).toBe(true) // offline: gate de unidade segue obrigatório; online é opcional
    }
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
  // v4.16.2: guarda de setor/setor_micro (migration 0132) — retorno com setor_fora + erro
  it('cargaValidacaoSchema aceita o retorno com reprova de setor (setor_fora)', () => {
    const r = cargaValidacaoSchema.safeParse({
      ok: false, total: 100, data_min: '2026-01-01', data_max: '2026-03-01',
      dim_min: '2022-01-01', dim_max: '2030-12-31', fora_do_range: 0, setor_fora: 12,
      erros: ['12 venda(s) com setor/setor_micro fora das dimensões (seriam descartadas em silêncio pelo transform): setor=«Novo». Atualize analytics.dim_setor/dim_setor_micro antes de carregar.'],
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.setor_fora).toBe(12)
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

  // v4.16.0 Solicitações: todas as RPCs (abertura, leitura, transição, admin) exigem
  // sessão — anon negado em tudo (§2.2/§2.3 valem no banco).
  it('Solicitações: anon negado em todas as RPCs', async () => {
    for (const fn of ['solic_minhas', 'solic_caixa', 'solic_tipos_abertura', 'solic_destinatarios',
                      'solic_concluir', 'criar_solicitacao', 'admin_solic_listar_tipos']) {
      const status = await rpcAnonStatus(fn, {})
      expect(status, `${fn} deveria negar anon`).toBeGreaterThanOrEqual(400)
    }
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
