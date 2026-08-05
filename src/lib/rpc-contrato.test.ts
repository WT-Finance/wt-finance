import { describe, it, expect } from 'vitest'
import { z, type ZodType } from 'zod'
import {
  operacoesWeddingsSchema, carteiraWeddingsSchema, tendenciaMargemSchema,
  rankingVendedoresRangeSchema, vendasReceitaNegativaSchema, executivaKpisSchema,
  vendasEmAbertoSchema, cargaValidacaoSchema, cargaPromocaoSchema,
  mixProdutoSchema, minhasPermissoesSchema, cruzarVendasSetorSchema, buscarPessoasSchema,
  acervoListaSchema, acervoDocSchema,
  metasListarSchema, metasRitmoDiarioSchema,
} from './schemas-rpc'
import {
  tiposAberturaSchema, destinatariosSchema, tiposAdminSchema, solicitacoesListaSchema,
  solicitacaoSchema, campoDefSchema, movimentacoesSchema,
} from './solicitacoes/schemas'
import {
  repasseMensalSchema, horizonteSchema, runwaySemanalSchema, rankingCaixaSchema, saldoCaixaSchema,
  coberturaSchema, previstoDiarioSchema, saldoRepasseSchema,
} from './fluxo/rpc-fluxo'
import {
  dreMensalSchema, dreEstruturaSchema, salvarEstruturaResultSchema, historicoLotesSchema,
  historicoEntradasSchema, decomposicaoBlocoSchema,
} from './dre/schemas'
import { duracaoDias, margemAnualizada } from './weddings/margem-anualizada'
import { LIMITE_MESES_FLUXO } from './fluxo/janela-mensal'
import { hojeSP } from './fmt'

// CONTRATO das RPCs críticas (números que a diretoria vê). Bate via REST com a
// service role (padrão de verificação do projeto) e valida SHAPE + INVARIANTES de
// negócio. skipIf sem credenciais → o gate `npm test` passa offline; com .env.local
// carregado (vitest.setup.ts), roda de verdade. Só LEITURA — com UMA exceção
// deliberada: o caso de dre_estrutura_salvar envia um lote VAZIO (no-op, gravadas=0)
// para exercitar a trava otimista; nenhum dado muda.

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

// v5.4.2 — CASO DE CONTRATO da Margem (a.a.): o número que a lista ORDENA (chave
// `d_margem_aa`, calculada em SQL na migration 0228) e o número que ela EXIBE (derivado
// no cliente por `margemAnualizada`) têm de ser a MESMA conta. Se divergirem, a coluna
// ordena por um valor diferente do que mostra — e nada nos gates pega: o `tsc` não vê
// SQL, o teste de shape não vê ordem, e a whitelist do ORDER BY cai num `ELSE` silencioso.
// A verificação manual das 26 combinações (feita na entrega) não fica de pé sozinha;
// este teste é a rede permanente. Achado MÉDIO do revisor-db, endereçado.
describe.skipIf(!ON)('contrato RPC — Margem (a.a.): ordenação do SQL ≡ fórmula exibida', () => {
  const aa = (o: Record<string, unknown>) => margemAnualizada(
    o.margem_liquida_pct as number,
    duracaoDias(o.data_venda_contrato as string | null, o.data_evento as string | null),
  )

  for (const direcao of ['desc', 'asc'] as const) {
    it(`ordenar por margem_aa ${direcao} devolve a lista monotônica na fórmula do cliente`, async () => {
      const r = await rpc('get_operacoes_weddings', {
        p_status: 'todos', p_subsetor: 'todos',
        p_ordenar_por: 'margem_aa', p_direcao: direcao, p_pagina: 1, p_por_pagina: 200,
      })
      const ops = (r.operacoes as Record<string, unknown>[]) ?? []
      expect(ops.length).toBeGreaterThan(0)

      const comValor = ops.map(aa).filter((v): v is number => v !== null)
      expect(comValor.length).toBeGreaterThan(0)

      for (let i = 1; i < comValor.length; i++) {
        const ok = direcao === 'desc'
          ? comValor[i] <= comValor[i - 1] + 1e-6
          : comValor[i] >= comValor[i - 1] - 1e-6
        expect(ok, `quebra de ordem em ${i}: ${comValor[i - 1]} → ${comValor[i]}`).toBe(true)
      }
    })
  }

  it('duração não anualizável cai por ÚLTIMO (NULLS LAST), nunca no meio', async () => {
    const r = await rpc('get_operacoes_weddings', {
      p_status: 'todos', p_subsetor: 'todos',
      p_ordenar_por: 'margem_aa', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200,
    })
    const vals = ((r.operacoes as Record<string, unknown>[]) ?? []).map(aa)
    // `reduce<number>` explícito: sem o parâmetro de tipo, o TS escolhe a sobrecarga
    // em que o acumulador herda `number | null` do array e o `Math.max` abaixo reprova.
    const ultimoComValor = vals.reduce<number>((acc, v, i) => (v !== null ? i : acc), -1)
    const nulosAntes = vals.slice(0, Math.max(ultimoComValor, 0)).filter(v => v === null).length
    expect(nulosAntes, 'travessão apareceu antes de uma operação com valor').toBe(0)
  })

  it('a paginação não repete nem pula linha ao ordenar pela coluna nova', async () => {
    const params = (pagina: number) => ({
      p_status: 'passado', p_subsetor: 'todos',
      p_ordenar_por: 'margem_aa', p_direcao: 'desc', p_pagina: pagina, p_por_pagina: 10,
    })
    const [p1, p2] = await Promise.all([
      rpc('get_operacoes_weddings', params(1)),
      rpc('get_operacoes_weddings', params(2)),
    ])
    const ids = (r: Record<string, unknown>) =>
      ((r.operacoes as Record<string, unknown>[]) ?? []).map(o => o.operacao as string)
    const a = ids(p1), b = ids(p2)
    expect(a.length).toBeGreaterThan(0)
    expect(a.filter(x => b.includes(x)), 'operação repetida entre páginas').toEqual([])
  })
})

