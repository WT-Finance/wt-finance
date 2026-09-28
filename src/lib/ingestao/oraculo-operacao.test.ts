import { describe, it, expect } from 'vitest'
import {
  parseLancamentosOperacaoRows, indiceDeVencimentos, statusDoLancamento, operacoesDeVendas,
} from './parsers/lancamentos-operacao'
import { parseLancamentosCategoriaRows } from './parsers/lancamentos-categoria'
import { parseVendasProdutoRows } from './parsers/vendas-produto'
import {
  lerMatrizXlsx, lerMatrizCsv, porCabecalho, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES,
} from './fixtures-oraculo'
import { toCentavos } from '@/lib/carga/coercao'
import type { Matriz } from './parsers/comum'

// ── GATE 1 · Oráculo de Lançamentos por Operação ─────────────────────────────────────────────
//
// Esta base não tem oráculo de PARIDADE como as outras quatro, e o motivo é de desenho: o
// `Vencimento` do tratado veio de oito planilhas anuais de contas a pagar/receber que a v6
// aposenta, e o da v6 vem das bases vizinhas (Aberto → Movimentação). Comparar os dois é
// comparar FONTES, e é isso que este teste faz: onde as duas têm vencimento, elas têm de
// concordar. O briefing §9 fixa a régua — `Vencimento` idêntico em ≥ 4.927 de 4.928, e a única
// divergência aceita é o lançamento 203048 (a base Aberto é mais atual que a planilha).
//
// As colunas que vêm do próprio CSV (`Lançamento N°`, `Venda`, `Pessoa`, `Descrição`,
// `Liquidação`, `Valor`, `Operacao`, `Tipo`) e a derivada `Data_Final` são comparadas
// normalmente: ali é porte, e tem de bater.

const CRU = 'operacao-cru.csv'
const TRATADO = 'operacao-tratado.csv'
const LISTA = 'operacao-lista.csv'
const VIZINHAS = ['aberto-cru.xlsx', 'movimentacao-cru.xlsx'] as const
const VENDAS = ['vendas-cru-23.xlsx', 'vendas-cru-24.xlsx', 'vendas-cru-25-26.xlsx'] as const
const AUSENTES = fixturesAusentes([CRU, TRATADO, LISTA, ...VIZINHAS, ...VENDAS])

/** "Hoje" FIXO. `REQUIRE_FIXTURES=1` transforma fixture ausente em falha alta. */
const HOJE = new Date(Date.UTC(2026, 8, 21))
const LINHAS = 41_750
/** O lançamento cuja divergência de vencimento é conhecida e aceita (briefing §9). */
const DIVERGENCIA_CONHECIDA = '203048'

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [d, m, a] = s.split('/'); return `${a}-${m}-${d}` }
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return null
}
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
/** O tratado também é saída do R: `NA` é o ausente dele. O parser grava ausente (`semNaDoR`, 1ª carga
 *  real da M9 — o texto "NA" quebrava o cast para bigint), então a comparação traduz o lado do R. */
function txtR(v: unknown): string | null {
  const s = txt(v)
  return s === 'NA' ? null : s
}

