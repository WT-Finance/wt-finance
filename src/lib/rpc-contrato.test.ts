import { describe, it, expect } from 'vitest'
import { z, type ZodType } from 'zod'
import {
  operacoesWeddingsSchema, carteiraWeddingsSchema, tendenciaMargemSchema,
  rankingVendedoresRangeSchema, vendasReceitaNegativaSchema, executivaKpisSchema,
  vendasEmAbertoSchema, cargaValidacaoSchema, cargaPromocaoSchema,
  mixProdutoSchema, minhasPermissoesSchema, cruzarVendasSetorSchema, buscarPessoasSchema,
  acervoListaSchema, acervoDocSchema,
  metasListarSchema, metasRitmoDiarioSchema, contratosCasamentoMesSchema,
  patrimonioAtivosSchema, patrimonioCatalogosSchema, patrimonioMovimentacoesSchema,
  patrimonioResumoSchema,
  estanteLivrosSchema, estanteMovimentacoesSchema,
  ingestaoPainelSchema,
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
  dreMensalSchema, dreCompMensalSchema, dreCompEstruturaSchema, dreEstruturaSchema,
  historicoLotesSchema, historicoEntradasSchema, decomposicaoBlocoSchema,
} from './dre/schemas'
import {
  resumoMarketingSchema, fornecedoresMarketingSchema, lancamentosMarketingSchema,
} from './marketing/schemas'
import { proporcaoReceitaMarketingSchema } from './marketing/schemas-proporcao'
import { montarPonte } from './dre/ponte-regimes'
import { montarDecomposicao } from './dre/decomposicao-variacao'
import { LINHAS_CAIXA, LINHAS_COMPETENCIA } from './dre/linhas-resumo'
import { montarProporcaoGrupos, GRUPOS_PROPORCAO } from './dre/proporcao-grupos'
import { janelaYtdCompetencia } from './dre/janela-competencia'
import { folhasPorGrupo, totalFolhas } from './dre/folhas'
import { duracaoDias, margemAnualizada } from './weddings/margem-anualizada'
import { rendimentoFloatSchema, taxasCdiSchema } from './weddings/schemas-float'
import { LIMITE_MESES_FLUXO } from './fluxo/janela-mensal'
import { hojeSP } from './fmt'
import { tokenMaquina, credencialConfigurada } from './auth/credencial-maquina'

// CONTRATO das RPCs críticas (números que a diretoria vê). Bate via REST com a
// credencial de VERIFICAÇÃO (`verificador`, v6.0.0 — antes era a service role) e valida SHAPE + INVARIANTES de
// negócio. skipIf sem credenciais → o gate `npm test` passa offline; com .env.local
// carregado (vitest.setup.ts), roda de verdade. Só LEITURA — com UMA exceção
// deliberada: o caso de dre_estrutura_salvar envia um lote VAZIO (no-op, gravadas=0)
// para exercitar a trava otimista; nenhum dado muda.

// A URL do .env pode vir como host puro OU já com /rest/v1 (e/ou trailing slash).
// Normalizamos para o host e remontamos o endpoint REST — evita /rest/v1//rest/v1.
const RAW = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const HOST = RAW.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
// v6.0.0/M1 — a credencial que VERIFICA não escreve: o JWT do papel `verificador` (role do
// Postgres com EXECUTE só na allowlist derivada deste arquivo — `scripts/credencial/
// derivar-allowlist.mjs`, migration 0273). `apikey` é a anon key (o gateway exige uma chave
// do projeto no header); a identidade vem do Bearer. `SUPABASE_SERVICE_ROLE_KEY` não entra
// mais aqui: a sonda `sonda-credencial.test.ts` reprova quem voltar a usá-la fora dos pontos
// declarados. RPC nova nasce FORA da allowlist de propósito — o caso de contrato dela falha
// com PERMISSAO_NEGADA (42501 → HTTP 403) até alguém conceder o EXECUTE deliberadamente.
// A credencial é o LOGIN do usuário de máquina (`SUPABASE_VERIFICADOR_SENHA` + anon key +
// SUPABASE_URL); o token ES256 de 1 h vem do Auth e o `custom_access_token_hook` (0275) põe
// `role=verificador` nele. `tokenMaquina` cacheia no processo — um login por rodada.
const APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const ON = credencialConfigurada('verificador')