// v5.4.2 — CASO DE CONTRATO da janela do Fluxo de Caixa Mensal do Financeiro.
// Achado MÉDIO do revisor-db na 0229, e uma inconsistência minha: eu fiz exatamente
// este guard para a 0228 (a chave de ordenação) e NÃO espelhei para a irmã na mesma
// versão. O risco é concreto: a janela daquela RPC é HARDCODED no corpo, então um
// futuro `CREATE OR REPLACE` que use a 0080 como base volta a série para 42 meses
// **em silêncio** — `tsc`/`lint`/`build`/`test` passam todos, e o slider do cliente
// simplesmente clampa para o que existir, aparecendo "curto" sem erro nenhum.
//
// O segundo `it` torna PERMANENTE o cross-check que na entrega foi ad hoc: as duas
// RPCs leem a MESMA view (`financeiro.vw_fluxo_caixa_kpis_b`), uma pela janela do
// corpo e outra por range explícito, então elas TÊM de concordar — é o que
// `banco-e-rpc` §7 e `contrato-rpc-front` §5 chamam de caso de contrato em vez de
// nota de rodapé.
interface FluxoMensalLinha {
  mes: string
  entrada_efetivada: number
  entrada_prevista: number
  saida_efetivada: number
  saida_prevista: number
}