it('as fixtures do oráculo estão presentes (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Lançamentos por Operação', () => {
  const aberto = parseLancamentosCategoriaRows(lerMatrizXlsx('aberto-cru.xlsx'), { hoje: HOJE })
  const movimentacao = parseLancamentosCategoriaRows(lerMatrizXlsx('movimentacao-cru.xlsx'), { hoje: HOJE })
  if (!aberto.ok || !movimentacao.ok) throw new Error('as bases vizinhas não parsearam')

  const indice = indiceDeVencimentos(aberto.linhas, movimentacao.linhas)
  const resultado = parseLancamentosOperacaoRows(lerMatrizCsv(CRU), indice, { hoje: HOJE })
  const tratado = porCabecalho(lerMatrizCsv(TRATADO))

  it('o parse do CSV fecha e tem a contagem do anexo', () => {
    if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
    expect(resultado.linhas).toHaveLength(LINHAS)
    expect(tratado).toHaveLength(LINHAS)
    expect(resultado.diagnostico.linhasIgnoradas).toBe(0)
  })

  it('as colunas que vêm do CSV batem célula a célula com o tratado', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const divergencias: { coluna: string; linha: number; meu: unknown; dele: unknown }[] = []
    let celulas = 0

    resultado.linhas.forEach((meu, i) => {
      const dele = tratado[i]
      const pares: [string, unknown, unknown][] = [
        ['Lançamento N°', meu.lancamento_numero, txtR(dele['Lançamento.N.'])],
        ['Venda',         meu.venda_numero,      txtR(dele['Venda'])],
        ['Pessoa',        meu.pessoa,            txt(dele['Pessoa'])],
        ['Descrição',     meu.descricao,         txt(dele['Descrição'])],
        ['Liquidação',    meu.liquidacao,        iso(dele['Liquidação'])],
        ['Valor',         toCentavos(meu.valor), toCentavos(dele['Valor'])],
        ['Operacao',      meu.operacao,          txt(dele['Operacao'])],
        ['Tipo',          meu.tipo,              txt(dele['Tipo'])],
      ]
      for (const [coluna, m, d] of pares) {
        celulas++
        if (m !== d) divergencias.push({ coluna, linha: i + 1, meu: m, dele: d })
      }
    })

    expect(divergencias.slice(0, 20), `${divergencias.length} divergência(s) de ${celulas} células`)
      .toEqual([])
  })

  it('ACORDO ENTRE FONTES: o vencimento das bases vizinhas bate com o das planilhas anuais', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    let comparados = 0
    const divergentes: { lancamento: string | null; meu: string | null; dele: string | null }[] = []

    resultado.linhas.forEach((meu, i) => {
      const dele = iso(tratado[i]['Vencimento'])
      if (meu.vencimento === null || dele === null) return
      comparados++
      if (meu.vencimento !== dele) {
        divergentes.push({ lancamento: meu.lancamento_numero, meu: meu.vencimento, dele })
      }
    })

    // Régua do briefing §9: ≥ 4.927 de 4.928, e a divergência é o 203048.
    expect(comparados).toBeGreaterThanOrEqual(4_928)
    expect(divergentes.map((d) => d.lancamento)).toEqual([DIVERGENCIA_CONHECIDA])
    expect(comparados - divergentes.length).toBeGreaterThanOrEqual(4_927)
  })

  it('o cruzamento do contrato §4: todo Número sem liquidação existe nas bases vizinhas', () => {
    if (!resultado.ok || resultado.cruzamento === undefined) throw new Error('sem cruzamento')
    const { semLiquidacao, encontrados, ausentes, linhasSemLiquidacao } = resultado.cruzamento
    // 4.005 NÚMEROS distintos em 5.019 linhas — o mesmo lançamento aparece em mais de uma
    // operação (o briefing §2.2 registra 571 lançamentos em duas operações). O briefing falava
    // em 4.008 números; a diferença está em linhas sem `Número`, que não entram no cruzamento
    // porque não há o que cruzar. Até a M9 eram 4.006: o texto "NA" do R contava como um número
    // (e era o único "ausente" do aviso) — é ausente, e sai (`semNaDoR`).
    expect(semLiquidacao).toBe(4_005)
    expect(linhasSemLiquidacao).toBe(5_019)

    // A régua do contrato §4 é 4.005 encontrados com baseline de 3 ausentes. O cruzamento novo
    // (Aberto ∪ Movimentação, que substitui as oito planilhas anuais) acerta os 4.005 e não deixa
    // NENHUM de fora — o único "ausente" que existia era o texto "NA" do R.
    expect(encontrados).toBe(4_005)
    expect(ausentes.length).toBe(semLiquidacao - encontrados)
    expect(ausentes.length).toBeLessThanOrEqual(3)
  })

  it('`Data_Final` é coalesce(Liquidação, Vencimento) e bate com o tratado onde as fontes concordam', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    for (const l of resultado.linhas) {
      expect(l.data_final).toBe(l.liquidacao ?? l.vencimento)
    }
    // A `Data_Final` NÃO herda a divergência de vencimento do 203048: aquela linha tem
    // liquidação, e liquidação tem precedência no coalesce. Zero divergências aqui.
    const divergentes = resultado.linhas.filter((meu, i) => {
      const dele = iso(tratado[i]['Data_Final'])
      return meu.data_final !== null && dele !== null && meu.data_final !== dele
    })
    expect(divergentes.map((d) => d.lancamento_numero)).toEqual([])
  })

  it('a lista de operações derivada de Vendas cobre a lista curada à mão', () => {
    const vendas = parseVendasProdutoRows(
      VENDAS.map((nome) => ({ nome, rows: lerMatrizXlsx(nome) })), { hoje: HOJE })
    if (!vendas.ok) throw new Error(vendas.mensagem)
    const derivada = new Set(operacoesDeVendas(vendas.linhas))

    const curada = lerMatrizCsv(LISTA).slice(1)
      .map((l) => String(l[0] ?? '').replace(/ /g, ' ').trim().replace(/\s+/g, ' '))
      .filter((s) => s !== '')

    // A lista manual tinha 242 nomes; a derivada não pode PERDER nenhum deles.
    expect(curada.length).toBe(242)
    const perdidos = curada.filter((n) => !derivada.has(n))
    expect(perdidos, `operações da lista curada que a derivação não achou: ${perdidos.join(' | ')}`)
      .toEqual([])
    // E acha pelo menos uma a mais — a que o espaço duplo deixava de fora.
    expect(derivada.size).toBeGreaterThanOrEqual(curada.length)
  })
})