async function rpc(fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: APIKEY as string,
      Authorization: `Bearer ${await tokenMaquina('verificador')}`,
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

    // `produtos` é array OU **null**: o `jsonb_agg` de conjunto vazio devolve NULL, então
    // qualquer período/setor sem venda vem com `produtos: null`. A asserção anterior era
    // `Array.isArray(...) === true`, o que contradizia a própria guarda logo abaixo
    // (`if (d.produtos && ...)`) — ela previa o caso vazio, a asserção não. Passava só
    // porque a base tinha dado; com a base de Vendas vazia, quebrou. O que o caso prova de
    // verdade — tipos dos campos e soma dos % ≈ 100 — está preservado no ramo com dado.
    // O tratamento do null no APP é do `mixProdutoSchema`, que normaliza para [].
    expect(d.produtos === null || Array.isArray(d.produtos)).toBe(true)
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
// Ano corrente em SÃO PAULO (o fuso das RPCs de app — migration 0152) e o último ano FECHADO.
// Usados pela lista F7 logo abaixo e pelo bloco de Gastos de Marketing (v6.3.0) no fim do arquivo.
const ANO_SP_MKT = Number(hojeSP().slice(0, 4))
const ANO_FECHADO_MKT = ANO_SP_MKT - 1

const CONTRATOS_PARSE_RPC: Array<{ fn: string; params: Record<string, unknown>; schema: ZodType }> = [
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'data_evento', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
  // v5.4.2: MESMA RPC com a chave de ordenação NOVA. Existe porque a whitelist do
  // ORDER BY termina em `ELSE 'd_data_evento'` — um typo em `d_margem_aa` ou a perda
  // do `WHEN` não dariam erro, só ordenariam por outra coisa em silêncio. Chamar a RPC
  // viva com o valor pega coluna inexistente na hora (o EXECUTE estoura).
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'margem_aa',   p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
  // v5.5.0: idem para 'rend_float'. O contrato completo da chave (enum da rota ×
  // `CASE` do SQL) tem guard próprio, sem banco, em
  // `weddings/ordenacao-operacoes.test.ts` — foi a camada do ENUM que quebrou nesta
  // versão. Aqui a chave bate na RPC VIVA, que é a outra ponta.
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'rend_float',  p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
  // v5.5.1: idem para a "Margem Teórica (a.a.)" (chave da 0246).
  { fn: 'get_operacoes_weddings',        params: { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'margem_teorica_aa', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200 }, schema: operacoesWeddingsSchema },
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
  // v5.9.3 (0266) → v6.0.0/M1: `admin_acesso_solicitacoes_pendentes` SAIU desta lista. É gated em
  // 'admin/acessos', área que a credencial de verificação não tem por decisão; o caso dela virou
  // prova NEGATIVA no bloco "GATE 2" abaixo (verificador ⇒ PERMISSAO_NEGADA) + tipo de retorno
  // lido do catálogo. Validar o inteiro vivo exigiria a área administrativa na credencial.
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
  // v5.6.2: contagem da "Meta de Assessorias" (0249) — o schema de 1 campo é validado
  // contra a RPC viva; as invariantes de negócio têm describe próprio mais abaixo.
  { fn: 'get_contratos_casamento_mes',   params: { p_from: '2025-07-01', p_to: '2025-07-31' },                         schema: contratosCasamentoMesSchema },
  // v5.9.4 (B4): as duas RPCs do float passavam por CAST, sem contrato. Agora têm schema +
  // parseRpc nos call-sites (route da operação e weddings-content); drift degrada para "sem
  // dado" (o caminho que já existia), em vez de vazar objeto malformado para a UI.
  { fn: 'get_taxas_cdi',                 params: { p_meses_passados: 37, p_meses_futuros: 36 },                        schema: taxasCdiSchema },
  { fn: 'get_rendimento_float',          params: {},                                                                   schema: rendimentoFloatSchema },
  // v6.3.0 (0292): as 3 RPCs de "Gastos de Marketing". O ano é o último FECHADO (calculado, não
  // fixo): estável durante o ano corrente. As invariantes (paridade com a DRE, completude, lista
  // fechada, ano vazio/inválido, negações) têm bloco próprio no fim do arquivo.
  { fn: 'get_marketing_gastos_resumo',       params: { p_ano: ANO_FECHADO_MKT },                                       schema: resumoMarketingSchema },
  { fn: 'get_marketing_gastos_fornecedores', params: { p_ano: ANO_FECHADO_MKT },                                       schema: fornecedoresMarketingSchema },
  { fn: 'get_marketing_gastos_lancamentos',  params: { p_ano: ANO_FECHADO_MKT },                                       schema: lancamentosMarketingSchema },
  // v6.3.0 (0293): os insumos (centavos) da proporção Marketing / Receita Bruta por COMPETÊNCIA. A
  // paridade com a grade da DRE tem bloco próprio logo após o de Gastos de Marketing.
  { fn: 'get_marketing_proporcao_receita',   params: { p_ano: ANO_FECHADO_MKT },                                       schema: proporcaoReceitaMarketingSchema },
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
  // v5.9.1 — `sou_autor` por anexo (migration 0264): é ele que decide se a UI oferece o
  // botão de excluir. Três formas, como as demais chaves opcionais: ausente (RPC antiga
  // durante o rollout), false (anexo de outra pessoa) e true (meu anexo).
  it('sou_autor no anexo: aceita ausente (RPC antiga), false e true', () => {
    expect(solicitacaoSchema.safeParse(SOLIC_JSON_FIXTURE).success).toBe(true) // fixture sem a chave
    const comAutor = (v: boolean) => ({
      ...SOLIC_JSON_FIXTURE,
      anexos: SOLIC_JSON_FIXTURE.anexos.map(a => ({ ...a, sou_autor: v })),
    })
    for (const v of [false, true]) {
      const r = solicitacaoSchema.safeParse(comAutor(v))
      expect(r.success, r.success ? '' : `drift de sou_autor: ${JSON.stringify(r.error!.issues.slice(0, 5))}`).toBe(true)
      if (r.success) expect(r.data.anexos[0].sou_autor).toBe(v)
    }
  })

  // v5.9.0 — `aprovado_em`/`aprovado_por_email` (migration 0258). Mesmas três formas que
  // `origem` precisou cobrir: AUSENTE (RPC antiga durante o rollout), null (nunca aprovada)
  // e PREENCHIDO. O fixture acima só cobre a primeira, e implicitamente — sem o caso
  // preenchido, o schema poderia estar errado e o teste passaria mesmo assim.
  it('aprovado_em/por: aceita ausente (RPC antiga), null (nunca aprovada) e preenchido', () => {
    expect(solicitacaoSchema.safeParse(SOLIC_JSON_FIXTURE).success).toBe(true) // sem as chaves
    expect(solicitacaoSchema.safeParse({
      ...SOLIC_JSON_FIXTURE, aprovado_em: null, aprovado_por_email: null,
    }).success).toBe(true)
    const r = solicitacaoSchema.safeParse({
      ...SOLIC_JSON_FIXTURE,
      aprovado_em: '2026-08-25T18:03:11.204512+00:00',
      aprovado_por_email: 'carine@welcometrips.com.br',
    })
    expect(r.success, r.success ? '' : `drift da aprovação: ${JSON.stringify(r.error!.issues.slice(0, 8))}`).toBe(true)
    if (r.success) expect(r.data.aprovado_por_email).toBe('carine@welcometrips.com.br')
  })
  // A aprovação NÃO é derivada do desfecho: uma solicitação concluída pode (e deve) carregar
  // os dois pares — decidido_* E aprovado_* — com atores e instantes distintos. Se alguém
  // "simplificar" o schema fundindo os dois, este caso reprova.
  it('uma solicitação concluída aceita trilha de aprovação com ator distinto de quem concluiu', () => {
    const r = solicitacaoSchema.safeParse({
      ...SOLIC_JSON_FIXTURE,                                   // status 'concluida', decidido por carine
      aprovado_em: '2026-06-12T20:30:00.000000+00:00',
      aprovado_por_email: 'diretoria@welcometrips.com.br',
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.aprovado_por_email).not.toBe(r.data.decidido_por_email)
      expect(r.data.status).toBe('concluida')
    }
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
// ── Inventário de Ativos (v5.6.0, migrations 0247/0248) ──────────────────────
// SÓ LEITURA. As RPCs de escrita são exercitadas fora do `npm test`, por bateria própria com
// limpeza (criar ativo aqui deixaria lixo em produção e mexeria na sequência do código WG-XXXX).
//
// Os dois casos que importam:
//   1. os SCHEMAS ZOD do app validam o retorno real — o `tsc` não vê shape de runtime;
//   2. `resumo` e `listar_ativos` CONCORDAM. Os dois aparecem na MESMA tela (faixa de
//      contagens acima, tabela abaixo) e derivam o estado por caminhos SQL diferentes. Se
//      divergirem, a tela discorda de si mesma e ninguém sabe qual número está certo — é a
//      lição da v5.3.1, virada caso de contrato em vez de nota de rodapé.
//
// Funciona com a base VAZIA (compara 0 com 0, e prova o shape) e passa a valer de verdade no
// minuto em que o primeiro ativo real for cadastrado.
describe.skipIf(!ON)('contrato RPC — Inventário de Ativos (leitura)', () => {
  it('patrimonio_catalogos: shape valida e o seed dos catálogos está no ar', async () => {
    const d = await rpc('patrimonio_catalogos', {})
    const cat = patrimonioCatalogosSchema.parse(d)
    // Seed da 0247, confirmado pelo Yan no checkpoint: 6 categorias e 7 áreas.
    expect(cat.categorias.length).toBe(6)
    expect(cat.areas.length).toBe(7)
    expect(cat.categorias.map(c => c.nome)).toContain('Informática')
  })

  it('patrimonio_listar_ativos e patrimonio_listar_movimentacoes: shape valida', async () => {
    patrimonioAtivosSchema.parse(await rpc('patrimonio_listar_ativos', {}))
    patrimonioMovimentacoesSchema.parse(await rpc('patrimonio_listar_movimentacoes', { p_limite: 50 }))
  })

  it('patrimonio_resumo CONCORDA com a agregação de patrimonio_listar_ativos', async () => {
    const resumo = patrimonioResumoSchema.parse(await rpc('patrimonio_resumo', {}))
    const lista = patrimonioAtivosSchema.parse(await rpc('patrimonio_listar_ativos', {}))
    const conta = (s: string) => lista.filter(l => l.status === s).length

    expect(resumo.cadastrados).toBe(lista.length)
    expect(resumo.em_uso).toBe(conta('em_uso'))
    expect(resumo.em_estoque).toBe(conta('em_estoque'))
    expect(resumo.em_manutencao).toBe(conta('em_manutencao'))
    expect(resumo.emprestados).toBe(conta('emprestado'))
    expect(resumo.baixados).toBe(conta('baixado'))
    // As cinco situações têm de FECHAR o total — foi por isso que "Emprestados" entrou na
    // faixa de contagens (o briefing não a listava e a soma não batia).
    const soma = resumo.em_uso + resumo.em_estoque + resumo.em_manutencao
      + resumo.emprestados + resumo.baixados
    expect(soma).toBe(resumo.cadastrados)

    // Custo histórico: soma dos NÃO-BAIXADOS, e ativo sem valor fica FORA em vez de virar 0.
    const vivos = lista.filter(l => l.status !== 'baixado')
    const custo = vivos.reduce((s, l) => s + (l.valor_aquisicao ?? 0), 0)
    expect(Math.abs(resumo.custo_historico_aquisicao - custo)).toBeLessThan(0.005)
    expect(resumo.sem_valor).toBe(vivos.filter(l => l.valor_aquisicao == null).length)

    // As barras da Visão geral também contam só os vivos.
    expect(resumo.por_categoria.reduce((s, c) => s + c.n, 0)).toBe(vivos.length)
    expect(resumo.por_area.reduce((s, a) => s + a.n, 0)).toBe(vivos.length)
  })

  it('p_status filtra pelo estado DERIVADO, não por coluna', async () => {
    // Não existe coluna `status` em patrimonio.ativo (invariante 1): o filtro roda sobre a
    // derivação. Se alguém criasse a coluna espelho, este caso continuaria passando — o que
    // pega a coluna espelho é o revisor-db; aqui provamos que o filtro e a lista concordam.
    const todos = patrimonioAtivosSchema.parse(await rpc('patrimonio_listar_ativos', {}))
    const soUso = patrimonioAtivosSchema.parse(await rpc('patrimonio_listar_ativos', { p_status: 'em_uso' }))
    expect(soUso.every(l => l.status === 'em_uso')).toBe(true)
    expect(soUso.length).toBe(todos.filter(l => l.status === 'em_uso').length)
  })
})

describe.skipIf(!ON)('contrato RPC — Estante Welcome (leitura)', () => {
  it('estante_listar_livros e estante_listar_movimentacoes: shape valida pelo caminho REST', async () => {
    // O teste comportamental de `estante-rpcs.test.ts` bate direto em `pg`, sem passar por
    // PostgREST/GRANT a `authenticated`/serialização REST — é este caso que prova o caminho
    // que a aplicação de fato usa (molde: patrimonio_listar_ativos acima).
    estanteLivrosSchema.parse(await rpc('estante_listar_livros', {}))
    estanteMovimentacoesSchema.parse(await rpc('estante_listar_movimentacoes', { p_limite: 50 }))
  })
})

describe('gate de contrato — online obrigatório quando exigido (M10)', () => {
  it('REQUIRE_CONTRACT=1 exige credenciais (online não pode ser pulado)', () => {
    const exigido = process.env.REQUIRE_CONTRACT === '1'
    if (exigido) {
      expect(ON, 'REQUIRE_CONTRACT=1 mas faltam SUPABASE_URL/SUPABASE_VERIFICADOR_SENHA/NEXT_PUBLIC_SUPABASE_ANON_KEY → contrato/RBAC seriam pulados').toBe(true)
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
  // v6.2.3: linha sem setor (migration 0291) — passa com AVISO e a chave sem_setor
  it('cargaValidacaoSchema aceita o retorno com linhas sem setor (sem_setor + aviso)', () => {
    const r = cargaValidacaoSchema.safeParse({
      ok: true, total: 100, data_min: '2026-01-01', data_max: '2026-03-01',
      dim_min: '2022-01-01', dim_max: '2030-12-31', fora_do_range: 0, setor_fora: 0, sem_setor: 2,
      erros: [],
      avisos: ['2 linha(s) sem Setor no Monde, de 1 venda(s), ficaram de fora das telas nesta carga — vendas: 123. Elas voltam sozinhas na próxima carga em que o Setor estiver preenchido. A carga prossegue.'],
    })
    expect(r.success).toBe(true)
    expect(r.success && r.data.sem_setor).toBe(2)
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

// ── v6.0.0/M1 — GATE 2 (parte 1): a credencial que VERIFICA não escreve ──────────────────
// Reprodução controlada do incidente de 10/09/2026 (varredura com service_role chamou
// funções de TRUNCATE e zerou 10 tabelas): a MESMA chamada, com o JWT do `verificador`, tem
// de ser NEGADA pelo servidor — não pela disciplina. Duas camadas, nesta ordem:
//   (1) o CATÁLOGO diz que a role não tem EXECUTE (`has_function_privilege`) — se disser que
//       tem, o caso reprova ANTES de qualquer chamada de rede (uma chamada real a `truncar_*`
//       com privilégio seria o próprio incidente de novo);
//   (2) só então a chamada REST, que tem de voltar 4xx (42501 → 403; sem EXECUTE o PostgREST
//       também pode responder 404) e, sobretudo, NÃO executar.
// E o espelho para a área administrativa: `admin_*` é gated em 'admin/acessos', que a
// credencial não tem por decisão — PERMISSAO_NEGADA aqui prova que a allowlist de EXECUTE e
// o RBAC de área são camadas independentes (ter o grant não basta).
async function statusVerificador(fn: string, body: Record<string, unknown>): Promise<{ status: number; texto: string }> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: APIKEY as string, Authorization: `Bearer ${await tokenMaquina('verificador')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, texto: await res.text() }
}

/** `has_function_privilege('verificador', '<assinatura>', 'EXECUTE')` lido do catálogo vivo, em
 *  conexão READ ONLY. `null` = função inexistente (o caso não deve chamar nada). */
async function verificadorTemExecute(assinatura: string): Promise<boolean | null> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await c.connect()
  await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
  try {
    const r = await c.query(
      `SELECT CASE WHEN to_regprocedure($1) IS NULL THEN NULL
                   ELSE has_function_privilege('verificador', $1, 'EXECUTE') END AS tem`,
      [assinatura],
    ) as { rows: Array<{ tem: boolean | null }> }
    return r.rows[0]?.tem ?? null
  } finally { await c.end() }
}

describe.skipIf(!ON || !process.env.SUPABASE_DB_URL)('GATE 2 — a credencial de verificação NÃO escreve nem administra (v6.0.0/M1)', () => {
  // A lista nasceu com as funções do incidente (WORKING-CONTEXT: 10 tabelas zeradas) e outras
  // escritas do legado: as `truncar_*`, `truncate_dynamic_tables` e a `promover_carga_vendas()`
  // zero-arg — todas apagadas pela migration destrutiva 0286 (v6.0.1). Saíram desta lista
  // (função inexistente não é caso de
  // "sem EXECUTE", é caso de "não existe"; `it.each` reprovaria com `assinatura mudou?`).
  // O que fica prova a mesma coisa (verificador não escreve) contra funções de escrita que
  // CONTINUAM no catálogo. Assinaturas completas — grant e privilégio são por assinatura, não
  // por nome.
  const ESCRITA = [
    'public.promover_carga_pessoas()',
    'public.limpar_staging_vendas()',
    'public.limpar_staging_pessoas()',
  ]

  it.each(ESCRITA)('%s: sem EXECUTE no catálogo E negada via REST', async (assinatura) => {
    const tem = await verificadorTemExecute(assinatura)
    expect(tem, `${assinatura}: função inexistente no catálogo (assinatura mudou?)`).not.toBeNull()
    // Camada 1 — se o catálogo diz que a role PODE executar, parar AQUI: chamar seria o incidente.
    expect(tem, `${assinatura}: a role verificador TEM EXECUTE — allowlist vazou para uma função de escrita`).toBe(false)
    // Camada 2 — a barreira vista negando (não basta o catálogo dizer).
    const nome = assinatura.replace(/^public\./, '').replace(/\(.*$/, '')
    const { status, texto } = await statusVerificador(nome, {})
    expect(status, `${nome}: esperado 4xx, veio ${status}: ${texto}`).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it.each([
    ['admin_listar_areas', {}],
    ['admin_acesso_solicitacoes_pendentes', {}],
  ] as const)('%s: área administrativa → 42501 para a credencial de verificação (GRANT ou RBAC)', async (fn, body) => {
    // Duas camadas podem negar, e a ORDEM é do servidor: sem EXECUTE (a allowlist não tem
    // admin_*) o Postgres devolve "permission denied for function" ANTES de `exigir_acesso`
    // rodar; se um dia o grant existir, é o RBAC que nega com PERMISSAO_NEGADA. Ambas são 42501
    // → 403. O que se afirma é que a credencial NÃO alcança administração — por qualquer camada.
    // Medido em 22/09/2026: a camada que dispara hoje é a de GRANT.
    const { status, texto } = await statusVerificador(fn, body as Record<string, unknown>)
    expect(status, `${fn}: esperado 403, veio ${status}: ${texto}`).toBe(403)
    expect(texto).toMatch(/"42501"/)
    expect(texto).toMatch(/PERMISSAO_NEGADA|permission denied for function/)
  })

  it('admin_acesso_solicitacoes_pendentes devolve integer (tipo lido do catálogo, já que o corpo é inalcançável)', async () => {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
    await c.connect()
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try {
      const r = await c.query(
        `SELECT pg_get_function_result(p.oid) AS ret FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'admin_acesso_solicitacoes_pendentes'`,
      ) as { rows: Array<{ ret: string }> }
      expect(r.rows.map(x => x.ret)).toEqual(['integer'])
    } finally { await c.end() }
  })
})

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

// v5.6.1 — COMPARATIVO: a composição da seção (metas_listar + get_executiva_kpis via
// montarComparativo) tem de reproduzir os números dos MetaCards para um mês-calendário
// inteiro: previsto ≡ metaPeriodo do ritmo (a pró-rata degenera no valor cheio em mês
// completo) e realizado ≡ faturamento da MESMA get_executiva_kpis. Divergiu ⇒ o
// Comparativo mente na própria página de Metas.
describe.skipIf(!ON)('contrato Metas — paridade do Comparativo com os MetaCards (v5.6.1)', () => {
  const MES = { ano: 2026, mes: 7 } // jul/26: mês fechado, usado na referência do briefing
  it.each(['todos', 'Weddings', 'Lazer', 'Corporativo'])(
    'comparativo[%s]: previsto ≡ metaPeriodo e realizado ≡ faturamento dos KPIs',
    async (setor) => {
      const { montarComparativo, periodoDeMes, chavePeriodo, janelaDoMes } = await import('./metas/comparativo')
      const { metasDoSetor } = await import('./metas/paineis')
      const { calcularRitmo } = await import('./metas/ritmo')

      const { from, to } = janelaDoMes(MES)
      const listar = await rpc('metas_listar', { p_ano: MES.ano }) as {
        ano: number
        metas: Array<{ setor_nome: string; mes: number; valor_meta: number; pct_receita: number | null }>
      }
      const kpis = await rpc('get_executiva_kpis', { p_from: from, p_to: to, p_setor: setor }) as {
        faturamento: { valor: number }
      }

      const metas = metasDoSetor(
        listar.metas.map(m => ({
          ano: listar.ano, setor_nome: m.setor_nome, mes: m.mes,
          valor_meta: Number(m.valor_meta), pct_receita: m.pct_receita,
        })),
        setor,
      )
      const P = periodoDeMes(MES) // a unidade virou período na v5.6.4; mês único é o caso N=1
      const realizadoPorPeriodo = new Map([[chavePeriodo(P), Number(kpis.faturamento.valor)]])
      const { foco } = montarComparativo({ periodos: [P], hoje: '2026-08-11', metas, realizadoPorPeriodo })

      // Previsto ≡ meta do MESMO mês nos MetaCards (sem meta cadastrada, ambos zeram).
      const ritmo = calcularRitmo({ from, to, ultimaVenda: to, metas, serie: [] })
      expect(foco.previsto ?? 0).toBeCloseTo(ritmo.metaPeriodo, 2)
      // Realizado ≡ faturamento da mesma RPC que alimenta os MetaCards.
      expect(Number(foco.realizado)).toBeCloseTo(Number(kpis.faturamento.valor), 2)
    },
  )
})

// v5.6.4 — RANGE do Comparativo: o "Personalizado" agora manda UMA janela composta
// (jan–abr) para get_executiva_kpis em vez de N janelas mensais. O contrato que
// sustenta isso é a ADITIVIDADE do faturamento sobre janelas adjacentes: a janela
// composta tem de bater com a soma das mensais — senão o range mostraria um número
// que não é a soma dos meses que os MetaCards mostram.
describe.skipIf(!ON)('contrato Metas — janela composta ≡ soma das janelas mensais (v5.6.4)', () => {
  it('get_executiva_kpis(jan–abr/26) ≈ Σ get_executiva_kpis(mês a mês)', async () => {
    const { janelaDoPeriodo, janelaDoMes, mesesDoPeriodo } = await import('./metas/comparativo')
    const P = { inicio: { ano: 2026, mes: 1 }, fim: { ano: 2026, mes: 4 } } // fechado (hoje é ago/26)

    const { from, to } = janelaDoPeriodo(P)
    const composto = await rpc('get_executiva_kpis', { p_from: from, p_to: to, p_setor: 'todos' }) as {
      faturamento: { valor: number }
    }
    const mensais = await Promise.all(mesesDoPeriodo(P).map(async m => {
      const j = janelaDoMes(m)
      const k = await rpc('get_executiva_kpis', { p_from: j.from, p_to: j.to, p_setor: 'todos' }) as {
        faturamento: { valor: number }
      }
      return Number(k.faturamento.valor)
    }))

    const soma = mensais.reduce((s, v) => s + v, 0)
    expect(Number(composto.faturamento.valor)).toBeCloseTo(soma, 2)
  })
})

// v5.6.2 — "Meta de Assessorias": get_contratos_casamento_mes (0249) conta contratos de
// casamento no espelho Monde por DESCRIÇÃO ('contrato de casamento%', itens ativos, só
// Weddings). Invariantes baratas e estáveis contra dado vivo: shape inteiro ≥ 0 e
// monotonicidade janela-mês ⊆ janela-ano (não se fixa valor absoluto: cancelamento
// retroativo existe — v5.4.5).
describe.skipIf(!ON)('contrato RPC — get_contratos_casamento_mes (v5.6.2)', () => {
  it('shape {n_contratos:int ≥ 0} e mês ⊆ ano', async () => {
    const mes = await rpc('get_contratos_casamento_mes', { p_from: '2025-07-01', p_to: '2025-07-31' }) as { n_contratos: number }
    const ano = await rpc('get_contratos_casamento_mes', { p_from: '2025-01-01', p_to: '2025-12-31' }) as { n_contratos: number }
    expect(Number.isInteger(mes.n_contratos)).toBe(true)
    expect(mes.n_contratos).toBeGreaterThanOrEqual(0)
    expect(ano.n_contratos).toBeGreaterThanOrEqual(mes.n_contratos)
  })
})

describe.skipIf(!ON || !ANON)('contrato RBAC — guards e revogações (v4.13)', () => {
  // v6.0.0/M1: lia `admin_listar_areas`, gated em 'admin/acessos' — área que a credencial de
  // verificação NÃO tem (decisão: todas as áreas de leitura, nenhuma administrativa). A
  // asserção é a mesma (catálogo do banco ≡ AREAS do app); a fonte passa a ser a tabela,
  // lida pela conexão direta READ ONLY — o que se prova aqui é paridade de catálogo, não a
  // RPC de administração.
  it.skipIf(!process.env.SUPABASE_DB_URL)('catálogo de áreas: banco (app.rbac_areas) ↔ app (AREAS) idênticos', async () => {
    const { AREAS } = await import('./auth/areas')
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
    await c.connect()
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try {
      const r = await c.query('SELECT area FROM app.rbac_areas') as { rows: Array<{ area: string }> }
      expect(r.rows.map(a => a.area).sort()).toEqual([...AREAS].sort())
    } finally { await c.end() }
  })

  // v6.0.0/M1: com o JWT do `verificador`, `auth.uid()` É um usuário real e ativo
  // (`verificador@janus.interno`) — o caso deixa de provar "sem usuário" (comportamento do
  // service_role, que não existe mais neste arquivo) e passa a provar a identidade da
  // credencial: registrado, ativo, e com TODAS as áreas de leitura (as do catálogo menos o
  // grupo Administração — a mesma regra da migration 0273).
  it('get_minhas_permissoes: a credencial de verificação é um usuário ativo com todas as áreas de leitura', async () => {
    const d = await rpc('get_minhas_permissoes', {}) as { registrado?: boolean; ativo?: boolean; email?: string; permissoes?: string[] }
    expect(d.registrado).toBe(true)
    expect(d.ativo).toBe(true)
    expect(d.email).toBe('verificador@janus.interno')
    expect(Array.isArray(d.permissoes)).toBe(true)
    const { AREAS, AREA_INFO } = await import('./auth/areas')
    const leitura = AREAS.filter(a => AREA_INFO[a].grupo !== 'Administração')
    expect([...(d.permissoes ?? [])].sort()).toEqual([...leitura].sort())
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
    // Pipeline atômico (0116/0118, usado pelo caminho real da UI via service role): TODAS
    // service_role-only → anon negado (v4.15.0/F2-real). `truncate_dynamic_tables`,
    // `inserir_lote_raw` e a `promover_carga_vendas()` zero-arg saíram desta lista — apagadas
    // pela migration destrutiva 0286 (v6.0.1); chamar um nome que não existe mais viraria 404
    // (função ausente), não a negação de acesso que este caso prova. O que fica continua vivo
    // no catálogo e continua sendo o caminho real do pipeline de Vendas.
    const comLinhas = new Set(['inserir_lote_staging'])
    for (const fn of [
      'limpar_staging_vendas', 'inserir_lote_staging', 'validar_carga_staging',
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

  // v5.9.3 (0266): a contagem de pendências de acesso é gated em 'admin/acessos' — anon não
  // pode nem saber QUANTOS pedidos existem.
  it('admin_acesso_solicitacoes_pendentes nega anon (sem JWT → erro)', async () => {
    const status = await rpcAnonStatus('admin_acesso_solicitacoes_pendentes', {})
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

  // v6.0.0/M1: o caso "dre_estrutura_salvar: lote vazio é no-op; token errado → DRE_CONFLITO"
  // saiu daqui — conceder EXECUTE numa RPC de ESCRITA à credencial de verificação a tornaria
  // capaz de escrever (achado ALTO do revisor-db). Vive em `src/lib/dre/reverter-diario.test.ts`,
  // em transação revertida com identidade simulada. O shape do retorno é conferido lá contra o
  // valor real, com o mesmo schema Zod do call-site.

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
  // v6.0.0/M1: "dre_estrutura_desfazer_lote/linha: id inexistente → erro amigável" saiu daqui
  // pelo mesmo motivo do salvar (RPC de escrita fora da allowlist do verificador) — vive em
  // `src/lib/dre/reverter-diario.test.ts`, em transação revertida.
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

// ── Rendimento potencial do float (v5.5.0 · 0238–0243) ───────────────────────
// A regra "qual taxa vale para o mês M" e a conta composta existem em QUATRO
// implementações: `taxa_por_mes` (view), `get_taxas_cdi`, `get_rendimento_float` e —
// no cliente, para o gráfico — `curvasFloat`. Estão idênticas hoje, e "idêntico hoje"
// sem rede é exatamente como a próxima otimização quebra a tela em silêncio
// (skill `banco-e-rpc` §7). Achado ALTO do `revisor-db` no fechamento desta versão.
// Este bloco amarra as pontas que passam pelo BANCO; a do cliente é fixada por
// fixture numérica em `weddings/float-virtual.test.ts`.
describe.skipIf(!ON)('contrato RPC — Rendimento potencial do float', () => {
  it('taxa_vigente_mes é a MESMA nas três RPCs, e é um mês FECHADO', async () => {
    const [taxas, float, lista] = await Promise.all([
      rpc('get_taxas_cdi', { p_meses_passados: 37, p_meses_futuros: 36 }),
      rpc('get_rendimento_float', {}),
      rpc('get_operacoes_weddings', {
        p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'rend_float',
        p_direcao: 'desc', p_pagina: 1, p_por_pagina: 50,
      }),
    ])

    const vigente = taxas.taxa_vigente_mes as string | null
    expect(vigente, 'a série do CDI não tem nenhum mês fechado — a ingestão nunca rodou').toBeTruthy()
    expect(float.taxa_vigente_mes).toBe(vigente)
    expect(lista.taxa_vigente_mes).toBe(vigente)

    // FECHADO = estritamente anterior ao 1º dia do mês corrente. Se o mês corrente
    // voltar a entrar, o rendimento projetado inteiro passa a ser calculado sobre um
    // acumulado PARCIAL — o defeito que a 0240 consertou, e que era invisível na tela.
    const mesCorrente = `${hojeSP().slice(0, 7)}-01`
    expect(vigente! < mesCorrente,
      `taxa vigente ${vigente} não é mês fechado (corrente = ${mesCorrente})`).toBe(true)
  })

  it('a coluna da Lista é o MESMO número que o bloco do drawer', async () => {
    const lista = await rpc('get_operacoes_weddings', {
      p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'rend_float',
      p_direcao: 'desc', p_pagina: 1, p_por_pagina: 10,
    })
    const linhas = (lista.operacoes as Array<{ operacao: string; rend_float: number | null }>)
      .filter(o => o.rend_float !== null)
    if (linhas.length === 0) return // sem dado, nada a afirmar

    const drawer = await rpc('get_rendimento_float', { p_operacao: linhas[0].operacao })
    const b = (drawer.operacoes as Array<Record<string, number | null>>)[0]

    expect(Number(b.rendimento)).toBe(Number(linhas[0].rend_float))
    // A abertura fecha o total por CONSTRUÇÃO (0242) — não é reconciliação.
    expect(Number(b.rendimento_positivo) + Number(b.custo_negativo))
      .toBeCloseTo(Number(b.rendimento), 2)
    expect(b.meses_positivos as number).toBeLessThanOrEqual(b.meses_total as number)
  })

  it('v5.5.1: a margem TEÓRICA se move na direção do float, e nunca é igual por acidente', async () => {
    // A definição é `(resultado + rend_float) / faturamento`, então o SINAL do float
    // decide para que lado ela sai da margem contábil. Se um dia alguém trocar o
    // numerador (ou somar o float duas vezes), este invariante quebra — e ele é
    // barato, ao contrário de recomputar a fórmula inteira aqui.
    const lista = await rpc('get_operacoes_weddings', {
      p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'data_evento',
      p_direcao: 'desc', p_pagina: 1, p_por_pagina: 200,
    })
    const linhas = (lista.operacoes as Array<{
      nome_casal: string | null; rend_float: number | null
      margem_liquida_pct: number; margem_teorica_pct: number | null
    }>).filter(o => o.margem_teorica_pct != null && o.rend_float != null)
    if (linhas.length === 0) return

    const incoerentes = linhas.filter(o => {
      const delta = Number(o.margem_teorica_pct) - Number(o.margem_liquida_pct)
      // tolerância de 0,1 = a casa em que os dois percentuais são arredondados.
      if (Number(o.rend_float) > 0) return delta < -0.1
      if (Number(o.rend_float) < 0) return delta > 0.1
      return false
    })
    expect(incoerentes.map(o => o.nome_casal),
      'margem teórica andou na direção CONTRÁRIA ao sinal do float').toEqual([])
  })

  it('ordenar por rend_float é REAL, não o fallback silencioso', async () => {
    const [desc, bogus, padrao] = await Promise.all([
      rpc('get_operacoes_weddings', { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'rend_float', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 20 }),
      rpc('get_operacoes_weddings', { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'chave_que_nao_existe', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 20 }),
      rpc('get_operacoes_weddings', { p_status: 'todos', p_subsetor: 'todos', p_ordenar_por: 'data_evento', p_direcao: 'desc', p_pagina: 1, p_por_pagina: 20 }),
    ])

    const vals = (desc.operacoes as Array<{ rend_float: number | null }>)
      .map(o => o.rend_float).filter((v): v is number => v !== null)
    for (let i = 1; i < vals.length; i++) {
      expect(Number(vals[i - 1]), 'ordenação por rend_float não é monotônica')
        .toBeGreaterThanOrEqual(Number(vals[i]))
    }

    // E a prova de que a asserção acima vale algo: chave inexistente CAI no fallback,
    // sem erro — é por isso que "não deu erro" nunca significou "ordenou certo".
    const ordem = (r: Record<string, unknown>) =>
      (r.operacoes as Array<{ operacao: string }>).map(o => o.operacao).join('|')
    expect(ordem(bogus)).toBe(ordem(padrao))
    expect(ordem(desc)).not.toBe(ordem(padrao))
  })
})

// ── DRE · v5.7.0: guarda mecânica dos rótulos da estrutura viva ────────────────
// A regra de UMA frase que a versão fixou: **cabeçalho, subgrupo e totalizador
// carregam operador; categoria-folha NUNCA carrega**. O sinal de uma folha é do
// VALOR (parênteses na célula), não do rótulo — repetido no texto ele vira ruído
// que ainda por cima MENTE quando o valor daquele período sai com o sinal contrário
// (um "(-) Reembolso GymPass" que num mês entra positivo).
//
// A guarda cobre as DUAS direções de propósito: só a primeira deixaria passar
// exatamente o defeito que a versão veio corrigir — as 12 categorias que herdaram
// "(-) …" do modelo da controladoria.
//
// ⚠️ Ela lê o estado VIVO, não o código: nasce VERMELHA e só fica verde quando a
// migration de estrutura da v5.7.0 for aplicada em produção. É o "vista reprovando"
// do briefing — guarda que nunca foi vista falhando não prova nada.
const OPERADORES_DRE = ['(+)', '(-)', '(+/-)', '(=)'] as const
/** A fôrma exata do prefixo de estrutura: um dos quatro operadores + UM espaço. */
const PREFIXO_ESTRUTURA = /^\((\+|-|\+\/-|=)\) /
/** Token de sinal no INÍCIO de um rótulo. Aceita também a forma com espaços
 *  (`(+ / -)`), que esteve gravada até a normalização — a guarda tem de pegar o
 *  histórico, não só a fôrma nova. A âncora protege hífen e barra no MEIO do texto
 *  ("Movimentação de Caixa - C", "Agência de Marketing / Terceiros de Mkt"). */
const COMECA_COM_SINAL = /^\s*(\(\s*[+\-−=](?:\s*\/\s*[+\-−=])?\s*\)|[+\-−=])(\s|$)/

describe.skipIf(!ON)('contrato DRE — rótulos padronizados da estrutura viva (v5.7.0)', () => {
  it('todo bloco, subgrupo e totalizador começa com um operador da fôrma', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const fora = e.blocos
      .filter(b => !PREFIXO_ESTRUTURA.test(b.rotulo))
      .map(b => `${b.chave} (${b.tipo}): ${b.rotulo}`)
    expect(fora,
      `rótulo de estrutura sem operador ${OPERADORES_DRE.join(' / ')} no início`).toEqual([])
  })

  it('nenhuma categoria-folha carrega operador no rótulo exibido', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    // `rotulo` já chega COALESCE(override, nome do Monde) — é exatamente o texto que
    // a tela mostra, então é ele que a guarda tem de olhar (e não só o override).
    const comOperador = e.maps
      .filter(m => COMECA_COM_SINAL.test(m.rotulo))
      .map(m => `${m.categoria_id}: ${m.rotulo}`)
    expect(comOperador,
      'categoria (folha) com operador no rótulo — o sinal da folha é do VALOR').toEqual([])
  })
})

// ── DRE — o grafo de fórmulas e a armadilha do passe único ─────────────────────
// `get_dre_mensal` (0207) materializa em UM passe todos os blocos que somam
// categorias — a `ordem` deles é irrelevante para o cálculo. Só o passe das
// FÓRMULAS roda `ORDER BY ordem`. Logo a restrição real não é "tudo em ordem": é
// **fórmula só pode consumir fórmula ANTERIOR**. Violar isso não dá erro — o insumo
// entra como ZERO, em silêncio, e o demonstrativo fecha com um número plausível e
// errado. Por isso a guarda é permanente e não uma conferência de uma vez só:
// a estrutura é DADO editável, então nada impede alguém de reintroduzir o defeito.
describe.skipIf(!ON)('contrato DRE — grafo de fórmulas (a armadilha do passe único)', () => {
  it('toda chave referenciada existe, e fórmula só consome fórmula anterior', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const ordemPorChave = new Map(e.blocos.map(b => [b.chave, b.ordem]))
    const ehFormula = new Set(e.blocos.filter(b => b.formula != null).map(b => b.chave))

    const inexistentes: string[] = []
    const foraDeOrdem: string[] = []
    for (const b of e.blocos) {
      for (const insumo of b.formula ?? []) {
        if (!ordemPorChave.has(insumo)) { inexistentes.push(`${b.chave} → ${insumo}`); continue }
        // Só o insumo que TAMBÉM é fórmula depende da ordem; os que somam categorias
        // já estão materializados quando o passe das fórmulas começa.
        if (ehFormula.has(insumo) && (ordemPorChave.get(insumo) as number) >= b.ordem) {
          foraDeOrdem.push(`${b.chave}(${b.ordem}) → ${insumo}(${ordemPorChave.get(insumo)})`)
        }
      }
    }
    expect(inexistentes, 'fórmula aponta para chave que não existe').toEqual([])
    expect(foraDeOrdem,
      'fórmula consome outra fórmula de ordem POSTERIOR — o insumo entraria como zero').toEqual([])
  })
})

// ── DRE · v5.7.0: a camada firme (Resultado Financeiro + Imobilizado abaixo da linha) ──
// Estes três casos são o retrato do que a migration de estrutura deixa em produção.
// Também nascem VERMELHOS e viram verdes na aplicação. Ficam permanentes porque a
// estrutura é editável pela interface: sem eles, desfazer a decisão da gerente por
// engano no editor não acusaria em lugar nenhum.
describe.skipIf(!ON)('contrato DRE — camada firme da v5.7.0', () => {
  it('RFIN não existe mais e suas 3 categorias vivem no Resultado Financeiro', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    expect(e.blocos.map(b => b.chave), 'o bloco RFIN deveria ter sido removido').not.toContain('RFIN')
    expect(e.maps.filter(m => m.bloco_chave === 'RFIN'), 'sobrou categoria apontando para RFIN').toEqual([])

    const fin = e.blocos.find(b => b.chave === 'FIN')
    expect(fin?.rotulo).toBe('(+/-) Resultado Financeiro')
    expect(e.maps.filter(m => m.bloco_chave === 'FIN').length,
      'FIN deveria ter as 8 próprias + as 3 que vieram do RFIN').toBe(11)
  })

  it('IMOB saiu das despesas operacionais e entrou no bloco de investimentos', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const f = (chave: string) => e.blocos.find(b => b.chave === chave)?.formula ?? []

    expect(f('DESP_H'), 'IMOB/RFIN ainda somam nas DESPESAS').not.toContain('IMOB')
    expect(f('DESP_H')).not.toContain('RFIN')
    expect(f('LOP'), 'IMOB/RFIN ainda somam no Lucro Operacional').not.toContain('IMOB')
    expect(f('LOP')).not.toContain('RFIN')
    // As duas listas enumeram os mesmos subgrupos cada uma por conta própria
    // (assimetria documentada) — então mudam JUNTAS ou o demonstrativo se contradiz.
    expect(f('DESP_H')).toEqual(['ADM', 'COM', 'FIN', 'MKT', 'ESTR', 'RH', 'RHB'])
    expect(f('LOP')).toEqual(['LB', 'ADM', 'COM', 'FIN', 'MKT', 'ESTR', 'RH', 'RHB'])

    expect(f('INV_H')).toEqual(['INV', 'IMOB'])
    expect(f('RAIR')).toEqual(['LL', 'INV', 'IMOB'])
  })

  it('IMOB renderiza SOB o cabeçalho que o agrega, não acima dele', async () => {
    // A `ordem` não muda o CÁLCULO (IMOB soma categorias, materializa no passe 1),
    // mas manda na RENDERIZAÇÃO: a 245 o subgrupo apareceria ACIMA do próprio
    // cabeçalho. Tem de vir depois do INV_H e do INV.
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const ordem = (chave: string) => e.blocos.find(b => b.chave === chave)?.ordem ?? -1
    expect(ordem('IMOB')).toBeGreaterThan(ordem('INV_H'))
    expect(ordem('IMOB')).toBeGreaterThan(ordem('INV'))
    expect(ordem('IMOB')).toBeLessThan(ordem('RAIR'))
    // E o Resultado Financeiro fecha o bloco de DESPESAS, logo antes do LOP.
    expect(ordem('FIN')).toBeGreaterThan(ordem('RHB'))
    expect(ordem('FIN')).toBeLessThan(ordem('LOP'))
  })
})

// ── DRE · v5.7.1: a Receita Bruta é uma linha de RESULTADO ────────────────────
// `RB_H` sempre foi um SUBTOTAL (fórmula `["REPASSE","RV"]`), mas estava tipada como
// cabeçalho de grupo e desenhada ACIMA de uma das parcelas que ela soma. A v5.7.1 pôs a
// Receita de Vendas antes dela e promoveu a Receita Bruta a `tot`.
// Permanente, e não conferência de uma vez: `tipo` e `ordem` são DADO editável pela
// interface — sem guarda, desfazer isso por engano no editor não acusaria em lugar nenhum.
// Nasce VERMELHA e vira verde quando a migration destrutiva do patch for aplicada.
describe.skipIf(!ON)('contrato DRE — Receita Bruta como linha de resultado (v5.7.1)', () => {
  it('RB_H é "tot", abre com (=) e continua sendo REPASSE + RV', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const rb = e.blocos.find(b => b.chave === 'RB_H')
    expect(rb, 'o bloco RB_H sumiu da estrutura').toBeDefined()
    expect(rb?.tipo, 'RB_H deveria ser linha de resultado').toBe('tot')
    // O prefixo diz o PAPEL da linha (regra da v5.7.0) — resultado abre com "(=)".
    expect(rb?.rotulo.startsWith('(=) '), `rótulo inesperado: ${rb?.rotulo}`).toBe(true)
    // O que JUSTIFICA ela ser resultado. Se a fórmula mudar, o tipo perde o fundamento.
    expect(rb?.formula).toEqual(['REPASSE', 'RV'])
  })

  it('Receita de Vendas vem ANTES da Receita Bruta que a soma', async () => {
    const e = dreEstruturaSchema.parse(await rpc('dre_estrutura', {}))
    const ordem = (chave: string) => e.blocos.find(b => b.chave === chave)?.ordem ?? -1
    expect(ordem('RV')).toBeLessThan(ordem('RB_H'))
    // E o par continua entre o Saldo Repasse e os Impostos.
    expect(ordem('RV')).toBeGreaterThan(ordem('REPASSE'))
    expect(ordem('RB_H')).toBeLessThan(ordem('IMP_H'))
  })
})

// ── "Maiores variações" × Demonstrativo: os dois números têm de concordar (v5.7.1) ──
// Os dois cards vivem na MESMA página, um debaixo do outro, e mostram a mesma categoria
// com o mesmo rótulo de janela ("YTD"). Até a `0253` não concordavam: o card cortava o ano
// ANTERIOR pelo dia-do-ano e o Demonstrativo usa meses inteiros — 638.959,48 de diferença
// em "Pagamento ao Fornecedor" no dia da medição. É o caso clássico da skill
// `contrato-rpc-front`: dois números vizinhos na mesma tela = caso de contrato.
//
// A comparação casa por NOME REAL do Monde, não pelo rótulo exibido: 6 categorias têm
// override só de capitalização, e casar por rótulo daria falso negativo.
describe.skipIf(!ON)('contrato DRE — Maiores variações reconcilia com o YTD do Demonstrativo', () => {
  it('toda categoria do ranking bate ao centavo com o YTD da DRE nos dois anos', async () => {
    const [est, rk, dreAnt, dreCur] = await Promise.all([
      rpc('dre_estrutura', {}),
      rpc('get_fluxo_ranking', { p_limite: 200 }),
      rpc('get_dre_mensal', { p_ano: new Date().getUTCFullYear() - 1 }),
      rpc('get_dre_mensal', { p_ano: new Date().getUTCFullYear() }),
    ])
    const e = dreEstruturaSchema.parse(est)
    const ant = dreMensalSchema.parse(dreAnt)
    const cur = dreMensalSchema.parse(dreCur)

    // A janela é o mês corrente do payload — a MESMA fatia que a `0253` usa no SQL.
    const mes = cur.mes_corrente
    expect(mes, 'o ano corrente deveria trazer mes_corrente').not.toBeNull()

    /** Rótulo EXIBIDO → YTD daquele ano (jan..mês corrente), por categoria-folha. */
    const ytdPorRotulo = (d: typeof ant) => {
      const m = new Map<string, number>()
      for (const l of d.linhas) {
        if (l.t === 'cat') m.set(l.rotulo, l.meses.slice(0, mes as number).reduce((s, v) => s + v, 0))
      }
      for (const b of d.bandeja) m.set(b.rotulo, b.meses.slice(0, mes as number).reduce((s, v) => s + v, 0))
      return m
    }
    const yAnt = ytdPorRotulo(ant)
    const yCur = ytdPorRotulo(cur)

    const rotuloPorNome = new Map(e.maps.map(m => [m.nome, m.rotulo]))
    // As transferências internas ficam FORA do demonstrativo por decisão do de-para — o
    // ranking, que lê o fato direto, ainda as enxerga. Diferença conhecida e registrada
    // (v5.7.1): não é divergência de número, é de escopo.
    const excluidas = new Set(e.maps.filter(m => m.excluida).map(m => m.nome))

    const itens = [
      ...(rk.pioraram as Array<{ c: string; t25: number; t26: number }>),
      ...(rk.melhoraram as Array<{ c: string; t25: number; t26: number }>),
    ]
    expect(itens.length, 'ranking veio vazio — sem o que reconciliar').toBeGreaterThan(0)

    const divergentes: string[] = []
    for (const it of itens) {
      if (excluidas.has(it.c)) continue
      const rot = rotuloPorNome.get(it.c) ?? it.c
      const a = yAnt.get(rot)
      const b = yCur.get(rot)
      if (a === undefined || b === undefined) { divergentes.push(`${it.c}: sem linha na DRE`); continue }
      if (Math.abs(it.t25 - a) >= 0.005) divergentes.push(`${it.c} (ano-1): ranking ${it.t25} × DRE ${a}`)
      if (Math.abs(it.t26 - b) >= 0.005) divergentes.push(`${it.c} (ano): ranking ${it.t26} × DRE ${b}`)
    }
    expect(divergentes,
      'Maiores variações e Demonstrativo discordam — as janelas voltaram a divergir').toEqual([])
  })
})

// ── v5.8.0 · DRE por COMPETÊNCIA (get_dre_competencia_mensal, 0257) ───────────
// O oráculo NÃO crava número: a fonte é um upload que o Yan re-gera, e teste que crava
// número de dado editável nasce falso-vermelho (lição da v5.7.2). O que se afirma aqui é
// a IDENTIDADE — `REX ≡ Σ das linhas classificadas` e `base = linhas + bandeja +
// excluídas` —, medida contra a própria base carregada. Se a estrutura estiver errada,
// esses números divergem entre si e o teste cai, com qualquer safra de arquivo.
// A álgebra da árvore (REX com coeficiente +1 em cada folha, REXG cancelando REEMB) é
// provada sem banco em `src/lib/dre/competencia-estrutura.test.ts`.
describe.skipIf(!ON)('contrato RPC — DRE por competência (v5.8.0)', () => {
  const ANOS = [2024, 2025, 2026]
  const cent = (v: number) => Math.round(v * 100)

  it('shape do envelope bate com dreCompMensalSchema em todos os anos da base', async () => {
    for (const ano of ANOS) {
      const d = await rpc('get_dre_competencia_mensal', { p_ano: ano })
      const parsed = dreCompMensalSchema.safeParse(d)
      expect(parsed.success, `${ano}: ${parsed.success ? '' : parsed.error.message}`).toBe(true)
    }
  })

  it('ORÁCULO: REX ≡ soma de todas as linhas classificadas do ano, ao centavo', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      const rex = d.linhas.find(l => l.t !== 'cat' && l.chave === 'REX')
      expect(rex, `${ano}: linha REX ausente`).toBeDefined()
      expect(cent(rex!.total), `${ano}: REX × soma da base`).toBe(d.reconciliacao.linhas_centavos)
    }
  })

  it('completude: base = linhas + bandeja + excluídas (nada some em silêncio)', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      const r = d.reconciliacao
      expect(r.base_centavos, `${ano}: reconciliação`).toBe(
        r.linhas_centavos + r.bandeja_centavos + r.excluidas_centavos,
      )
      expect(r.fecha, `${ano}: a própria RPC declara que não fecha`).toBe(true)
    }
  })

  it('REXG = REX − REEMB (o Resultado Gerencial é o REX sem os reembolsos)', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      const bloco = (chave: string) => d.linhas.find(l => l.t !== 'cat' && l.chave === chave)
      const rex = bloco('REX'), rexg = bloco('REXG'), reemb = bloco('REEMB')
      expect([rex, rexg, reemb].every(Boolean), `${ano}: falta REX/REXG/REEMB`).toBe(true)
      expect(cent(rexg!.total), `${ano}: REXG`).toBe(cent(rex!.total) - cent(reemb!.total))
    }
  })

  it('toda linha traz 12 meses e o total é a soma deles', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      for (const l of [...d.linhas, ...d.bandeja]) {
        expect(l.meses).toHaveLength(12)
        // ±1 centavo: cada mês é arredondado no banco, e a soma de 12 arredondamentos
        // pode fechar com 1 centavo de diferença do total (não se maquia — v5.7.0).
        const somaMeses = l.meses.reduce((a, x) => a + cent(x), 0)
        expect(Math.abs(cent(l.total) - somaMeses), `${ano}: ${l.rotulo}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('a FUSÃO não vaza: um destino (bloco, rótulo) aparece uma única vez', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      const cats = d.linhas.filter(l => l.t === 'cat')
      const destinos = new Set(cats.map(l => `${l.g}␟${l.rotulo}`))
      expect(destinos.size, `${ano}: destino repetido — duas pernas de fusão viraram duas linhas`)
        .toBe(cats.length)
      expect(cats.length).toBeGreaterThan(0)
    }
  })

  it('a estrutura tem a MESMA forma em todos os anos (linha vem do de-para, não do dado)', async () => {
    const formas: string[][] = []
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      formas.push(d.linhas.map(l => `${l.t}:${l.chave ?? ''}:${l.g ?? ''}:${l.rotulo}`))
    }
    // Ano sem valor numa linha mostra zero; não faz a linha desaparecer. É o que deixa a
    // visão Consolidado casar linha com linha entre anos.
    for (let i = 1; i < formas.length; i++) expect(formas[i]).toEqual(formas[0])
  })

  it('a base da Análise Vertical (RB_H) existe na árvore de competência', async () => {
    // `src/lib/dre/av.ts` divide pela linha de chave `CHAVE_BASE_AV = 'RB_H'`. Sem essa
    // chave a coluna AV da seção nova viraria travessão inteira, em silêncio.
    const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: 2025 }))
    expect(d.linhas.some(l => l.chave === 'RB_H')).toBe(true)
  })

  it('relacao e mes_corrente saem da COBERTURA da base, coerentes entre si', async () => {
    for (const ano of ANOS) {
      const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      if (d.relacao === 'corrente') {
        expect(d.mes_corrente, `${ano}: corrente sem mês`).toBeGreaterThanOrEqual(1)
        expect(d.mes_corrente!, `${ano}: corrente com mês 12 deveria ser fechado`).toBeLessThan(12)
      } else {
        expect(d.mes_corrente, `${ano}: ${d.relacao} deveria ter mes_corrente nulo`).toBeNull()
      }
      // competência não tem previsto: nenhuma linha traz projeção
      for (const l of d.linhas) {
        expect(l.prev_corrente ?? null, `${ano}: ${l.rotulo} com previsto`).toBeNull()
        expect(l.venc, `${ano}: ${l.rotulo} com vencido`).toBe(0)
      }
    }
  })

  it('dre_comp_estrutura: shape do editor + coerência com a árvore', async () => {
    const e = dreCompEstruturaSchema.parse(await rpc('dre_comp_estrutura', {}))
    expect(e.token).not.toBeNull()
    expect(e.blocos.length).toBeGreaterThan(0)

    // Todo destino usado por uma linha existe e é FOLHA (`formula` nula). Linha de fórmula
    // não recebe par: receber faria o valor entrar duas vezes na expansão (0257).
    const folhas = new Set(e.blocos.filter(b => b.formula === null).map(b => b.chave))
    for (const m of e.maps) {
      if (m.bloco_chave !== null) {
        expect(folhas.has(m.bloco_chave), `destino ${m.bloco_chave} não é folha da árvore`).toBe(true)
      }
    }

    // Identidade única e sem sobreposição entre classificadas/excluídas e bandeja.
    const idsMaps = e.maps.map(m => m.categoria_id)
    const idsBand = e.bandeja.map(b => b.categoria_id)
    expect(new Set(idsMaps).size).toBe(idsMaps.length)
    expect(new Set(idsBand).size).toBe(idsBand.length)
    expect(idsMaps.filter(id => idsBand.includes(id))).toEqual([])

    // `totais` só fala de linhas que existem.
    const todos = new Set([...idsMaps, ...idsBand].map(String))
    for (const id of Object.keys(e.totais)) expect(todos.has(id), `total órfão para a linha ${id}`).toBe(true)

    // O CHECK do banco em forma observável: excluída nunca convive com bloco.
    for (const m of e.maps) {
      if (m.excluida) expect(m.bloco_chave, `linha ${m.categoria_id} excluída E num bloco`).toBeNull()
    }
  })

  it('o EDITOR e o DEMONSTRATIVO concordam sobre o que está classificado', async () => {
    // Dois números vizinhos na mesma tela pedem caso de contrato (lição da v5.7.1) — aqui
    // são duas TELAS lendo a mesma curadoria por RPCs diferentes. Se divergirem, o editor
    // mostra uma linha classificada que o demonstrativo não exibe (ou o contrário).
    const e = dreCompEstruturaSchema.parse(await rpc('dre_comp_estrutura', {}))
    const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: 2025 }))

    const doEditor = new Set(
      e.maps.filter(m => !m.excluida && m.bloco_chave !== null).map(m => `${m.bloco_chave}␟${m.rotulo}`),
    )
    const doDemonstrativo = new Set(
      d.linhas.filter(l => l.t === 'cat').map(l => `${l.g}␟${l.rotulo}`),
    )
    expect([...doDemonstrativo].filter(k => !doEditor.has(k)),
      'o demonstrativo exibe linha que o editor não tem como classificada').toEqual([])
    expect([...doEditor].filter(k => !doDemonstrativo.has(k)),
      'o editor tem linha classificada que o demonstrativo não exibe').toEqual([])

    // E a bandeja também: mesma órfã dos dois lados.
    const bandEditor = new Set(e.bandeja.map(b => b.nome))
    const bandDemo = new Set(d.bandeja.map(b => `${b.grupo_monde} · ${b.rotulo}`))
    for (const k of bandDemo) {
      expect(bandEditor.has(k), `órfã "${k}" aparece no demonstrativo mas não na bandeja do editor`).toBe(true)
    }
  })

  it('os anos que a RPC anuncia são os anos que respondem', async () => {
    const d = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: 2025 }))
    expect(d.anos.length).toBeGreaterThan(0)
    expect(d.cobertura_de).not.toBeNull()
    expect(d.cobertura_ate).not.toBeNull()
    // o recorte de um ano anunciado tem de trazer dado (base_centavos ≠ base vazia)
    for (const ano of d.anos) {
      const x = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano }))
      expect(x.relacao, `${ano} está em anos[] mas responde como vazio`).not.toBe('futuro')
    }
  })
})

// ── v5.8.1 · Conciliação entre regimes ───────────────────────────────────────
// A ponte é a única figura da plataforma que AFIRMA uma identidade entre duas bases
// independentes (upload de competência × movimentação do caixa). Se ela não fechar,
// não é um card com um número errado — é um card que desautoriza os dois
// demonstrativos que ele concilia. Por isso o confronto é contra a BASE VIVA, e não só
// contra fixture: os testes de módulo provam a álgebra, este prova que a árvore REAL
// ainda cabe nela.
//
// O que quebra este bloco — e é exatamente o que ele existe para pegar: alguém cria um
// bloco novo no editor da estrutura e o vocabulário da ponte não é atualizado. A
// identidade CONTINUA fechando (o residual recolhe o que sobrou), mas o valor deixa de
// ter nome, e um "Outros ajustes" gordo é um sintoma que ninguém procura.
describe.skipIf(!ON)('contrato DRE — conciliação entre regimes (v5.8.1)', () => {
  it('a ponte Competência ↔ Caixa fecha AO CENTAVO contra a base viva', async () => {
    const anoSP = Number(hojeSP().slice(0, 4))
    const comp = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))
    const caixa = dreMensalSchema.parse(await rpc('get_dre_mensal', { p_ano: anoSP }))

    const m = janelaYtdCompetencia(comp)
    expect(m, 'a base de competência não cobre mês nenhum do ano corrente').toBeGreaterThan(0)

    const p = montarPonte(comp, caixa, m)
    const soma = p.degraus.reduce((s, d) => s + d.delta, 0)

    expect(p.inicial.valor + soma, 'REX_comp + Σ degraus ≠ REX_caixa').toBe(p.final.valor)
    expect(p.fecha).toBe(true)
  })

  it('a árvore VIVA está inteiramente pareada — nenhuma folha fora do vocabulário', async () => {
    const anoSP = Number(hojeSP().slice(0, 4))
    const comp = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))
    const caixa = dreMensalSchema.parse(await rpc('get_dre_mensal', { p_ano: anoSP }))

    const p = montarPonte(comp, caixa, janelaYtdCompetencia(comp))

    expect(p.naoPareadas.competencia,
      'folha de COMPETÊNCIA sem balde na ponte — atualize PAREAMENTO_PONTE').toEqual([])
    expect(p.naoPareadas.caixa,
      'folha de CAIXA sem balde na ponte — atualize PAREAMENTO_PONTE').toEqual([])
  })

  it('Σ folhas ≡ REX do demonstrativo, nos DOIS regimes', async () => {
    // A premissa de que toda a aritmética das cascatas depende. Provada em álgebra nos
    // testes de módulo; aqui é medida contra a estrutura viva, que é editável.
    const anoSP = Number(hojeSP().slice(0, 4))
    const comp = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))
    const caixa = dreMensalSchema.parse(await rpc('get_dre_mensal', { p_ano: anoSP }))
    const m = janelaYtdCompetencia(comp)

    for (const [nome, payload] of [['competência', comp], ['caixa', caixa]] as const) {
      const rex = payload.linhas.find(l => l.t !== 'cat' && l.chave === 'REX')
      expect(rex, `${nome}: sem linha REX`).toBeDefined()
      const doDemonstrativo = rex!.meses.slice(0, m).reduce((s, v) => s + Math.round(v * 100), 0)
      expect(totalFolhas(folhasPorGrupo(payload, m)),
        `${nome}: Σ folhas ≠ REX do demonstrativo`).toBe(doDemonstrativo)
    }
  })

  it('toda linha do Resumo Executivo existe na árvore VIVA do seu regime', async () => {
    // O Resumo casa as linhas por `b:<chave>` contra o payload. Chave que suma da árvore
    // — renomeada no editor da estrutura, ou removida — não quebra nada: a linha aparece
    // VAZIA, em silêncio, num card de manchete que a diretoria lê. Este é o teste que
    // pega isso, e cobre os DOIS regimes porque o componente agora serve aos dois.
    const anoSP = Number(hojeSP().slice(0, 4))
    const comp = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))
    const caixa = dreMensalSchema.parse(await rpc('get_dre_mensal', { p_ano: anoSP }))

    for (const [nome, payload, linhas] of [
      ['competência', comp, LINHAS_COMPETENCIA],
      ['caixa', caixa, LINHAS_CAIXA],
    ] as const) {
      const doPayload = new Set(payload.linhas.filter(l => l.t !== 'cat' && l.chave).map(l => l.chave))
      for (const l of linhas) {
        expect(doPayload.has(l.chave),
          `${nome}: o Resumo pede a chave ${l.chave} ("${l.rotulo}"), que a árvore não tem`).toBe(true)
      }
    }
  })

  it('a decomposição da variação fecha ao centavo entre dois anos vivos', async () => {
    const anoSP = Number(hojeSP().slice(0, 4))
    const atual = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))
    const anterior = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP - 1 }))
    const m = janelaYtdCompetencia(atual)

    const c = montarDecomposicao(atual, anterior, m, 'anterior', 'atual')
    const soma = c.degraus.reduce((s: number, d: { delta: number }) => s + d.delta, 0)

    expect(c.inicial.valor + soma, 'REX anterior + Σ degraus ≠ REX atual').toBe(c.final.valor)
    expect(c.fecha).toBe(true)

    // ⚠️ As DUAS âncoras usam a MESMA janela, e é isso que faz cada degrau significar o
    // que aparenta. A v5.9.2 avaliou partir do ano anterior FECHADO (12 meses contra 8) e
    // descartou: medido, aquilo invertia o sinal de 8 dos 15 degraus. Se alguém trocar a
    // âncora inicial por 12 meses, este teste cai — que é o ponto.
    for (const [nome, payload] of [['anterior', anterior], ['atual', atual]] as const) {
      const rex = payload.linhas.find(l => l.t !== 'cat' && l.chave === 'REX')
      expect(rex, `${nome} sem linha REX`).toBeDefined()
      const naJanela = rex!.meses.slice(0, m).reduce((s, v) => s + Math.round(v * 100), 0)
      const alvo = nome === 'anterior' ? c.inicial.valor : c.final.valor
      expect(alvo, `a âncora ${nome} não usa a janela YTD`).toBe(naJanela)
    }
  })

  it('os 8 grupos da grade de proporção existem na árvore VIVA de competência', async () => {
    // Chave renomeada no editor da estrutura deixaria um mini-gráfico VAZIO, em silêncio —
    // o mesmo risco que o teste das linhas do Resumo Executivo cobre.
    const anoSP = Number(hojeSP().slice(0, 4))
    const comp = dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: anoSP }))

    const folhasVivas = new Set(comp.linhas.filter(l => l.t === 'cat').map(l => l.g))
    for (const k of GRUPOS_PROPORCAO) {
      expect(folhasVivas.has(k), `a grade pede o grupo ${k}, que a árvore viva não tem`).toBe(true)
    }

    // E a série sai com AV calculável em TODOS os anos cobertos (base > 0 em cada um).
    const series = montarProporcaoGrupos([
      { ano: anoSP, payload: comp, meses: janelaYtdCompetencia(comp) },
    ])
    for (const s of series) {
      expect(s.pontos[0].av, `${s.chave} sem AV — Receita Bruta ausente ou ≤ 0`).not.toBeNull()
    }
  })

  it('as oito janelas da grade têm a MESMA altura contra a base viva', async () => {
    // A invariante que o ajuste da escala existe para garantir. Com eixo auto-escalado,
    // RH (10,2 p.p. de amplitude) e Desp. Comerciais (0,36 p.p.) desenhavam a mesma
    // inclinação — uma razão de 28× sumia da tela. Aqui isso é medido contra o dado real,
    // onde as amplitudes são as de verdade e não as de uma fixture escolhida.
    const anoSP = Number(hojeSP().slice(0, 4))
    const anos = [anoSP - 2, anoSP - 1, anoSP]
    const payloads = await Promise.all(
      anos.map(a => rpc('get_dre_competencia_mensal', { p_ano: a }).then(r => dreCompMensalSchema.parse(r))),
    )
    const m = janelaYtdCompetencia(payloads[2])

    const series = montarProporcaoGrupos(
      anos.map((a, i) => ({ ano: a, payload: payloads[i], meses: a === anoSP ? m : 12 })),
    )

    const alturas = new Set(series.map(s => Number((s.dominio[1] - s.dominio[0]).toFixed(6))))
    expect(alturas.size, `janelas de alturas diferentes: ${[...alturas].join(', ')}`).toBe(1)

    // E cada série cabe inteira na sua janela — um ponto fora do eixo sumiria do gráfico.
    // v5.9.3: vale em especial para FIN (Resultado Financeiro), que é (+/−) e pode ter um ano
    // POSITIVO — a janela clampada em zero das despesas o expulsaria em silêncio.
    for (const s of series) {
      for (const p of s.pontos) {
        if (p.av === null) continue
        expect(p.av, `${s.chave} fora do eixo`).toBeGreaterThanOrEqual(s.dominio[0] - 1e-9)
        expect(p.av, `${s.chave} fora do eixo`).toBeLessThanOrEqual(s.dominio[1] + 1e-9)
      }
    }
  })
})

// ── v5.9.4 (0267) — dois hardenings de RPC, provados pelo CATÁLOGO VIVO ─────────────────
// (a) `monde_ingest_promover`: detalhe que chega sem `sale_id` num mês cujo `raw_hash`
//     mudou não pode mais sobrescrever o `sale_id` real com NULL (COALESCE no ON CONFLICT).
// (b) `get_executiva_kpis`: quem tem só `metas/acompanhamento` lê a RPC (o `PERFORM` do
//     wrapper ganhou a área; o helper `app.areas_do_setor` — 15 consumidoras — NÃO mudou).
// (c) anon segue negado — é o caso 'enforcement ATIVO: leitura anônima é negada' acima.
// Lê `pg_get_functiondef` via `pg` (padrão de contrato-api-externa.test.ts): as duas
// funções escrevem (promover) ou exigem sessão de usuário real (kpis só-Metas), então o
// comportamento se prova no ato da aplicação, em transação revertida; aqui fica a sonda
// que reprova a próxima `CREATE OR REPLACE` escrita a partir da migration de ORIGEM em
// vez do catálogo (a regressão silenciosa da skill banco-e-rpc §5).
const DB_URL = process.env.SUPABASE_DB_URL

describe.skipIf(!ON || !DB_URL)('contrato RPC — hardenings da v5.9.4 (0267) no catálogo vivo', () => {
  async function comCliente<T>(f: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>): Promise<T> {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    // Trava READ ONLY de SESSÃO (v5.10.3): este bloco só LÊ catálogo/agregados, e a
    // declaração `SOMENTE_LEITURA` da sonda passa a ser cobrada mecanicamente aqui. Não é
    // documentação — é o Postgres recusando qualquer escrita nesta conexão ("cannot execute
    // ... in a read-only transaction"), inclusive a que uma FUNÇÃO faria por dentro, que é
    // justamente o que o texto do teste não mostra. Precedente: a medição do baseline da
    // v5.4.5. `CHARACTERISTICS` (e não `SET TRANSACTION`) porque vale para toda transação
    // implícita da sessão, sem precisar de um BEGIN — e abrir BEGIN aqui reprovaria a
    // própria declaração de só-leitura.
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try { return await f(c) } finally { await c.end() }
  }

  async function definicao(fn: string): Promise<string> {
    return comCliente(async c => {
      const r = await c.query(
        `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = $1`,
        [fn],
      )
      expect(r.rows.length, `${fn}: ${r.rows.length} definições (esperado 1)`).toBe(1)
      return r.rows[0].def as string
    })
  }

  it('monde_ingest_promover preserva sale_id existente quando o detalhe vem sem ele (COALESCE)', async () => {
    const def = await definicao('monde_ingest_promover')
    expect(def).toMatch(/sale_id\s*=\s*COALESCE\(\s*EXCLUDED\.sale_id\s*,\s*d\.sale_id\s*\)/i)
    // e NENHUMA outra coluna do upsert mudou de regra (o COALESCE é só do sale_id)
    expect(def).toMatch(/data_venda\s*=\s*EXCLUDED\.data_venda/)
    expect(def).toMatch(/raw_hash\s*=\s*EXCLUDED\.raw_hash/)
    expect(def).toMatch(/WHERE d\.raw_hash IS DISTINCT FROM EXCLUDED\.raw_hash/)
  })

  it('get_executiva_kpis aceita metas/acompanhamento no PERFORM — e o helper areas_do_setor não mudou', async () => {
    const def = await definicao('get_executiva_kpis')
    expect(def).toMatch(/exigir_acesso\(\s*app\.areas_do_setor\(p_setor\)\s*\|\|\s*ARRAY\['metas\/acompanhamento'\]\s*\)/)

    // Sonda do ponto de mudança: o helper continua devolvendo só performance/<setor> e
    // ['executiva','performance'] — ampliar ALI alargaria 14 RPCs que ninguém pediu.
    const r = await comCliente(c => c.query(`SELECT app.areas_do_setor('Weddings') AS w, app.areas_do_setor('todos') AS t`))
    expect(r.rows[0].w).toEqual(['performance/weddings'])
    expect(r.rows[0].t).toEqual(['executiva', 'performance'])
  })
})

// ── v6.0.0/M6 (0280/0281) — `ingestao_painel()` ↔ `ingestaoPainelSchema` contra a RPC VIVA ───
// Caso de contrato da skill `contrato-rpc-front` §3 (achado ALTO do revisor na M6). Não entra na
// lista F7 acima de propósito: aquela roda pela credencial `verificador`, que passa pelo
// `exigir_acesso` como usuário comum e NÃO tem área de administração — dar `admin/uploads` a uma
// credencial de máquina só para este teste alargaria a postura dela (a RPC expõe nome/e-mail de
// quem carregou). Aqui a conexão é a direta, em sessão READ ONLY (mesma trava dos blocos acima), e
// a identidade é a claim `role=service_role` na sessão — o ramo TRUSTED de `app.exigir_acesso`,
// o mesmo que o servidor usa. `ingestao_painel` é STABLE e só lê; nada persiste.
describe.skipIf(!ON || !DB_URL)('contrato RPC — ingestao_painel ↔ ingestaoPainelSchema (0280/0281)', () => {
  it('o retorno REAL passa no schema da tela — inclusive os ITENS de cada lista, quando houver', async () => {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    let painel: unknown
    try {
      await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
      await c.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`)
      painel = (await c.query('SELECT public.ingestao_painel() AS p')).rows[0].p
    } finally {
      await c.end()
    }
    const r = ingestaoPainelSchema.safeParse(painel)
    expect(r.success, r.success ? '' : `ingestao_painel drift: ${JSON.stringify(r.error!.issues.slice(0, 6))}`).toBe(true)
    // As cinco listas chegam como ARRAY (o `coalesce(..., '[]')` do SQL), nunca null — e o
    // estado do vigia é boolean de verdade (o job existe desde a 0280).
    const p = r.data!
    expect(typeof p.vigia_cron_ativo).toBe('boolean')
    // 0282: o job da limpeza existe desde a aplicação (inativo), então o estado dele é verificável
    // hoje. `retencao_ultima` fica `null` até a primeira rodada REAL — o shape dela só é provado
    // contra dado vivo depois da ativação (M9); até lá vale o teste unitário do schema.
    expect(typeof p.retencao_cron_ativo).toBe('boolean')
    expect(p.expectativas.length, 'as 9 expectativas semeadas pela 0280').toBe(9)
    // 0281: toda carga feita pela rota tem autor (sessão OU chave) — `quem` nulo numa carga real
    // é o join quebrado, não "ninguém".
    for (const carga of p.cargas) expect(carga.quem, `carga ${carga.carga_id} sem quem`).toBeTruthy()
  })
})

// ── v6.1.0 (0287) — `ingestao_operacoes_vigentes()`: o conjunto de operações da base VIVA ────
// "Antes" do diff por conjunto de operações (errata 4(c) do contrato de ingestão v1), lido pelo
// servidor ANTES da promoção — que trunca raw e fato. A função é service_role-ONLY por desenho
// (mesma classe de `ingestao_soma_por_ano`; sem `exigir_acesso` no corpo, protegida só por GRANT).
//
// Por que NÃO entra na lista F7 nem em chamada REST pela credencial `verificador`: a allowlist do
// `verificador` é DERIVADA deste arquivo por `scripts/credencial/derivar-allowlist.mjs`, que extrai
// do TEXTO INTEIRO (comentários inclusos) o nome que aparece como argumento literal de `rpc(` ou
// como valor da chave `fn:`. Escrever a função assim aqui emitiria GRANT ao `verificador` — o que a
// 0287 não quer, e que este bloco reprova logo abaixo. Por isso a chamada é por `pg` direto, em
// sessão READ ONLY, com a claim `role=service_role` (o ramo TRUSTED que o servidor usa — mesmo
// molde do bloco de `ingestao_painel` acima) e o nome vive numa constante, nunca como literal
// posicional. A função é STABLE e só lê; nada persiste.
describe.skipIf(!ON || !DB_URL)('contrato RPC — ingestao_operacoes_vigentes (0287): shape + service_role-only', () => {
  const NOME = 'ingestao_operacoes_vigentes'
  const ASSINATURA = `public.${NOME}()`

  async function comCliente<T>(f: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>): Promise<T> {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    // Trava READ ONLY de SESSÃO, por CONEXÃO (sonda-teste-escreve-banco): o Postgres recusa qualquer
    // escrita aqui — inclusive a que a função faria por dentro.
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try { return await f(c) } finally { await c.end() }
  }

  /** Falha ALTO se a função não existe: pular seria o `skipIf` silencioso que as sondas combatem. */
  async function exigirFuncao(c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }): Promise<void> {
    const r = await c.query(`SELECT to_regprocedure($1) IS NOT NULL AS existe`, [ASSINATURA])
    expect(r.rows[0]?.existe, `${ASSINATURA} não existe no catálogo — a migration 0287 foi aplicada?`).toBe(true)
  }

  it('devolve um array jsonb; cada item tem EXATAMENTE {operacao, operacao_id}; sem par duplicado', async () => {
    const { itens, distintosNaTabela } = await comCliente(async c => {
      await exigirFuncao(c)
      await c.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false)`)
      const chamada = await c.query(`SELECT public.ingestao_operacoes_vigentes() AS v`)
      // Contraprova pela tabela: o número de pares distintos que a função devolve é o do fato.
      const tabela = await c.query(
        `SELECT count(*)::int AS n FROM (SELECT DISTINCT operacao, operacao_id FROM analytics.fato_lancamento_operacao) s`,
      )
      return { itens: chamada.rows[0]?.v as unknown, distintosNaTabela: tabela.rows[0]?.n as number }
    })

    expect(Array.isArray(itens), `esperado array jsonb, veio ${typeof itens}`).toBe(true)
    const lista = itens as Array<Record<string, unknown>>
    // Caso positivo: a base viva tem operações (~240 em 29/09). Sem isto, as asserções por item
    // passariam VAZIAS numa função que devolvesse `[]` por engano (join quebrado, filtro errado).
    expect(lista.length, 'a base viva de Lançamentos por Operação não tem operação nenhuma?').toBeGreaterThan(0)

    const vistos = new Set<string>()
    for (const item of lista) {
      expect(Object.keys(item).sort(), `chaves do item ${JSON.stringify(item)}`).toEqual(['operacao', 'operacao_id'])
      // `operacao` é NOT NULL no fato (a promoção descarta placeholder); `operacao_id` é anulável —
      // NULL até a primeira carga da RPA que traga a coluna (o CSV do R não a tem).
      expect(typeof item.operacao, `operacao de ${JSON.stringify(item)}`).toBe('string')
      expect((item.operacao as string).length, `operacao vazia em ${JSON.stringify(item)}`).toBeGreaterThan(0)
      expect(item.operacao_id === null || typeof item.operacao_id === 'string', `operacao_id de ${JSON.stringify(item)}`).toBe(true)
      const par = JSON.stringify([item.operacao, item.operacao_id])
      expect(vistos.has(par), `par duplicado: ${par}`).toBe(false)
      vistos.add(par)
    }
    expect(lista.length, 'a função e o DISTINCT direto da tabela discordam').toBe(distintosNaTabela)
  })

  it('service_role-ONLY no catálogo: nem PUBLIC, nem anon, nem authenticated, nem as credenciais de máquina', async () => {
    const { existe, privilegios, acl, comentario } = await comCliente(async c => {
      await exigirFuncao(c)
      const r = await c.query(
        `SELECT has_function_privilege('service_role',  $1, 'EXECUTE') AS service_role,
                has_function_privilege('anon',          $1, 'EXECUTE') AS anon,
                has_function_privilege('authenticated', $1, 'EXECUTE') AS authenticated,
                has_function_privilege('verificador',   $1, 'EXECUTE') AS verificador,
                has_function_privilege('ingestor',      $1, 'EXECUTE') AS ingestor`,
        [ASSINATURA],
      )
      const p = await c.query(
        `SELECT (p.proacl IS NULL) AS acl_default,
                coalesce(array_to_string(p.proacl, ' '), '') AS acl,
                coalesce(obj_description(p.oid, 'pg_proc'), '') AS comentario
           FROM pg_proc p WHERE p.oid = to_regprocedure($1)`,
        [ASSINATURA],
      )
      return { existe: p.rows[0], privilegios: r.rows[0], acl: String(p.rows[0]?.acl ?? ''), comentario: String(p.rows[0]?.comentario ?? '') }
    })

    // ACL default (proacl NULL) = EXECUTE para PUBLIC — o estado que o REVOKE explícito da 0287 remove.
    expect(existe?.acl_default, `${ASSINATURA}: voltou ao ACL DEFAULT (EXECUTE para PUBLIC)`).toBe(false)
    expect(acl, `${ASSINATURA}: proacl concede a PUBLIC`).not.toMatch(/(^|\s)=X\//)
    expect(privilegios?.service_role, 'service_role é quem chama (carga.ts pelo cliente de servidor)').toBe(true)
    expect(privilegios?.anon, 'anon executa a função').toBe(false)
    expect(privilegios?.authenticated, 'authenticated executa a função').toBe(false)
    // As duas credenciais de MÁQUINA (ADR-0175): a função NÃO entra em allowlist nenhuma. Se o
    // `derivar-allowlist.mjs` a incluísse por engano, é aqui que reprova.
    expect(privilegios?.verificador, 'verificador tem EXECUTE — a função vazou para a allowlist derivada').toBe(false)
    expect(privilegios?.ingestor, 'ingestor tem EXECUTE — a função vazou para a allowlist da ingestão').toBe(false)
    // Como as irmãs service_role-only (0276/0280): o comentário declara POR QUE não tem exigir_acesso.
    expect(comentario, `${ASSINATURA}: comentário sem menção a service_role`).toMatch(/service_role/)
  })
})

// ── v6.1.0 (0288) — `promover_carga_operacao` devolve o conjunto "antes", no CATÁLOGO VIVO ────
// O `operacoes_antes` do resultado é capturado DENTRO da transação, sob o lock, ANTES do TRUNCATE —
// é o que faz o diff de operações sobreviver a uma retentativa depois de promoção commitada e a
// duas cargas de Operação intercaladas (achado ALTO do `revisor`). Nada disso aparece em shape de
// RPC que o `tsc` cheque, e o modo de falha é o silencioso: um `CREATE OR REPLACE` futuro escrito a
// partir da migration 0287 (em vez do catálogo vivo — skill banco-e-rpc §5) apaga a chave sem
// quebrar teste nenhum, e a remoção volta a poder passar calada. Leitura de `pg_get_functiondef`,
// READ ONLY, sem executar a função. O nome vive na constante de assinatura — nunca como argumento
// literal de `rpc(` nem valor de `fn:` (o `derivar-allowlist.mjs` extrai esses padrões do texto).
describe.skipIf(!ON || !DB_URL)('contrato RPC — promover_carga_operacao (0288): operacoes_antes capturado antes do TRUNCATE', () => {
  const ASSINATURA = 'public.promover_carga_operacao(jsonb, uuid)'

  async function corpoVivo(): Promise<string> {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    // Trava READ ONLY de SESSÃO, por CONEXÃO (sonda-teste-escreve-banco).
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try {
      const r = await c.query(
        `SELECT pg_get_functiondef(to_regprocedure($1)) AS def, to_regprocedure($1) IS NOT NULL AS existe`,
        [ASSINATURA],
      )
      expect(r.rows[0]?.existe, `${ASSINATURA} não existe no catálogo`).toBe(true)
      return String(r.rows[0]?.def ?? '')
    } finally { await c.end() }
  }

  it('o corpo vivo: lock → v_antes := ingestao_operacoes_vigentes() → 1º TRUNCATE, e operacoes_antes dentro do jsonb_build_object de v_result', async () => {
    const def = await corpoVivo()
    // Sem comentários: uma menção a TRUNCATE/v_antes num `--` não pode enganar a ordem.
    const corpo = def.replace(/--.*$/gm, '')

    expect(corpo, 'o resultado perdeu a chave operacoes_antes (0288 revertida por um CREATE OR REPLACE?)').toContain('operacoes_antes')
    expect(corpo, 'a captura não chama mais ingestao_operacoes_vigentes()').toContain('ingestao_operacoes_vigentes()')

    // O lock serializa as promoções de Operação; o "antes" só é confiável se for lido DEPOIS dele
    // (senão outra promoção troca a base entre a leitura e o TRUNCATE) e ANTES do primeiro TRUNCATE.
    const lock = corpo.indexOf('pg_advisory_xact_lock(4017040)')
    const atribuicao = corpo.search(/\bv_antes\s*:=/i)
    const primeiroTruncate = corpo.search(/\bTRUNCATE\b/i)
    expect(lock, 'o corpo não toma pg_advisory_xact_lock(4017040)').toBeGreaterThanOrEqual(0)
    expect(atribuicao, 'não há atribuição a v_antes no corpo').toBeGreaterThanOrEqual(0)
    expect(primeiroTruncate, 'o corpo não tem TRUNCATE (a promoção deixou de trocar a base?)').toBeGreaterThanOrEqual(0)
    expect(lock, 'o lock vem DEPOIS de v_antes — o "antes" seria lido sem exclusão mútua').toBeLessThan(atribuicao)
    expect(atribuicao, 'v_antes é atribuído DEPOIS do primeiro TRUNCATE — o "antes" já seria a base nova').toBeLessThan(primeiroTruncate)

    // `operacoes_antes` tem de estar DENTRO do jsonb_build_object que monta `v_result` — não basta
    // a palavra aparecer (num RAISE, num literal solto): é a chave do resultado guardado em
    // `ingestao.promocao` e devolvido no replay.
    const inicioResultado = corpo.search(/\bv_result\s*:=\s*jsonb_build_object\s*\(/i)
    expect(inicioResultado, 'não há `v_result := jsonb_build_object(` no corpo').toBeGreaterThanOrEqual(0)
    const aPartirDoResultado = corpo.slice(inicioResultado)
    const abre = aPartirDoResultado.indexOf('(')
    let profundidade = 0
    let fecha = -1
    for (let i = abre; i < aPartirDoResultado.length; i++) {
      const ch = aPartirDoResultado[i]
      if (ch === '(') profundidade++
      else if (ch === ')') { profundidade--; if (profundidade === 0) { fecha = i; break } }
    }
    expect(fecha, 'parênteses do jsonb_build_object de v_result não fecham (corpo lido errado?)').toBeGreaterThan(abre)
    const construtor = aPartirDoResultado.slice(abre, fecha + 1)
    expect(construtor, "'operacoes_antes' não está dentro do jsonb_build_object de v_result").toMatch(/'operacoes_antes'\s*,\s*v_antes\b/)
  })
})

// ── v5.10.0 (0269) — grants explícitos, COMMENTs e o texto do RAISE, no CATÁLOGO VIVO ───
// A 0269 é aditiva e o que ela muda não aparece em nenhum retorno de RPC: privilégio de
// EXECUTE, comentário de catálogo e uma string de mensagem de erro. Nada disso o `tsc`, o
// lint ou um caso de shape pegariam — e o modo de falha é o pior tipo, o silencioso: um
// `CREATE OR REPLACE` futuro escrito a partir da migration de ORIGEM em vez do catálogo
// vivo reverte tudo sem quebrar teste nenhum (é a regressão que a skill banco-e-rpc §5
// descreve, e que já aconteceu no projeto). Estas sondas reprovam essa reversão.
describe.skipIf(!ON || !DB_URL)('contrato RPC — 0269: grants, comentários e rebranding do RAISE', () => {
  async function comCliente<T>(f: (c: { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }) => Promise<T>): Promise<T> {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    // Trava READ ONLY de SESSÃO (v5.10.3): este bloco só LÊ catálogo/agregados, e a
    // declaração `SOMENTE_LEITURA` da sonda passa a ser cobrada mecanicamente aqui. Não é
    // documentação — é o Postgres recusando qualquer escrita nesta conexão ("cannot execute
    // ... in a read-only transaction"), inclusive a que uma FUNÇÃO faria por dentro, que é
    // justamente o que o texto do teste não mostra. Precedente: a medição do baseline da
    // v5.4.5. `CHARACTERISTICS` (e não `SET TRANSACTION`) porque vale para toda transação
    // implícita da sessão, sem precisar de um BEGIN — e abrir BEGIN aqui reprovaria a
    // própria declaração de só-leitura.
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try { return await f(c) } finally { await c.end() }
  }

  // As 8 que a 0269 endureceu (D2-010). `proacl IS NULL` = ACL DEFAULT do Postgres =
  // EXECUTE para PUBLIC — o estado que a migration removeu.
  const ENDURECIDAS: ReadonlyArray<[string, string]> = [
    ['analytics',  'extrair_nome_casal'],
    ['analytics',  'fn_gerencial_lancamentos_atualizado'],
    ['analytics',  'regenerar_dim_operacao_weddings'],
    ['analytics',  'situacao_por_data_evento'],
    ['app',        'norm_nome'],
    ['financeiro', 'fn_broadcast_gerencial'],
    ['financeiro', 'fn_diario_alteracoes'],
    ['financeiro', 'fn_dre_touch_atualizado_em'],
  ]

  it('D2-010: nenhuma das 8 volta a depender do ACL DEFAULT (nem PUBLIC, nem anon, nem authenticated)', async () => {
    const rows = await comCliente(async c => {
      const r = await c.query(
        `SELECT n.nspname AS schema, p.proname AS nome,
                (p.proacl IS NULL) AS acl_default,
                coalesce(array_to_string(p.proacl, ' '), '') AS acl
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE (n.nspname, p.proname) IN (
                  ('analytics','extrair_nome_casal'),('analytics','fn_gerencial_lancamentos_atualizado'),
                  ('analytics','regenerar_dim_operacao_weddings'),('analytics','situacao_por_data_evento'),
                  ('app','norm_nome'),('financeiro','fn_broadcast_gerencial'),
                  ('financeiro','fn_diario_alteracoes'),('financeiro','fn_dre_touch_atualizado_em'))`,
      )
      return r.rows
    })

    expect(rows.length, 'as 8 funções endurecidas pela 0269 têm de existir').toBe(ENDURECIDAS.length)
    for (const row of rows) {
      const quem = `${row.schema}.${row.nome}`
      // ACL default de volta = alguém recriou a função sem reaplicar o REVOKE.
      expect(row.acl_default, `${quem}: voltou ao ACL DEFAULT (EXECUTE para PUBLIC) — a 0269 foi revertida?`).toBe(false)
      const acl = String(row.acl)
      // `=X/` sem role à esquerda é a forma do grant a PUBLIC no proacl.
      expect(acl, `${quem}: proacl concede a PUBLIC`).not.toMatch(/(^|\s)=X\//)
      expect(acl, `${quem}: proacl concede a anon`).not.toMatch(/\banon=/)
      expect(acl, `${quem}: proacl concede a authenticated`).not.toMatch(/\bauthenticated=/)
    }
  })

  it('D9-015: o guard do RBAC lança "Janus", não o nome pré-rebranding — e o CÓDIGO do erro não mudou', async () => {
    const def = await comCliente(async c => {
      const r = await c.query(
        `SELECT pg_get_functiondef(p.oid) AS def
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'app' AND p.proname = 'exigir_acesso'`,
      )
      expect(r.rows.length, 'app.exigir_acesso: esperada 1 definição').toBe(1)
      return r.rows[0].def as string
    })

    expect(def).toContain('USUARIO_INATIVO: sem cadastro ativo no Janus')
    expect(def, 'texto pré-rebranding voltou ao guard do RBAC').not.toMatch(/WT\s*Finance/i)

    // O CÓDIGO do erro é o contrato (ERROS_BANCO em admin/acessos/actions.ts trata por
    // prefixo); o texto livre é log. Trocar o texto não pode ter mexido no código.
    expect(def).toMatch(/RAISE EXCEPTION 'USUARIO_INATIVO:[^']*'\s*\n?\s*USING ERRCODE = '42501'/)

    // E os outros três ramos do guard seguem intactos — o CREATE OR REPLACE da 0269 só
    // podia tocar uma linha (o diff foi conferido linha a linha antes de aplicar).
    expect(def).toContain('AUTH_NECESSARIA: contexto sem identidade')
    expect(def).toContain('AUTH_NECESSARIA: acesso anônimo desativado')
    expect(def).toMatch(/PERMISSAO_NEGADA: requer uma de/)
    expect(def).toMatch(/STABLE SECURITY DEFINER/)
    expect(def).toMatch(/SET search_path TO ''/)
    expect(def).toMatch(/p_areas text\[\] DEFAULT NULL::text\[\]/)
  })

  it('D2-006/D2-016: o kill switch e as RPCs centrais têm COMMENT no catálogo', async () => {
    const rows = await comCliente(async c => {
      const r = await c.query(
        `SELECT n.nspname AS schema, p.proname AS nome,
                coalesce(obj_description(p.oid, 'pg_proc'), '') AS comentario
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE (n.nspname, p.proname) IN (
                  ('public','admin_set_enforcement'),('app','exigir_acesso'),
                  ('public','get_operacoes_weddings'),('public','promover_carga_vendas'),
                  ('public','get_dre_mensal'),('public','get_dre_competencia_mensal'),
                  ('public','ingestao_carga_abrir'),('public','ingestao_carga_concluir'),
                  ('public','ingestao_carga_obter'),('public','ingestao_carga_ultima'),
                  ('public','ingestao_vigia_definir'),('public','ingestao_expectativa_definir'),
                  ('public','ingestao_painel'),('public','ingestao_vigia_estado'),
                  ('public','ingestao_alarme_abrir'),
                  ('public','ingestao_retencao_inventario'),('public','ingestao_retencao_registrar'),
                  ('public','ingestao_operacoes_vigentes'))`,
      )
      return r.rows
    })
    const por = new Map(rows.map(r => [`${r.schema}.${r.nome}`, String(r.comentario)]))

    for (const [quem, c] of por) {
      expect(c.length, `${quem}: sem COMMENT no catálogo (a 0269 foi revertida?)`).toBeGreaterThan(30)
    }

    // D2-006: o comentário existe para que a próxima varredura de código morto NÃO
    // proponha o DROP do kill switch. Se o texto perder isso, perde a função dele.
    const kill = por.get('public.admin_set_enforcement') ?? ''
    expect(kill).toMatch(/DORMENTE/i)
    expect(kill).toMatch(/NÃO REMOVER|NAO REMOVER/i)
    expect(kill).toMatch(/runbook/i)

    // D2-016: o fato mais útil de cada comentário é a ÁREA de RBAC exigida.
    expect(por.get('public.get_operacoes_weddings') ?? '').toMatch(/performance\/weddings/)
    expect(por.get('public.get_dre_mensal') ?? '').toMatch(/financeiro\/dre/)
    expect(por.get('public.get_dre_competencia_mensal') ?? '').toMatch(/financeiro\/dre/)
    // E a de carga declara por que NÃO tem exigir_acesso no corpo.
    expect(por.get('public.promover_carga_vendas') ?? '').toMatch(/service_role/)

    // As 4 RPCs da ingestão (0276) são da MESMA classe que promover_carga_vendas: sem
    // exigir_acesso no corpo porque a superfície não tem sessão de usuário — quem
    // autoriza é a rota /api/ingestao/{base}. O comentário de cada uma tem de carregar
    // essa explicação (service_role-only), não só existir.
    for (const nome of [
      'ingestao_carga_abrir', 'ingestao_carga_concluir', 'ingestao_carga_obter', 'ingestao_carga_ultima',
    ]) {
      const c = por.get(`public.${nome}`) ?? ''
      expect(c, `public.${nome}: comentário sem menção a service_role (0276)`).toMatch(/service_role/)
    }

    // 0280 (M6): as três que a TELA chama são as únicas desta família com exigir_acesso — e duas
    // delas DESLIGAM o detector de falha (vigia, expectativa). O comentário tem de dizer a área.
    for (const nome of ['ingestao_vigia_definir', 'ingestao_expectativa_definir', 'ingestao_painel']) {
      expect(por.get(`public.${nome}`) ?? '', `public.${nome}: comentário sem a área de RBAC (0280)`).toMatch(/admin\/uploads/)
    }
    // As que só o servidor chama (vigia, alarme, e as duas da limpeza do cru — 0282) declaram por
    // que não têm exigir_acesso.
    for (const nome of ['ingestao_vigia_estado', 'ingestao_alarme_abrir', 'ingestao_retencao_inventario', 'ingestao_retencao_registrar']) {
      expect(por.get(`public.${nome}`) ?? '', `public.${nome}: comentário sem menção a service_role (0280)`).toMatch(/service_role/)
    }
    // 0287 (v6.1.0): o conjunto de operações vigente, lido por carga.ts antes da promoção — mesma
    // classe (só o servidor chama; sem exigir_acesso; protegida por GRANT).
    expect(por.get('public.ingestao_operacoes_vigentes') ?? '', 'public.ingestao_operacoes_vigentes: comentário sem menção a service_role (0287)').toMatch(/service_role/)
    // Sem a linha, o `for` acima não reprova uma função que sumiu do catálogo — só as que existem.
    expect(por.size, 'uma das RPCs listadas não existe no catálogo').toBe(18)
  })
})

// ── v6.3.0 (0292) — Gastos de Marketing: as 3 RPCs de leitura da página /marketing/gastos ─────
// SÓ LEITURA (nenhuma escrita; o bloco de `pg` abaixo trava a sessão em READ ONLY).
//
// O que este bloco prova, e por que cada coisa é caso de contrato (skill contrato-rpc-front §5):
//   1. PARIDADE COM A DRE — o total do mês da página (Σ `porMesCategoria[mês].valor`) é a célula
//      MKT de `get_dre_mensal(ano)`, AO CENTAVO. Os dois números aparecem em telas vizinhas e a
//      0292 os mantém iguais por COPIAR o predicado da DRE (tipo=realizado, de-para vivo, bloco
//      MKT); se alguém "otimizar" uma das duas RPCs e a igualdade cair, é aqui que estoura. A DRE
//      troca realizado por PREVISTO nos meses futuros do ano corrente — esses não se comparam: o
//      teto de meses vem da PRÓPRIA resposta da DRE (`relacao`/`mes_corrente`), a definição que a
//      RPC usa para decidir o que é realizado. Comparação em CENTAVOS INTEIROS, célula a célula.
//   2. COMPLETUDE — por ano e mês, Σ lançamentos ≡ Σ fornecedores ≡ Σ resumo (valor e qtd), e a
//      mesma coisa na granularidade fina (mês×fornecedor, mês×categoria).
//   3. LISTA FECHADA de colunas do lançamento (decisão do Yan: nada de conta bancária/cartão),
//      conferida no JSON CRU — o schema Zod descarta chave extra em silêncio e aprovaria o vazamento.
//   4. Ano sem dado → arrays vazios e `cobertura: null`; ano inválido → 'Ano inválido.'.
//   5. NEGAÇÕES: `anon` (sem JWT) e usuário ATIVO sem a área `marketing/gastos`.
//
// RESSALVA (revisor-db): as 3 chamadas de um ano são SNAPSHOTS separados (3 requisições REST). Uma
// carga que entre entre elas poderia, em milissegundos, fazer a completude divergir sem bug algum. O
// arquivo não tem padrão de retentativa e este bloco NÃO inventa um: a divergência, se aparecer,
// reprova alto e deve ser re-rodada à mão.
//
// Os nomes das RPCs aparecem como argumento literal da helper `rpc(` e como valor de `fn:` — é o
// que `scripts/credencial/derivar-allowlist.mjs` extrai para derivar o GRANT do `verificador`.

const RPCS_MKT = [
  { fn: 'get_marketing_gastos_resumo' },
  { fn: 'get_marketing_gastos_fornecedores' },
  { fn: 'get_marketing_gastos_lancamentos' },
  // 0293: mesma área e mesma validação de ano. Entrar aqui faz o caso "ano inválido", a negação
  // `anon` e a negação "usuário sem a área" (blocos abaixo) cobrirem também a RPC de proporção.
  { fn: 'get_marketing_proporcao_receita' },
] as const

const ANO_INICIAL_MKT = 2024
/** Todos os anos com possibilidade de dado: do primeiro ano do fluxo realizado ao corrente (SP). */
const ANOS_MKT = Array.from({ length: ANO_SP_MKT - ANO_INICIAL_MKT + 1 }, (_, i) => ANO_INICIAL_MKT + i)
/** Lista FECHADA de colunas do lançamento (migration 0292). Ordem alfabética, como `Object.keys().sort()`. */
const CHAVES_LANCAMENTO_MKT = ['categoria', 'data', 'descricao', 'documento', 'fornecedor', 'id', 'valor']

/** Centavos inteiros: o `numeric` do banco serializa como número JSON, e a igualdade é ao centavo. */
const centavos = (v: number): number => Math.round(v * 100)
const somaCentavos = (valores: number[]): number => valores.reduce((s, v) => s + centavos(v), 0)

/** Agrupa por chave e devolve linhas ordenadas "chave → centavos / qtd" — comparáveis por `toEqual`
 *  com mensagem de diferença legível. */
function agruparMkt<T>(itens: T[], chave: (x: T) => string, valor: (x: T) => number, qtd: (x: T) => number): string[] {
  const m = new Map<string, { c: number; q: number }>()
  for (const x of itens) {
    const k = chave(x)
    const a = m.get(k) ?? { c: 0, q: 0 }
    a.c += centavos(valor(x))
    a.q += qtd(x)
    m.set(k, a)
  }
  return [...m.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k} → ${v.c} centavos / ${v.q} lançamentos`)
}

function exigirParseMkt<T>(schema: ZodType<T>, cru: unknown, nome: string): T {
  const r = schema.safeParse(cru)
  if (!r.success) throw new Error(`${nome} drift: ${JSON.stringify(r.error.issues.slice(0, 6))}`)
  return r.data
}

// Um ano é carregado UMA vez e reaproveitado pelos casos (cada ano = 3 requisições em paralelo).
const cacheMkt = new Map<number, ReturnType<typeof carregarMkt>>()
async function carregarMkt(ano: number) {
  const [resumoCru, fornecedoresCru, lancamentosCru] = await Promise.all([
    rpc('get_marketing_gastos_resumo', { p_ano: ano }),
    rpc('get_marketing_gastos_fornecedores', { p_ano: ano }),
    rpc('get_marketing_gastos_lancamentos', { p_ano: ano }) as unknown as Promise<Array<Record<string, unknown>>>,
  ])
  return {
    resumo: exigirParseMkt(resumoMarketingSchema, resumoCru, `resumo ${ano}`),
    fornecedores: exigirParseMkt(fornecedoresMarketingSchema, fornecedoresCru, `fornecedores ${ano}`),
    lancamentos: exigirParseMkt(lancamentosMarketingSchema, lancamentosCru, `lancamentos ${ano}`),
    lancamentosCru,
  }
}
function dadosMkt(ano: number) {
  let p = cacheMkt.get(ano)
  if (!p) { p = carregarMkt(ano); cacheMkt.set(ano, p) }
  return p
}

describe.skipIf(!ON)('contrato RPC — Gastos de Marketing (v6.3.0, 0292)', () => {
  it('a base viva TEM gasto de marketing realizado (sem isto, paridade e completude passariam 0=0)', async () => {
    const todos = await Promise.all(ANOS_MKT.map(dadosMkt))
    const total = todos.reduce((s, d) => s + d.lancamentos.length, 0)
    expect(total, 'nenhum lançamento MKT realizado em nenhum ano — filtro quebrado ou de-para sem o bloco MKT?').toBeGreaterThan(0)
  }, 30_000)

  it.each(ANOS_MKT)('%i: as 3 RPCs passam nos schemas Zod e devolvem o ano pedido; cobertura ↔ dado coerentes', async (ano) => {
    const { resumo, fornecedores, lancamentos } = await dadosMkt(ano)
    expect(resumo.ano).toBe(ano)
    expect(fornecedores.ano).toBe(ano)
    expect([...resumo.anosDisponiveis].sort((a, b) => a - b), 'anosDisponiveis fora de ordem crescente').toEqual(resumo.anosDisponiveis)
    const temDado = lancamentos.length > 0
    expect(resumo.porMesCategoria.length > 0, 'resumo × lançamentos discordam sobre o ano ter dado').toBe(temDado)
    expect(fornecedores.porMesFornecedor.length > 0, 'fornecedores × lançamentos discordam sobre o ano ter dado').toBe(temDado)
    if (temDado) {
      expect(resumo.anosDisponiveis).toContain(ano)
      expect(resumo.cobertura, 'ano com dado precisa de cobertura').not.toBeNull()
      expect(resumo.cobertura!.min <= resumo.cobertura!.max).toBe(true)
      expect(resumo.cobertura!.min.startsWith(`${ano}-`)).toBe(true)
      expect(resumo.cobertura!.max.startsWith(`${ano}-`)).toBe(true)
    } else {
      expect(resumo.cobertura).toBeNull()
    }
  })

  // INVARIANTE 1 — o oráculo de paridade com a DRE.
  it.each(ANOS_MKT)('%i: Σ porMesCategoria[mês] ≡ célula MKT de get_dre_mensal, ao centavo, em cada mês realizado', async (ano) => {
    const { resumo } = await dadosMkt(ano)
    const dre = exigirParseMkt(dreMensalSchema, await rpc('get_dre_mensal', { p_ano: ano }), `get_dre_mensal ${ano}`)

    // Sanidade do próprio teto: ano passado = fechado (12 meses); o corrente = corrente (até o mês
    // de hoje em SP). 'futuro' nunca ocorre na faixa 2024..ano corrente.
    expect(dre.relacao, `get_dre_mensal(${ano}).relacao`).toBe(ano < ANO_SP_MKT ? 'fechado' : 'corrente')
    const ultimoMes = dre.relacao === 'fechado' ? 12 : (dre.mes_corrente ?? 0)
    expect(ultimoMes, 'sem mês realizado para comparar').toBeGreaterThanOrEqual(1)

    const mkt = dre.linhas.filter(l => l.t !== 'cat' && l.chave === 'MKT')
    expect(mkt.length, 'a DRE precisa ter EXATAMENTE uma linha de bloco com chave MKT').toBe(1)

    const divergencias: string[] = []
    for (let mes = 1; mes <= ultimoMes; mes++) {
      const pagina = somaCentavos(resumo.porMesCategoria.filter(x => x.mes === mes).map(x => x.valor))
      const celulaDre = centavos(mkt[0].meses[mes - 1])
      if (pagina !== celulaDre) divergencias.push(`${ano}-${String(mes).padStart(2, '0')}: página ${pagina} ≠ DRE ${celulaDre} (centavos)`)
    }
    expect(divergencias, `a página discorda da DRE:\n${divergencias.join('\n')}`).toEqual([])

    // A página é só REALIZADO: mês depois do último realizado = zero linhas (a DRE ali é previsto).
    const futuros = resumo.porMesCategoria.filter(x => x.mes > ultimoMes)
    expect(futuros, `linhas de realizado em mês futuro de ${ano}`).toEqual([])
  }, 30_000)

  // INVARIANTE 4 — completude: as 3 visões do mesmo conjunto fecham entre si.
  it.each(ANOS_MKT)('%i: completude — Σ lançamentos ≡ Σ fornecedores ≡ Σ resumo (valor e qtd), por mês, mês×fornecedor e mês×categoria', async (ano) => {
    const { resumo, fornecedores, lancamentos } = await dadosMkt(ano)
    const mesDe = (data: string): number => Number(data.slice(5, 7))
    const meses = Array.from({ length: 12 }, (_, i) => i + 1)

    const porMes = {
      lancamentos: meses.map(m => {
        const doMes = lancamentos.filter(l => mesDe(l.data) === m)
        return { mes: m, centavos: somaCentavos(doMes.map(l => l.valor)), qtd: doMes.length }
      }),
      fornecedores: meses.map(m => {
        const doMes = fornecedores.porMesFornecedor.filter(x => x.mes === m)
        return { mes: m, centavos: somaCentavos(doMes.map(x => x.valor)), qtd: doMes.reduce((s, x) => s + x.qtd, 0) }
      }),
      resumo: meses.map(m => {
        const doMes = resumo.porMesCategoria.filter(x => x.mes === m)
        return { mes: m, centavos: somaCentavos(doMes.map(x => x.valor)), qtd: doMes.reduce((s, x) => s + x.qtd, 0) }
      }),
    }
    expect(porMes.fornecedores, 'Σ fornecedores ≠ Σ lançamentos (por mês)').toEqual(porMes.lancamentos)
    expect(porMes.resumo, 'Σ resumo ≠ Σ lançamentos (por mês)').toEqual(porMes.lancamentos)

    // Granularidade fina. Fornecedor NULL (vazio/só-espaço) é um balde próprio dos dois lados.
    const chaveForn = (mes: number, f: string | null) => JSON.stringify([mes, f])
    expect(
      agruparMkt(fornecedores.porMesFornecedor, x => chaveForn(x.mes, x.fornecedor), x => x.valor, x => x.qtd),
      'mês×fornecedor: fornecedores ≠ lançamentos',
    ).toEqual(agruparMkt(lancamentos, l => chaveForn(mesDe(l.data), l.fornecedor), l => l.valor, () => 1))

    const chaveCat = (mes: number, c: string) => JSON.stringify([mes, c])
    expect(
      agruparMkt(resumo.porMesCategoria, x => chaveCat(x.mes, x.categoria), x => x.valor, x => x.qtd),
      'mês×categoria: resumo ≠ lançamentos',
    ).toEqual(agruparMkt(lancamentos, l => chaveCat(mesDe(l.data), l.categoria), l => l.valor, () => 1))
  })

  it('lista FECHADA: cada lançamento tem exatamente id, data, categoria, fornecedor, descricao, documento, valor (JSON cru)', async () => {
    let vistos = 0
    for (const ano of ANOS_MKT) {
      const { lancamentosCru } = await dadosMkt(ano)
      const ids = new Set<unknown>()
      for (const item of lancamentosCru) {
        // No JSON CRU, antes de qualquer safeParse: o `z.object` descarta chave extra em silêncio.
        expect(Object.keys(item).sort(), `chaves do lançamento ${JSON.stringify(item)}`).toEqual(CHAVES_LANCAMENTO_MKT)
        expect(String(item.data).startsWith(`${ano}-`), `lançamento fora do ano ${ano}: ${JSON.stringify(item)}`).toBe(true)
        expect(ids.has(item.id), `id repetido ${String(item.id)} em ${ano}`).toBe(false)
        ids.add(item.id)
        vistos++
      }
    }
    // Caso positivo: sem isto o laço acima passaria vazio numa RPC que devolvesse `[]` por engano.
    expect(vistos, 'nenhum lançamento examinado').toBeGreaterThan(0)
  })

  it('ano sem dado (o anterior ao primeiro de anosDisponiveis): arrays vazios e cobertura null nas 3', async () => {
    const { resumo: base } = await dadosMkt(ANO_FECHADO_MKT)
    expect(base.anosDisponiveis.length, 'a base viva não tem ano algum com gasto MKT').toBeGreaterThan(0)
    const anoVazio = Math.min(...base.anosDisponiveis) - 1
    expect(anoVazio, 'ano vazio fora da faixa aceita pela RPC').toBeGreaterThanOrEqual(2000)

    const { resumo, fornecedores, lancamentos } = await dadosMkt(anoVazio)
    expect(resumo.ano).toBe(anoVazio)
    expect(resumo.porMesCategoria).toEqual([])
    expect(resumo.cobertura).toBeNull()
    expect(fornecedores.ano).toBe(anoVazio)
    expect(fornecedores.porMesFornecedor).toEqual([])
    expect(lancamentos).toEqual([])
    // Os metadados não dependem do ano pedido: a lista de anos com dado é a mesma.
    expect(resumo.anosDisponiveis).toEqual(base.anosDisponiveis)
  })

  it.each(RPCS_MKT)('$fn: ano inválido (1999) → erro "Ano inválido." (400), não lista vazia', async ({ fn }) => {
    const { status, texto } = await statusVerificador(fn, { p_ano: 1999 })
    expect(status, `${fn}: esperado 4xx, veio ${status}: ${texto}`).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
    let mensagem = ''
    try { mensagem = String((JSON.parse(texto) as { message?: unknown }).message) } catch { /* corpo não-JSON: cai no expect abaixo */ }
    expect(mensagem, `${fn}: corpo do erro = ${texto}`).toBe('Ano inválido.')
  })
})

// ── v6.3.0 (0293) — Gastos de Marketing: proporção sobre a Receita Bruta ≡ GRADE da DRE ──────
// O card "Marketing ÷ Receita Bruta" da página de Gastos de Marketing mostra, POR COMPETÊNCIA, o
// mesmo número que a grade "Proporção sobre a Receita Bruta" da DRE (`/financeiro/dre`) mostra para o
// grupo MKT. São duas telas vizinhas com o MESMO número (skill contrato-rpc-front §5) — a igualdade é
// caso de contrato, não nota de rodapé. A RPC nova NÃO chama `get_dre_competencia_mensal` (gated por
// `financeiro/dre`): lê as mesmas views e repete só o filtro e as somas. Este bloco é o que cai se
// alguma das duas pontas for "otimizada" sozinha.
//
// Oráculo = o que a página da DRE faz (financeiro/dre/page.tsx:341-351), com as funções TS REAIS:
//   · janela por ano: `ano === anoCorrente ? janelaYtdCompetencia(payload do corrente) : 12`;
//   · % : `montarProporcaoGrupos(...)` → série 'MKT' → `pontos[i].av`.
// A RPC devolve SÓ o % (nunca os centavos de Marketing e de Receita Bruta — achado do revisor-db:
// a receita exata vazaria para quem só tem a área de Marketing). O banco faz a divisão em NUMERIC
// sobre os mesmos centavos inteiros; o TS, em float: tolerância de 1e-9 p.p. (muito abaixo da
// 1 casa exibida), e null ≡ null (ano sem ponto, receita ≤ 0).
describe.skipIf(!ON)('contrato RPC — Gastos de Marketing: proporção sobre a Receita Bruta ≡ grade da DRE (v6.3.0, 0293)', () => {
  async function carregarProporcao() {
    const porAno = await Promise.all(ANOS_MKT.map(async ano => ({
      ano,
      prop: exigirParseMkt(
        proporcaoReceitaMarketingSchema,
        await rpc('get_marketing_proporcao_receita', { p_ano: ano }),
        `proporção ${ano}`,
      ),
      comp: dreCompMensalSchema.parse(await rpc('get_dre_competencia_mensal', { p_ano: ano })),
    })))
    const corrente = porAno.find(x => x.ano === ANO_SP_MKT)
    if (!corrente) throw new Error(`ano corrente ${ANO_SP_MKT} fora de ANOS_MKT`)
    // A janela do ano corrente, exatamente como a página da DRE a obtém.
    const mCob = janelaYtdCompetencia(corrente.comp)
    const anos = porAno.map(x => ({ ano: x.ano, payload: x.comp, meses: x.ano === ANO_SP_MKT ? mCob : 12 }))
    const serieMkt = montarProporcaoGrupos(anos).find(s => s.chave === 'MKT')
    if (!serieMkt) throw new Error('a grade de proporção não tem a série MKT')
    return { porAno, anos, serieMkt }
  }
  let cacheProporcao: ReturnType<typeof carregarProporcao> | undefined
  const dadosProporcao = () => (cacheProporcao ??= carregarProporcao())

  it.each(ANOS_MKT)('%i: janela — mesesCobertos, parcial e coberturaAte ≡ os da grade da DRE', async (ano) => {
    const { porAno, anos, serieMkt } = await dadosProporcao()
    const i = porAno.findIndex(x => x.ano === ano)
    const { prop, comp } = porAno[i]
    expect(prop.ano).toBe(ano)
    expect(prop.mesesCobertos, `mesesCobertos ${ano}`).toBe(anos[i].meses)
    expect(prop.parcial, `parcial ${ano}`).toBe(serieMkt.pontos[i].parcial)
    expect(prop.coberturaAte, `coberturaAte ${ano} ≠ cobertura_ate da DRE`).toBe(comp.cobertura_ate ?? null)
  }, 30_000)

  it.each(ANOS_MKT)('%i: pct da RPC ≡ o ponto MKT de montarProporcaoGrupos (a grade)', async (ano) => {
    const { porAno, serieMkt } = await dadosProporcao()
    const i = porAno.findIndex(x => x.ano === ano)
    const { prop } = porAno[i]
    const daGrade = serieMkt.pontos[i].av
    if (daGrade === null) {
      expect(prop.pct, `pct ${ano}: a grade não tem ponto, a RPC deveria devolver null`).toBeNull()
      return
    }
    expect(prop.pct, `pct ${ano}: a RPC devolveu null e a grade tem ${daGrade}`).not.toBeNull()
    expect(prop.pct as number, `pct ${ano}: RPC ${String(prop.pct)} ≠ grade ${daGrade}`).toBeCloseTo(daGrade, 9)
  }, 30_000)

  it('caso POSITIVO: ao menos um ano tem % de Marketing ≠ 0 (sem isto a igualdade passaria 0=0 / null=null)', async () => {
    const { porAno } = await dadosProporcao()
    const comValor = porAno.filter(x => x.prop.pct !== null && x.prop.pct !== 0)
    expect(comValor.length, 'nenhum ano com % de Marketing ≠ 0 na base viva — filtro quebrado ou de-para sem o grupo MKT?')
      .toBeGreaterThan(0)
  }, 30_000)
})

// ── NEGAÇÃO 1: anon (sem JWT) ────────────────────────────────────────────────────────────────
// REVOKE EXECUTE de PUBLIC/anon nas 3 (0292) e na de proporção (0293) → o PostgREST responde com o erro de permissão
// (42501), que para o papel `anon` vira HTTP 401 (403 para `authenticated`). Aceita-se as duas
// faixas, e o que se EXIGE é o código do Postgres no corpo — não uma resposta 200 vazia.
describe.skipIf(!ON || !ANON)('contrato RBAC — Gastos de Marketing: anon negado (v6.3.0)', () => {
  it.each(RPCS_MKT)('$fn: anon → erro de permissão 42501 (HTTP 401/403)', async ({ fn }) => {
    const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON as string, Authorization: `Bearer ${ANON as string}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ano: ANO_FECHADO_MKT }),
    })
    const texto = await res.text()
    expect([401, 403], `${fn}: anon recebeu HTTP ${res.status}: ${texto}`).toContain(res.status)
    let codigo = ''
    try { codigo = String((JSON.parse(texto) as { code?: unknown }).code) } catch { /* corpo não-JSON: cai no expect abaixo */ }
    expect(codigo, `${fn}: corpo do erro = ${texto}`).toBe('42501')
  })
})

// ── NEGAÇÃO 2: usuário ATIVO sem a área `marketing/gastos` ───────────────────────────────────
// Caminho que o repo já usa (estante-rpcs, contrato-api-externa, ingestao_painel): conexão direta
// `pg` assumindo identidade por `request.jwt.claims`, porque o REST do `verificador` (que TEM a
// área) e a service_role (que faz bypass do guard) não alcançam este ramo. Aqui é SOMENTE LEITURA:
// sessão travada em READ ONLY, sem `BEGIN`, claims no escopo de SESSÃO (`false`) — nada persiste.
// O usuário é escolhido DINAMICAMENTE (um ativo por role que NÃO tem a área; nunca id fixo): o
// `exigir_acesso` para antes do corpo, com PERMISSAO_NEGADA (42501). E, de contraprova, um usuário
// que TEM a área passa — sem ela, um erro qualquer (função quebrada) passaria por "negação".
describe.skipIf(!ON || !DB_URL)('contrato RBAC — Gastos de Marketing: usuário sem a área (v6.3.0)', () => {
  const AREA_MKT = 'marketing/gastos'
  type ClienteMkt = { query: (q: string, p?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> }

  async function comClienteMkt<T>(f: (c: ClienteMkt) => Promise<T>): Promise<T> {
    const { createRequire } = await import('node:module')
    const pg = createRequire(process.cwd() + '/')('pg')
    const c = new pg.Client({ connectionString: DB_URL })
    await c.connect()
    // Trava READ ONLY de SESSÃO, por CONEXÃO (sonda-teste-escreve-banco): qualquer escrita aqui,
    // inclusive a que uma função fizesse por dentro, é recusada pelo Postgres.
    await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
    try { return await f(c) } finally { await c.end() }
  }

  type Resultado = { ok: true; valor: unknown } | { ok: false; code?: string; msg: string }
  /** Assume a identidade do usuário na SESSÃO e chama a RPC. Sem transação: erro só falha o statement. */
  async function chamarComo(c: ClienteMkt, uid: string, fn: string, ano: number): Promise<Resultado> {
    await c.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: uid, role: 'authenticated' })])
    try {
      const r = await c.query(`SELECT public.${fn}($1::int) AS r`, [ano])
      return { ok: true, valor: r.rows[0]?.r }
    } catch (e) {
      const err = e as { code?: string; message?: string }
      return { ok: false, code: err.code, msg: String(err.message) }
    }
  }

  it('um usuário ATIVO de cada role SEM a área recebe PERMISSAO_NEGADA (42501) nas 4 RPCs (3 de gastos + proporção)', async () => {
    await comClienteMkt(async c => {
      const r = await c.query(
        `SELECT DISTINCT ON (u.role_id) u.user_id::text AS uid, ro.nome AS role
           FROM app.rbac_usuarios u
           JOIN app.rbac_roles ro ON ro.id = u.role_id
          WHERE u.ativo
            AND NOT EXISTS (SELECT 1 FROM app.rbac_role_permissoes rp WHERE rp.role_id = u.role_id AND rp.area = $1)
          ORDER BY u.role_id, u.user_id`,
        [AREA_MKT],
      )
      expect(r.rows.length, `não há usuário ativo fora de ${AREA_MKT} — a negação ficaria sem prova (o caso REPROVA, não pula)`).toBeGreaterThan(0)

      for (const u of r.rows) {
        for (const { fn } of RPCS_MKT) {
          const quem = `${fn} como «${String(u.role)}»`
          const res = await chamarComo(c, String(u.uid), fn, ANO_FECHADO_MKT)
          expect(res.ok, `${quem}: a RPC DEVOLVEU dado a quem não tem a área`).toBe(false)
          if (res.ok) continue
          expect(res.code, `${quem}: ${res.msg}`).toBe('42501')
          expect(res.msg, quem).toMatch(/PERMISSAO_NEGADA.*marketing\/gastos/)
        }
      }
    })
  }, 30_000)

  it('contraprova: um usuário ATIVO COM a área é atendido pelas 4 RPCs (a negação acima é pela área, não por função quebrada)', async () => {
    await comClienteMkt(async c => {
      const r = await c.query(
        `SELECT u.user_id::text AS uid
           FROM app.rbac_usuarios u
           JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id AND rp.area = $1
          WHERE u.ativo
          ORDER BY u.user_id
          LIMIT 1`,
        [AREA_MKT],
      )
      expect(r.rows.length, `não há usuário ativo com ${AREA_MKT}`).toBeGreaterThan(0)
      const uid = String(r.rows[0].uid)

      const resumo = await chamarComo(c, uid, 'get_marketing_gastos_resumo', ANO_FECHADO_MKT)
      const fornecedores = await chamarComo(c, uid, 'get_marketing_gastos_fornecedores', ANO_FECHADO_MKT)
      const lancamentos = await chamarComo(c, uid, 'get_marketing_gastos_lancamentos', ANO_FECHADO_MKT)
      const proporcao = await chamarComo(c, uid, 'get_marketing_proporcao_receita', ANO_FECHADO_MKT)
      for (const [nome, res] of [['resumo', resumo], ['fornecedores', fornecedores], ['lancamentos', lancamentos], ['proporção', proporcao]] as const) {
        expect(res.ok, `${nome}: ${res.ok ? '' : res.msg}`).toBe(true)
      }
      if (proporcao.ok) exigirParseMkt(proporcaoReceitaMarketingSchema, proporcao.valor, 'proporção (como usuário com a área)')
      if (resumo.ok) exigirParseMkt(resumoMarketingSchema, resumo.valor, 'resumo (como usuário com a área)')
      if (fornecedores.ok) exigirParseMkt(fornecedoresMarketingSchema, fornecedores.valor, 'fornecedores (como usuário com a área)')
      if (lancamentos.ok) exigirParseMkt(lancamentosMarketingSchema, lancamentos.valor, 'lancamentos (como usuário com a área)')
    })
  }, 30_000)
})