describe.skipIf(!ON)('contrato RPC — janela do Fluxo de Caixa Mensal (Financeiro)', () => {
  const serie = async () =>
    (await rpc('get_fluxo_caixa_mensal_v3', {})) as unknown as FluxoMensalLinha[]

  /** Último dia do mês 'YYYY-MM', para o range do kpis_b. */
  const ultimoDia = (mes: string) => {
    const [y, m] = mes.split('-').map(Number)
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
  }

  it(`a janela cobre ${LIMITE_MESES_FLUXO} meses para cada lado do mês corrente`, async () => {
    const rows = await serie()
    const mesHoje = hojeSP().slice(0, 7)
    const idx = rows.findIndex(r => r.mes === mesHoje)

    expect(idx, `mês corrente ${mesHoje} ausente na série devolvida`).toBeGreaterThanOrEqual(0)
    // É ESTE par de asserções que a janela antiga (23 atrás / 18 à frente) REPROVA.
    expect(idx, 'meses PASSADOS insuficientes para o slider').toBeGreaterThanOrEqual(LIMITE_MESES_FLUXO)
    expect(rows.length - 1 - idx, 'meses FUTUROS insuficientes para o slider')
      .toBeGreaterThanOrEqual(LIMITE_MESES_FLUXO)
  })

  it('a série é mensal, contínua e sem buraco (o eixo de tempo não pula mês)', async () => {
    const rows = await serie()
    for (let i = 1; i < rows.length; i++) {
      const [ya, ma] = rows[i - 1].mes.split('-').map(Number)
      const [yb, mb] = rows[i].mes.split('-').map(Number)
      const distancia = (yb - ya) * 12 + (mb - ma)
      expect(distancia, `salto entre ${rows[i - 1].mes} e ${rows[i].mes}`).toBe(1)
    }
  })

  it('os 4 campos concordam com get_fluxo_caixa_kpis_b no mesmo mês (mesma view)', async () => {
    const rows = await serie()
    const comMovimento = rows.filter(
      r => r.entrada_efetivada || r.entrada_prevista || r.saida_efetivada || r.saida_prevista,
    )
    expect(comMovimento.length).toBeGreaterThan(0)

    // Amostra nas BORDAS do que tem dado + o mês corrente: é onde um erro de range apareceria.
    const amostra = [
      comMovimento[0].mes,
      hojeSP().slice(0, 7),
      comMovimento[comMovimento.length - 1].mes,
    ]

    for (const mes of amostra) {
      const linha = rows.find(r => r.mes === mes)
      expect(linha, `mês ${mes} ausente`).toBeDefined()
      const k = await rpc('get_fluxo_caixa_kpis_b', { p_from: `${mes}-01`, p_to: ultimoDia(mes) })
      const pares: Array<[string, number, number]> = [
        ['entrada_efetivada', linha!.entrada_efetivada, k.entradas_realizadas as number],
        ['saida_efetivada',   linha!.saida_efetivada,   k.saidas_realizadas   as number],
        ['entrada_prevista',  linha!.entrada_prevista,  k.entradas_previstas  as number],
        ['saida_prevista',    linha!.saida_prevista,    k.saidas_previstas    as number],
      ]
      for (const [campo, daSerie, doKpi] of pares) {
        expect(Math.abs((daSerie ?? 0) - (doKpi ?? 0)), `${mes}.${campo}: ${daSerie} ≠ ${doKpi}`)
          .toBeLessThan(0.01)
      }
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
  // v5.4.2: MESMA RPC com a chave de ordenação NOVA. Existe porque a whitelist do
  // ORDER BY termina em `ELSE 'd_data_evento'` — um typo em `d_margem_aa` ou a perda
  // do `WHEN` não dariam erro, só ordenariam por outra coisa em silêncio. Chamar a RPC
  // viva com o valor pega coluna inexistente na hora (o EXECUTE estoura).
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'margem_aa',   p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
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
  // v4.19.1: auditoria de movimentações (gestão-only). Service role → exigir_acesso retorna
  // cedo (lista vazia), mas o SHAPE (array de 7 chaves) é validado contra a RPC viva.
  { fn: 'solic_movimentacoes',           params: {},                                                                     schema: movimentacoesSchema },
  // M13 (v4.17.0): schemas consumidos por parseRpc que faltavam na lista viva F7.
  { fn: 'get_mix_produto',               params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings', p_limite: 10 }, schema: mixProdutoSchema },
  { fn: 'get_minhas_permissoes',         params: {},                                                                     schema: minhasPermissoesSchema },
  { fn: 'solic_minhas_pendencias',       params: {},                                                                     schema: z.number() },
  // v4.28.0: cruzamento da Calculadora de Rateio. 2 nº reais + 1 inexistente — o
  // SHAPE (array de {venda_no, setor_macro}) é validado contra a RPC viva; o nº fake
  // não volta (prova a diferença → 'Não identificado' é inferido no cliente).
  { fn: 'cruzar_vendas_setor',           params: { p_vendas: ['71408', '71971', '99999999'] },                          schema: cruzarVendasSetorSchema },
  // v4.30.0: lookup do Faturamento Corporativo. Service role passa o gate; valida o SHAPE
  // (array de cadastros) contra a RPC viva. (raw.pessoas pode estar vazia → []; a forma do
  // objeto é coberta pelo classificar.test com fixtures.)
  { fn: 'buscar_pessoas',                params: { p_nomes: ['ZZ_INEXISTENTE_CONTRATO'] },                              schema: buscarPessoasSchema },
  // v4.34.0: Acervo de Documentos. Service role passa o gate de exigir_acesso (retorna
  // cedo, como as demais RPCs desta lista); o SHAPE (array de metadados, sem
  // storage_path/criado_por) é validado contra a RPC viva.
  { fn: 'acervo_listar',                 params: {},                                                                   schema: acervoListaSchema },
  // v5.0.0 Metas: leituras consumidas pela UI. Service role passa o gate exigir_acesso
  // (retorna cedo); o SHAPE é validado contra a RPC viva (108 metas de seed + série real).
  { fn: 'metas_listar',                  params: { p_ano: 2026 },                                                      schema: metasListarSchema },
  { fn: 'metas_ritmo_diario',            params: { p_from: '2026-01-01', p_to: '2026-12-31', p_setor: 'Weddings' },    schema: metasRitmoDiarioSchema },
]

describe.skipIf(!ON)('contrato RPC — schema parseRpc (F7) aceita o retorno REAL', () => {
  it.each(CONTRATOS_PARSE_RPC)('$fn ↔ schema Zod', async ({ fn, params, schema }) => {
    const d = await rpc(fn, params)
    const r = schema.safeParse(d)
    expect(r.success, r.success ? '' : `${fn} drift: ${JSON.stringify(r.error!.issues.slice(0, 6))}`).toBe(true)
  })

  // v4.34.0: proteção contra drift futuro — quando o acervo vivo tiver documentos reais,
  // nenhum item pode vazar storage_path/criado_por (a RPC não deveria emiti-los; se um dia
  // emitir, o schema com .passthrough() aceitaria em silêncio — este teste não).
  it('acervo_listar: itens vivos (se houver) não vazam storage_path/criado_por', async () => {
    const d = await rpc('acervo_listar', {}) as unknown as unknown[]
    for (const item of d) {
      expect(item).not.toHaveProperty('storage_path')
      expect(item).not.toHaveProperty('criado_por')
    }
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
  // v5.4.0/Round4 — `origem` (proveniência da solicitação): { plataforma } quando
  // aberta via API externa, null quando aberta na tela, e AUSENTE (RPC antiga
  // durante o rollout) — as três formas precisam validar (lição v4.12.1/ADR-0118:
  // .optional(), não só .nullable()).
  it('origem: aceita ausente (RPC antiga), null (aberta na tela) e objeto (via API)', () => {
    expect(solicitacaoSchema.safeParse(SOLIC_JSON_FIXTURE).success).toBe(true) // sem a chave
    expect(solicitacaoSchema.safeParse({ ...SOLIC_JSON_FIXTURE, origem: null }).success).toBe(true)
    const r = solicitacaoSchema.safeParse({ ...SOLIC_JSON_FIXTURE, origem: { plataforma: 'TARS' } })
    expect(r.success, r.success ? '' : `drift de origem: ${JSON.stringify(r.error!.issues.slice(0, 8))}`).toBe(true)
    if (r.success) expect(r.data.origem).toEqual({ plataforma: 'TARS' })
  })
})

// v4.34.0: o acervo em produção está VAZIO — o caso de acervo_listar em CONTRATOS_PARSE_RPC
// valida `[]` e passa TRIVIALMENTE, sem exercitar nenhum item de verdade (mesma armadilha do
// SOLIC_JSON_FIXTURE acima). Cobrimos o ITEM com um FIXTURE capturado do retorno REAL de
// acervo_listar durante o round-trip E2E verificado da v4.34.0 (2026-07-01; o documento de
// teste foi removido logo em seguida).
const ACERVO_DOC_FIXTURE = {
  id: 1,
  mime: 'text/plain',
  titulo: 'ZZZ TESTE E2E v4.34 — apagar',
  criado_em: '2026-07-01T23:04:52.000317-03:00',
  descricao: 'Registro de teste do round-trip — apagar.',
  nome_arquivo: 'teste e2e (ação).txt',
  tamanho_bytes: 30,
}

describe('contrato RPC — ITEM de acervo_listar (fixture real: acervo vivo estava vazio)', () => {
  it('acervoDocSchema aceita um item REAL de acervo_listar (não só [])', () => {
    const r = acervoDocSchema.safeParse(ACERVO_DOC_FIXTURE)
    expect(r.success, r.success ? '' : `drift do item: ${JSON.stringify(r.error!.issues.slice(0, 8))}`).toBe(true)
  })
  it('o shape emitido pela RPC não vaza storage_path/criado_por (whitelist de chaves)', () => {
    expect(Object.keys(ACERVO_DOC_FIXTURE).sort()).toEqual(
      ['criado_em', 'descricao', 'id', 'mime', 'nome_arquivo', 'tamanho_bytes', 'titulo'],
    )
  })
})

// v4.19.0/M4: regra de data por campo (data_permite_passado / data_aviso_dias_futuro)
// trafega pela campoDefSchema (layer 5 da fontanaria). Se o schema NÃO listar as chaves,
// o Zod as DESCARTA silenciosamente (objeto sem .passthrough()) e a regra "some sem erro
// de build" — exatamente a classe de bug que o briefing alerta. Este teste prova que as
// chaves SOBREVIVEM ao parse (não basta success: tem de manter o valor).
describe('contrato — campoDefSchema preserva a regra de data (fontanaria layer 5)', () => {
  it('campo data com permite_passado=false + aviso=30 + direcao=abaixo sobrevive ao parse', () => {
    const r = campoDefSchema.safeParse({
      id: 99, rotulo: 'Prazo', tipo_campo: 'data', obrigatorio: true, opcoes: null, ordem: 0,
      data_permite_passado: false, data_aviso_dias_futuro: 30, data_aviso_direcao: 'abaixo',
    })
    expect(r.success, r.success ? '' : JSON.stringify(r.error!.issues)).toBe(true)
    expect(r.success && r.data.data_permite_passado).toBe(false)
    expect(r.success && r.data.data_aviso_dias_futuro).toBe(30)
    expect(r.success && r.data.data_aviso_direcao).toBe('abaixo')  // v4.37.1 — chave nova sobrevive
  })
  it('data_aviso_direcao inválida é rejeitada (enum acima/abaixo)', () => {
    expect(campoDefSchema.safeParse({
      rotulo: 'X', tipo_campo: 'data', obrigatorio: false, opcoes: null, data_aviso_direcao: 'lateral',
    }).success).toBe(false)
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

// v5.0.0 — FONTE ÚNICA DO REAL: a série de metas_ritmo_diario tem de somar EXATAMENTE
// o faturamento de get_executiva_kpis no mesmo range/setor (mesma mv_vendas_diarias,
// mesmo JOIN/WHERE). Se divergir, "faturamento de X" em Metas ≠ em Performance — o que
// o invariante proíbe. Cobre 'todos' + os 3 setores (nome interno; Lazer = display Trips).
describe.skipIf(!ON)('contrato Metas — paridade com a Performance (fonte única)', () => {
  const RANGE = { p_from: '2026-01-01', p_to: '2026-06-30' }
  it.each(['todos', 'Weddings', 'Lazer', 'Corporativo'])(
    'metas_ritmo_diario[%s].Σserie = get_executiva_kpis.faturamento',
    async (setor) => {
      const ritmo = await rpc('metas_ritmo_diario', { ...RANGE, p_setor: setor }) as { serie: Array<{ valor_total: number }> }
      const kpis  = await rpc('get_executiva_kpis',  { ...RANGE, p_setor: setor }) as { faturamento: { valor: number } }
      const soma = ritmo.serie.reduce((s, d) => s + Number(d.valor_total), 0)
      expect(soma).toBeCloseTo(Number(kpis.faturamento.valor), 2)
    },
  )
})

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
    // solic_tipos_documentacao (v5.4.0/Round4, 0219): gate mais LARGO que a irmã de
    // admin (aceita 'solicitacoes/documentacao' além da gestão) — mas larga só entre
    // áreas, nunca para anon. Entra nesta sonda justamente porque afrouxar gate é o
    // tipo de mudança que precisa de guarda mecânica.
    for (const fn of ['solic_minhas', 'solic_caixa', 'solic_tipos_abertura', 'solic_destinatarios',
                      'solic_concluir', 'criar_solicitacao', 'admin_solic_listar_tipos',
                      'solic_tipos_documentacao', 'solic_movimentacoes']) {
      const status = await rpcAnonStatus(fn, {})
      expect(status, `${fn} deveria negar anon`).toBeGreaterThanOrEqual(400)
    }
  })

  // v5.4.0/Round4 (0219): a irmã enxuta que alimenta a página de Documentação da API
  // devolve a MESMA forma de admin_solic_listar_tipos (o front reaproveita o schema),
  // mas SÓ tipos expostos e não arquivados — é isso que a torna de menor privilégio.
  it('solic_tipos_documentacao: mesma forma da de admin, só tipos expostos e não arquivados', async () => {
    const { tiposAdminSchema } = await import('./solicitacoes/schemas')
    const d = await rpc('solic_tipos_documentacao', {})
    const parsed = tiposAdminSchema.safeParse(d)
    expect(parsed.success, JSON.stringify(parsed.error?.issues?.[0] ?? {})).toBe(true)
    for (const t of parsed.data ?? []) {
      expect(t.exposto_via_api).toBe(true)
      expect(t.arquivado).toBe(false)
    }
  })

  // v4.34.0 Acervo de Documentos: leitura/escrita/download/exclusão exigem sessão — anon
  // negado nas 4 RPCs (acervo_excluir adicionada na M5, migration 0166). acervo_criar com
  // args mínimos garante que, mesmo que o guard falhasse, este teste pegaria ANTES de
  // qualquer persistência (anon não tem EXECUTE → nada é criado/apagado).
  it('Acervo: anon negado em todas as RPCs', async () => {
    const params: Record<string, Record<string, unknown>> = {
      acervo_listar: {},
      acervo_criar: {
        p_titulo: 'x', p_descricao: 'x', p_nome_arquivo: 'x', p_mime: 'x',
        p_tamanho_bytes: 1, p_storage_path: 'docs/anon-negado/x',
      },
      acervo_doc_path: { p_doc_id: 1 },
      acervo_excluir: { p_doc_id: 1 },
    }
    for (const fn of ['acervo_listar', 'acervo_criar', 'acervo_doc_path', 'acervo_excluir']) {
      const status = await rpcAnonStatus(fn, params[fn])
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

// v4.35.0 (Fase 4a) — smoke das RPCs de envio de e-mail (leitura; não escreve). Pega regressão
// de RPC sumida/renomeada/gate quebrado (o `rpc` lança em HTTP != ok). registrar_email é write,
// então NÃO é chamada aqui (não polui o registro).
describe.skipIf(!ON)('contrato RPC — Faturamento Fase 4a (envio de e-mail)', () => {
  it('buscar_docs_fatura([]) e email_existentes([], teste): alcançáveis; array vazio', async () => {
    const docs = await rpc('buscar_docs_fatura', { p_refs: [] }) as unknown as unknown[]
    expect(Array.isArray(docs)).toBe(true)
    expect(docs).toHaveLength(0)
    const enviadas = await rpc('email_existentes', { p_refs: [], p_modo: 'teste' }) as unknown as unknown[]
    expect(Array.isArray(enviadas)).toBe(true)
    expect(enviadas).toHaveLength(0)
  })
})

describe.skipIf(!ON)('contrato RPC — Faturamento v4.37.0 (Emissão consome o Cadastro)', () => {
  it('buscar_cliente_corporativo alcançável (grant intacto) e devolve array', async () => {
    // A Emissão passou a DEPENDER desta RPC (juros/multa no boleto + fallback de e-mail fiscal na NF).
    // Como a leitura na action é FAIL-SAFE, um drop/rename/revogação de grant NÃO daria erro visível —
    // cairia em silêncio para 2/2 em TODO boleto. Este smoke é a rede contra esse drift silencioso.
    const cads = await rpc('buscar_cliente_corporativo', { p_nomes: [] }) as unknown as unknown[]
    expect(Array.isArray(cads)).toBe(true)
    expect(cads).toHaveLength(0)
  })
})

describe.skipIf(!ON)('contrato RPC — Fluxo de Caixa v5.2.0 (Onda 1)', () => {
  // As 4 RPCs novas do eixo movimentação. Gated (exigir_acesso) — a service role passa
  // (mesmo caminho das demais RPCs gated aqui). Schemas em @/lib/fluxo/rpc-fluxo.
  it('get_repasse_mensal(ano): [{mes,ent,sal,pct?,pct_ant?}] — repasse BRUTO', async () => {
    const d = await rpc('get_repasse_mensal', { p_ano: 2026 })
    expect(repasseMensalSchema.safeParse(d).success).toBe(true)
  })
  it('get_fluxo_horizonte(): [{l,liq,e,s,n}]', async () => {
    const d = await rpc('get_fluxo_horizonte', {})
    expect(horizonteSchema.safeParse(d).success).toBe(true)
  })
  it('get_fluxo_runway_semanal(): {saldo_operacional, semanas[13]}', async () => {
    const d = await rpc('get_fluxo_runway_semanal', {})
    const p = runwaySemanalSchema.safeParse(d)
    expect(p.success).toBe(true)
    if (p.success) expect(p.data.semanas.length).toBe(13)
  })
  it('get_fluxo_ranking(): {pioraram[], melhoraram[]}', async () => {
    const d = await rpc('get_fluxo_ranking', { p_limite: 7 })
    expect(rankingCaixaSchema.safeParse(d).success).toBe(true)
  })
  it('get_saldo_caixa(): [{conta,saldo,ordem,data_saldo?,reserva,atualizado_em}] (tabela própria)', async () => {
    const d = await rpc('get_saldo_caixa', {})
    expect(saldoCaixaSchema.safeParse(d).success).toBe(true)
  })
  it('get_fluxo_horizonte() v2: 12 meses rolantes + 2 anos consolidados', async () => {
    const d = await rpc('get_fluxo_horizonte', {}) as { meses?: unknown[]; anos?: unknown[] }
    expect(d.meses?.length).toBe(12)
    expect(d.anos?.length).toBe(2)
  })
  it('get_fluxo_cobertura(): {recebiveis, saidas_mensais[≤12 fechados, ASC]}', async () => {
    const d = await rpc('get_fluxo_cobertura', {})
    const p = coberturaSchema.safeParse(d)
    expect(p.success).toBe(true)
    if (p.success) {
      expect(p.data.saidas_mensais.length).toBeLessThanOrEqual(12)
      const meses = p.data.saidas_mensais.map(m => m.mes)
      expect([...meses].sort()).toEqual(meses) // ordem ASC determinística
    }
  })
  it('get_saldo_repasse(from,to): { sal } — repasse bruto do período', async () => {
    const d = await rpc('get_saldo_repasse', { p_from: '2026-01-01', p_to: '2026-12-31' })
    expect(saldoRepasseSchema.safeParse(d).success).toBe(true)
  })
  it('get_fluxo_previsto_diario(): {vencido_r/p, dias[d≥hoje, ASC]}', async () => {
    const d = await rpc('get_fluxo_previsto_diario', {})
    const p = previstoDiarioSchema.safeParse(d)
    expect(p.success).toBe(true)
    if (p.success) {
      const ds = p.data.dias.map(x => x.d)
      expect([...ds].sort()).toEqual(ds) // ordem ASC determinística (o cliente soma com break)
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
      if (ds.length) expect(ds[0] >= hoje).toBe(true) // vencidos ficam no balde, não na série
    }
  })
})

// ── DRE por Fluxo de Caixa (v5.3.0 · Onda 2 — migrations 0204–0208) ─────────────
// A estrutura é VIVA (editável): os casos validam INVARIANTES estruturais e o shape,
// nunca o conteúdo exato do seed (que o editor pode legitimamente mudar).
describe.skipIf(!ON)('contrato RPC — DRE (v5.3.0)', () => {
  it('get_dre_mensal: shape + fórmula do grafo viva (REPASSE = ENT_H + PAG_H ao centavo)', async () => {
    const anoSP = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 4))
    const d = await rpc('get_dre_mensal', { p_ano: anoSP })
    const p = dreMensalSchema.safeParse(d)
    expect(p.success, p.success ? '' : JSON.stringify(p.error.issues.slice(0, 3))).toBe(true)
    if (!p.success) return
    const linhas = p.data.linhas
    expect(p.data.relacao).toBe('corrente')
    expect(p.data.mes_corrente).not.toBeNull()
    // blocos e categorias presentes; toda cat aponta p/ bloco existente
    const chaves = new Set(linhas.filter(l => l.t !== 'cat' && l.chave).map(l => l.chave as string))
    expect(chaves.size).toBeGreaterThanOrEqual(20)
    for (const c of linhas.filter(l => l.t === 'cat')) expect(chaves.has(c.g as string)).toBe(true)
    // fórmula ancorada por chave, checada VIVA: REPASSE = ENT_H + PAG_H, mês a mês
    const by = (k: string) => linhas.find(l => l.chave === k)
    const ent = by('ENT_H'); const pag = by('PAG_H'); const rep = by('REPASSE')
    expect(ent && pag && rep).toBeTruthy()
    if (ent && pag && rep) {
      for (let i = 0; i < 12; i++) {
        expect(Math.abs(ent.meses[i] + pag.meses[i] - rep.meses[i])).toBeLessThan(0.01)
      }
      const pe = (ent.prev_corrente ?? 0) + (pag.prev_corrente ?? 0)
      expect(Math.abs(pe - (rep.prev_corrente ?? 0))).toBeLessThan(0.01)
    }
  })

  it('get_dre_mensal (ano fechado): tudo realizado, sem coluna híbrida', async () => {
    const anoSP = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 4))
    const d = await rpc('get_dre_mensal', { p_ano: anoSP - 1 })
    const p = dreMensalSchema.safeParse(d)
    expect(p.success).toBe(true)
    if (!p.success) return
    expect(p.data.relacao).toBe('fechado')
    expect(p.data.mes_corrente).toBeNull()
    for (const l of p.data.linhas.slice(0, 5)) expect(l.prev_corrente ?? null).toBeNull()
  })

  it('dre_estrutura: shape + invariantes (XOR excluída/bloco; fórmulas referenciam chaves reais)', async () => {
    const d = await rpc('dre_estrutura', {})
    const p = dreEstruturaSchema.safeParse(d)
    expect(p.success, p.success ? '' : JSON.stringify(p.error.issues.slice(0, 3))).toBe(true)
    if (!p.success) return
    expect(p.data.token).not.toBeNull()
    const chaves = new Set(p.data.blocos.map(b => b.chave))
    for (const b of p.data.blocos) for (const ins of b.formula ?? []) expect(chaves.has(ins)).toBe(true)
    for (const m of p.data.maps) {
      expect(m.excluida ? m.bloco_chave === null : m.bloco_chave !== null).toBe(true)
      if (m.bloco_chave) expect(chaves.has(m.bloco_chave)).toBe(true)
    }
    // bandeja e maps são disjuntos (nada some em silêncio, nada duplica)
    const mapeadas = new Set(p.data.maps.map(m => m.categoria_id))
    for (const b of p.data.bandeja) expect(mapeadas.has(b.categoria_id)).toBe(false)
  })

  it('dre_estrutura_salvar: lote vazio é no-op; token errado → DRE_CONFLITO (nada muda)', async () => {
    const est = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const ok = salvarEstruturaResultSchema.parse(
      await rpc('dre_estrutura_salvar', { p_maps: [], p_token: est.token }),
    )
    expect(ok.ok).toBe(true)
    expect(ok.gravadas).toBe(0)
    await expect(
      rpc('dre_estrutura_salvar', { p_maps: [], p_token: '1970-01-01T00:00:00Z' }),
    ).rejects.toThrow(/DRE_CONFLITO/)
  })

  it('dre_estrutura_historico_lotes: shape (lista pode ser vazia)', async () => {
    const d = await rpc('dre_estrutura_historico_lotes', { p_limit: 5, p_offset: 0 })
    expect(historicoLotesSchema.safeParse(d).success).toBe(true)
  })
})

// As 3 RPCs de undo/detalhe da estrutura, EXECUTADAS (não introspecção — lição 0203):
// ids inexistentes exercitam o corpo até o guard, com efeito zero em produção.
describe.skipIf(!ON)('contrato RPC — DRE undo/detalhe (execução inofensiva)', () => {
  it('dre_estrutura_historico_lote: id inexistente → lista vazia (corpo executa)', async () => {
    const d = await rpc('dre_estrutura_historico_lote', { p_lote: 1 })
    expect(historicoEntradasSchema.safeParse(d).success).toBe(true)
    expect(Array.isArray(d) ? d.length : -1).toBe(0)
  })
  it('dre_estrutura_desfazer_lote/linha: id inexistente → erro amigável, nada muda', async () => {
    await expect(rpc('dre_estrutura_desfazer_lote', { p_lote: 1 })).rejects.toThrow(/inexistente/)
    await expect(rpc('dre_estrutura_desfazer_linha', { p_diario_id: 1 })).rejects.toThrow(/inexistente/)
  })
})

// ── Decomposição por BLOCO (v5.3.1 · 0209) ────────────────────────────────────
// A RECONCILIAÇÃO é o invariante desta versão, e aqui ela deixa de ser anedota: o
// segundo caso PROVA, contra produção, que o net por bloco da decomposição bate ao
// centavo com a coluna do mês correspondente de `get_dre_mensal`. Foi essa igualdade
// que justificou a RPC nova em vez de reusar `get_decomposicao_categoria` (que soma
// `previsto` junto e ignora o de-para curado) — se um dia alguém "otimizar" uma das
// duas funções e a igualdade cair, é aqui que estoura, não na tela do usuário.

/** Mês ANTERIOR ao de hoje em SP, como janela [1º dia, último dia]. É sempre um mês
 *  FECHADO, onde as colunas de `get_dre_mensal` são realizado PURO (o previsto do mês
 *  corrente viaja em `prev_corrente`, fora de `meses[]`) — condição da igualdade. */
function janelaMesAnterior(): { ano: number; mes: number; de: string; ate: string } {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const [y, m] = hoje.split('-').map(Number)
  const mes = m === 1 ? 12 : m - 1
  const ano = m === 1 ? y - 1 : y
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const mm = String(mes).padStart(2, '0')
  return { ano, mes, de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${String(ultimo).padStart(2, '0')}` }
}

describe.skipIf(!ON)('contrato RPC — DRE v5.3.1 (decomposição por bloco)', () => {
  it('get_decomposicao_bloco: shape do payload + toda categoria classificada aponta p/ bloco presente', async () => {
    const { de, ate } = janelaMesAnterior()
    const d = await rpc('get_decomposicao_bloco', { p_from: de, p_to: ate })
    const p = decomposicaoBlocoSchema.safeParse(d)
    expect(p.success, p.success ? '' : JSON.stringify(p.error.issues.slice(0, 3))).toBe(true)
    if (!p.success) return
    expect(p.data.de).toBe(de)
    expect(p.data.ate).toBe(ate)
    const chaves = new Set(p.data.blocos.map(b => b.chave))
    for (const c of p.data.categorias) {
      if (c.bloco_chave !== null) expect(chaves.has(c.bloco_chave)).toBe(true)
    }
  })

  it('get_decomposicao_bloco: RECONCILIA ao centavo com a coluna do mês em get_dre_mensal', async () => {
    const { ano, mes, de, ate } = janelaMesAnterior()
    const [dec, dre] = await Promise.all([
      rpc('get_decomposicao_bloco', { p_from: de, p_to: ate }),
      rpc('get_dre_mensal', { p_ano: ano }),
    ])
    const pd = decomposicaoBlocoSchema.safeParse(dec)
    const pm = dreMensalSchema.safeParse(dre)
    expect(pd.success && pm.success).toBe(true)
    if (!pd.success || !pm.success) return
    // Só os blocos ANALÍTICOS (os que recebem categoria) vêm na decomposição; os de
    // fórmula não, e é isso que impede dupla contagem. Comparação por CHAVE.
    expect(pd.data.blocos.length).toBeGreaterThan(0)
    for (const b of pd.data.blocos) {
      const linha = pm.data.linhas.find(l => l.chave === b.chave)
      expect(linha, `bloco ${b.chave} sem linha em get_dre_mensal`).toBeTruthy()
      if (!linha) continue
      expect(
        Math.abs(linha.meses[mes - 1] - b.valor),
        `bloco ${b.chave}: tabela ${linha.meses[mes - 1]} × decomposição ${b.valor}`,
      ).toBeLessThan(0.01)
    }
  })

  it('get_decomposicao_bloco: nada some — Σ categorias classificadas == Σ blocos; excluídas FORA', async () => {
    const { de, ate } = janelaMesAnterior()
    const [dec, est] = await Promise.all([
      rpc('get_decomposicao_bloco', { p_from: de, p_to: ate }),
      rpc('dre_estrutura', {}),
    ])
    const pd = decomposicaoBlocoSchema.parse(dec)
    const pe = dreEstruturaSchema.parse(est)

    // Conservação: o payload não perde valor entre os dois níveis de agregação. (O
    // filtro de épsilon do CARD é decisão de exibição — o dado aqui é íntegro.)
    const somaCats   = pd.categorias.filter(c => c.bloco_chave !== null).reduce((s, c) => s + c.valor, 0)
    const somaBlocos = pd.blocos.reduce((s, b) => s + b.valor, 0)
    expect(Math.abs(somaCats - somaBlocos)).toBeLessThan(0.01)

    // Excluídas da DRE (transferência interna) NÃO podem aparecer na decomposição —
    // senão as barras deixariam de fechar com a tabela.
    const excluidas = new Set(pe.maps.filter(m => m.excluida).map(m => m.categoria_id))
    for (const c of pd.categorias) expect(excluidas.has(c.categoria_id)).toBe(false)
  })

  // ── Sincronização Monde (v5.4.4, migration 0232) ───────────────────────────────────────
  // `monde_ingest_status` alimenta o rótulo "Última atualização" de /metas E o cartão de
  // monitoramento de admin/uploads; `monde_vendas_ausentes` é o detector do furo que a versão
  // conserta — o invariante mais crítico dela, e até aqui sem rede automatizada.
  // (Fecha também a pendência de contrato de `monde_ingest_status`, aberta desde a v5.1.8.)

  it('monde_ingest_status: shape do painel de sincronização, com as chaves da v5.4.4', async () => {
    const d = await rpc('monde_ingest_status', {}) as Record<string, unknown>

    for (const k of ['vendas', 'itens', 'itens_ativos', 'min_data', 'max_data', 'ultima_sync',
                     'ultima_sincronizacao', 'ultima_reconciliacao', 'reconciliacao_cursor',
                     'ingest_em_curso', 'tripwire']) {
      expect(d, `chave ${k} sumiu do status`).toHaveProperty(k)
    }
    expect(typeof d.vendas).toBe('number')
    expect(d.vendas as number).toBeGreaterThan(0)

    // O selo de atraso de /metas (sync-atraso.ts) depende deste campo existir e ser datável.
    expect(d.ultima_sincronizacao == null || !Number.isNaN(Date.parse(String(d.ultima_sincronizacao)))).toBe(true)

    // Tripwire: null antes da 1ª reconciliação; depois, um objeto com a forma que o cartão lê.
    if (d.tripwire !== null) {
      const t = d.tripwire as { acendeu?: unknown; motivos?: unknown; meses?: unknown }
      expect(typeof t.acendeu).toBe('boolean')
      expect(Array.isArray(t.motivos)).toBe(true)
      expect(typeof t.meses).toBe('object')
      // Invariante do alarme: acende SE E SOMENTE SE há motivo. Alarme sem motivo (ou motivo
      // sem alarme) é exatamente o que tornaria o painel ruído — é o bug que a v5.4.4 evitou.
      expect(t.acendeu).toBe((t.motivos as unknown[]).length > 0)
    }
  })

  it('monde_vendas_ausentes: detecta o que falta e NÃO acusa o que existe', async () => {
    // Janela sem importância: a ausência é checada por venda_numero, que é único global.
    const d = await rpc('monde_vendas_ausentes', {
      p_numeros: ['63165', 'NAO-EXISTE-XYZ-v545'], p_from: '2025-06-01', p_to: '2025-06-30',
    }) as { api?: number; espelho?: number; ausentes_total?: number; ausentes?: string[] }

    expect(d.api).toBe(2)
    expect(typeof d.espelho).toBe('number')
    expect(d.espelho as number).toBeGreaterThan(0)
    expect(d.ausentes_total).toBe(1)
    expect(d.ausentes).toEqual(['NAO-EXISTE-XYZ-v545'])

    // Array vazio é o uso do tripwire (contador puro do espelho no mês): não pode explodir
    // nem inventar ausência.
    const vazio = await rpc('monde_vendas_ausentes', {
      p_numeros: [], p_from: '2026-07-01', p_to: '2026-07-31',
    }) as { api?: number; espelho?: number; ausentes_total?: number }
    expect(vazio.api).toBe(0)
    expect(vazio.ausentes_total).toBe(0)
    expect(vazio.espelho as number).toBeGreaterThan(0)
  })

  // ── v5.4.5 — O ESPELHO NÃO RETÉM VENDA QUE A ORIGEM NÃO RECONHECE ──────────────────────
  //
  // O invariante permanente desta versão. Até a v5.4.4 o `transformSale` descartava a venda
  // cujos produtos foram TODOS cancelados na origem, e como o UPSERT só escreve sobre o
  // universo que pediu, a linha velha ficava congelada — invisível para a escrita, para
  // sempre. Medido em 05/08/2026 nos 12 meses: **24 vendas, R$ 896.718,90 de faturamento e
  // R$ 282.422,05 de receita**, com jul/2026 inflado em 25,19% de receita (número canônico da
  // versão; baseline em `docs/investigacoes/2026-08-05-v5-4-5-baseline-vendas-retidas.md`).
  //
  // ⚠️ O DETECTOR TEM DE SER O TRIPWIRE, e isto não é detalhe. A primeira versão deste teste
  // afirmava `vendas − vendas_que_contam === 0` lendo só o banco — e estava INVERTIDA: a venda
  // retida tem itens ATIVOS no espelho (os valores velhos), então ela "conta" e o delta dá zero
  // JUSTAMENTE quando o defeito existe. Só depois de regravada é que ela fica com itens
  // `canceled` e o delta sobe. Aquele teste passaria hoje e reprovaria depois da correção.
  // O passivo só é visível comparando com a API — que é o que a reconciliação faz e grava no
  // tripwire como `sobrando`.
  //
  // (`vendas − vendas_que_contam` continua sendo informação boa para o CARTÃO: depois da
  // correção ele mostra quantas vendas canceladas estão preservadas para auditoria. Só não
  // serve como alarme.)
  it('v5.4.5: nenhum mês verificado tem venda retida (tripwire.sobrando === 0)', async () => {
    const d = await rpc('monde_ingest_status', {}) as {
      vendas?: number
      vendas_que_contam?: number
      tripwire?: { meses?: Record<string, { mes?: string; sobrando?: number }> } | null
    }

    // A 0237 é que expõe `vendas_que_contam` — o cartão depende dela.
    expect(d, 'a migration 0237 não está aplicada').toHaveProperty('vendas_que_contam')
    expect(typeof d.vendas_que_contam).toBe('number')
    // Sanidade: quem conta nunca pode ser mais que o total espelhado.
    expect(d.vendas_que_contam as number).toBeLessThanOrEqual(d.vendas as number)

    const meses = d.tripwire?.meses ?? {}
    const verificados = Object.entries(meses).filter(([, m]) => m && !('nao_verificado' in m))
    // Sem nenhum mês verificado não há o que afirmar (tripwire ainda não rodou) — não invento
    // aprovação nem reprovo por ausência de dado.
    if (verificados.length === 0) return

    const retidos = verificados
      .filter(([, m]) => (m.sobrando ?? 0) > 0)
      .map(([mes, m]) => `${mes}: ${m.sobrando}`)

    expect(retidos,
      `mês(es) com venda retida no espelho — a origem já não as reconhece e elas seguem somando: ` +
      retidos.join(' · '),
    ).toEqual([])
  })
})