// ── Sondas ───────────────────────────────────────────────────────────────────────────────────

describe('sondas do parser de Operação (mutante ⇒ reprova)', () => {
  const vizinhas = [
    { numero: '100', vencimento: '2026-03-10' },
    { numero: '  ', vencimento: '2026-12-31' },   // Número vazio: NUNCA entra no índice
  ] as unknown as Parameters<typeof indiceDeVencimentos>[0]

  it('`Número` vazio não entra no índice — nada herda vencimento por casamento de nulo', () => {
    const indice = indiceDeVencimentos(vizinhas, [])
    expect(indice.get('100')).toBe('2026-03-10')
    expect(indice.size).toBe(1)
    // A linha sem número fica sem vencimento, em vez de herdar o da linha sem número da outra base.
    const r = parseLancamentosOperacaoRows(csvMinimo({ numero: '' }) as Matriz, indice, { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas[0].vencimento).toBeNull()
  })

  it('Aberto tem PRECEDÊNCIA sobre Movimentação no índice de vencimentos', () => {
    const aberto = [{ numero: '100', vencimento: '2026-01-01' }] as unknown as Parameters<typeof indiceDeVencimentos>[0]
    const mov = [{ numero: '100', vencimento: '2025-05-05' }] as unknown as Parameters<typeof indiceDeVencimentos>[1]
    expect(indiceDeVencimentos(aberto, mov).get('100')).toBe('2026-01-01')
  })

  it('valor BR do scrape é lido pela coerção canônica, com vírgula decimal preservada', () => {
    const r = parseLancamentosOperacaoRows(csvMinimo({ valor: 'R$ 1.234,56' }) as Matriz, new Map(), { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    // Se o CSV fosse lido com o heurístico americano do SheetJS, "1.234,56" viraria 1,23456.
    expect(r.linhas[0].valor).toBe(1234.56)
  })

  it('o nome da operação tem espaço interno COLAPSADO (o caso do espaço duplo)', () => {
    const r = parseLancamentosOperacaoRows(
      csvMinimo({ operacao: 'W - Camila e Bruno -  02SET23' }) as Matriz, new Map(), { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas[0].operacao).toBe('W - Camila e Bruno - 02SET23')
  })

  it('linha "Nada para mostrar" (operação sem lançamento) sai com os campos tipados NULOS', () => {
    // Lógica nova e central ao desenho desta base: são as 5 linhas que explicam a diferença entre
    // as 41.750 do CSV e as 41.745 de `fato_lancamento_operacao`. Sem esta sonda a única prova
    // ficaria no oráculo, que se auto-pula quando as fixtures não estão em disco.
    const m = csvMinimo({})
    for (let j = 0; j < 6; j++) m[1][j] = 'Nada para mostrar'
    const r = parseLancamentosOperacaoRows(m as Matriz, new Map([['100', '2026-03-10']]), { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas).toHaveLength(1)          // a linha PERMANECE: o raw espelha o CSV
    expect(r.linhas[0].valor).toBeNull()
    expect(r.linhas[0].liquidacao).toBeNull()
    expect(r.linhas[0].vencimento).toBeNull() // não cruza, mesmo com o número no índice
    expect(r.linhas[0].data_final).toBeNull()
    expect(r.datasRejeitadas).toHaveLength(0) // não polui o contador de data com texto do scrape
    expect(r.diagnostico.linhasSemLancamento).toBe(1)
    expect(r.cruzamento?.semLiquidacao).toBe(0) // não entra na população do cruzamento
  })

  it('CONTROLE: qualquer OUTRO texto no lugar do valor derruba a carga', () => {
    // A guarda do placeholder é por nome justamente para continuar afiada aqui: se ela virasse
    // "texto no lugar de número vira null", um export corrompido passaria calado.
    const m = csvMinimo({ valor: 'R$ dezoito' })
    const r = parseLancamentosOperacaoRows(m as Matriz, new Map(), { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('valor ilegível')
  })

  it('"NA" do R em Lançamento N°, Venda e Liquidação é AUSENTE — não vira número, nem data rejeitada', () => {
    // 1ª carga real (M9): o texto "NA" guardado em lancamento_numero quebrou a promoção no cast
    // para bigint, e o "NA" de Liquidação era contado como data fora da faixa.
    const m = csvMinimo({ numero: 'NA' })
    m[1][1] = 'NA'   // Venda
    m[1][4] = ' NA ' // Liquidação (com espaço: aparado antes de comparar)
    const r = parseLancamentosOperacaoRows(m as Matriz, new Map([['NA', '2026-03-10']]), { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas[0].lancamento_numero).toBeNull()
    expect(r.linhas[0].venda_numero).toBeNull()
    expect(r.linhas[0].liquidacao).toBeNull()
    expect(r.linhas[0].vencimento).toBeNull() // "NA" no índice NÃO casa — sem número, sem cruzamento
    expect(r.datasRejeitadas).toHaveLength(0)
    expect(r.cruzamento?.semLiquidacao).toBe(0)
  })

  it('CONTROLE: "NA" no VALOR continua derrubando a carga', () => {
    const r = parseLancamentosOperacaoRows(csvMinimo({ valor: 'NA' }) as Matriz, new Map(), { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('mutante: coluna obrigatória ausente ⇒ ESTRUTURA_INESPERADA', () => {
    const m = csvMinimo({})
    m[0][5] = 'Vlr'
    const r = parseLancamentosOperacaoRows(m as Matriz, new Map(), { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('`Status` é calculado na leitura, e ausência de Data_Final NÃO vira "realizado"', () => {
    expect(statusDoLancamento('Entrada', '2027-01-01', '2026-09-21')).toBe('A Receber Futuro')
    expect(statusDoLancamento('Saída', '2027-01-01', '2026-09-21')).toBe('A Pagar Futuro')
    expect(statusDoLancamento('Entrada', '2026-01-01', '2026-09-21')).toBe('Entrada')
    // O legado caía no ramo final do case_when e devolvia "Entrada" aqui — cara de realizado.
    expect(statusDoLancamento('Entrada', null, '2026-09-21')).toBeNull()
  })

  it('a lista de operações sai só de "Contrato de casamento", com espaço colapsado', () => {
    const vendas = [
      { produto: 'Contrato de casamento', operacao_propria: 'W - Camila e Bruno -  02SET23' },
      { produto: 'Contrato de casamento', operacao_propria: 'W - Camila e Bruno - 02SET23' },
      { produto: 'Diárias de Hospedagem', operacao_propria: 'W - Outra - 01JAN26' },
      { produto: 'Contrato de casamento', operacao_propria: null },
    ]
    expect(operacoesDeVendas(vendas)).toEqual(['W - Camila e Bruno - 02SET23'])
  })
})

const HOJE_SONDA = new Date(Date.UTC(2026, 8, 21))

function csvMinimo(over: { numero?: string; valor?: string; operacao?: string }): unknown[][] {
  return [
    ['Lançamento N°', 'Venda', 'Pessoa', 'Descrição', 'Liquidação', 'Valor', 'Operacao', 'Tipo'],
    [over.numero ?? '100', '59180', 'Cliente', 'Pagamento venda', '', over.valor ?? 'R$ 389,16',
      over.operacao ?? 'W - Alguem - 18NOV25', 'Entrada'],
  ]
}
