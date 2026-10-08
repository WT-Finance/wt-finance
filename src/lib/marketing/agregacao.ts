// Agregações da página "Gastos de Marketing" (v6.3.0) — módulo PURO.
//
// Duas famílias:
//  • CUBOS a partir de lançamentos (`cuboCategorias`, `cuboFornecedores`): o que as RPCs de resumo
//    e de fornecedores fazem em SQL. A página lê os cubos prontos da RPC; aqui eles servem à
//    fixture (`fixture.ts`) e à prova de completude (`completude.test.ts`).
//  • LEITURAS do recorte sobre os cubos (`totalNoRecorte`, `serieMensal`, `tabelaPorCategoria`,
//    `rankingFornecedores`): o que os cards mostram. Valem igual para o cubo da fixture e da RPC.
//
// DINHEIRO: somas em CENTAVOS INTEIROS e divididas por 100 uma vez no fim. Somar ~230 floats em
// ordens diferentes (por categoria, por fornecedor, por mês) divergiria em 1e-10, e a identidade
// "todos os caminhos dão o mesmo total" — a razão de ser da página — perderia o `toBe`.
//
// SINAL: tudo no sinal da DRE (gasto < 0, estorno > 0). Nenhum `Math.abs` sobre valor monetário.
// A única razão aqui (% do total) divide dois valores do MESMO sinal, então é positiva por
// construção — e a conta não depende de inverter nada.

import type { LancamentoMkt, LinhaMesCategoria, LinhaMesFornecedor } from './tipos'
import { anoDaData, mesDaData, mesNoRecorte, mesesDoRecorte, type Recorte } from './periodo'

// ── Dinheiro ────────────────────────────────────────────────────────────────────────────

const centavos = (v: number): number => Math.round(v * 100)

/** Soma exata (em centavos) de valores em reais. */
export function somar(valores: readonly number[]): number {
  return valores.reduce((acc, v) => acc + centavos(v), 0) / 100
}

/** Epsilon do zero contábil — o mesmo de `deltaYtd`/`fmtContabil` (0,005). */
const EPS_ZERO = 0.005

/** % que `parte` representa de `total`. `null` (travessão) quando o total é zero contábil:
 *  razão sobre zero é indefinida, nunca Infinity/NaN na tela. */
export function pctDoTotal(parte: number, total: number): number | null {
  if (Math.abs(total) < EPS_ZERO) return null
  return (parte / total) * 100
}

// ── Fornecedor: chave e rótulo ──────────────────────────────────────────────────────────

/** Chave de agrupamento do fornecedor: aparado; ausente/vazio vira `''`. */
export function chaveFornecedor(f: string | null | undefined): string {
  return (f ?? '').trim()
}

export const ROTULO_SEM_FORNECEDOR = '(sem fornecedor)'

/** Rótulo de exibição — o lançamento sem fornecedor NUNCA some do ranking nem dos filtros. */
export function rotuloFornecedor(chave: string): string {
  return chave === '' ? ROTULO_SEM_FORNECEDOR : chave
}

// ── Cubos a partir de lançamentos (o que o SQL das RPCs faz) ────────────────────────────

/** Lançamentos de um ano → total por mês × categoria. Ordenado por mês, depois categoria. */
export function cuboCategorias(ano: number, lancamentos: readonly LancamentoMkt[]): LinhaMesCategoria[] {
  const acc = new Map<string, { mes: number; categoria: string; centavos: number; qtd: number }>()
  for (const l of lancamentos) {
    if (anoDaData(l.data) !== ano) continue
    const mes = mesDaData(l.data)
    const chave = `${mes}|${l.categoria}`
    const atual = acc.get(chave) ?? { mes, categoria: l.categoria, centavos: 0, qtd: 0 }
    atual.centavos += centavos(l.valor)
    atual.qtd += 1
    acc.set(chave, atual)
  }
  return [...acc.values()]
    .sort((a, b) => a.mes - b.mes || a.categoria.localeCompare(b.categoria, 'pt-BR'))
    .map(x => ({ mes: x.mes, categoria: x.categoria, valor: x.centavos / 100, qtd: x.qtd }))
}

/** Lançamentos de um ano → total por mês × fornecedor (a chave aparada: vazio vira `null`). */
export function cuboFornecedores(ano: number, lancamentos: readonly LancamentoMkt[]): LinhaMesFornecedor[] {
  const acc = new Map<string, { mes: number; chave: string; centavos: number; qtd: number }>()
  for (const l of lancamentos) {
    if (anoDaData(l.data) !== ano) continue
    const mes = mesDaData(l.data)
    const chave = chaveFornecedor(l.fornecedor)
    const k = `${mes}|${chave}`
    const atual = acc.get(k) ?? { mes, chave, centavos: 0, qtd: 0 }
    atual.centavos += centavos(l.valor)
    atual.qtd += 1
    acc.set(k, atual)
  }
  return [...acc.values()]
    .sort((a, b) => a.mes - b.mes || a.chave.localeCompare(b.chave, 'pt-BR'))
    .map(x => ({ mes: x.mes, fornecedor: x.chave === '' ? null : x.chave, valor: x.centavos / 100, qtd: x.qtd }))
}

// ── Leituras do recorte ─────────────────────────────────────────────────────────────────

interface ComMes { mes: number; valor: number; qtd: number }

/** Lançamentos cujo mês cai no recorte (o ano é o do próprio conjunto). */
export function lancamentosDoRecorte(lancamentos: readonly LancamentoMkt[], r: Recorte): LancamentoMkt[] {
  return lancamentos.filter(l => mesNoRecorte(mesDaData(l.data), r))
}

/** Total e nº de lançamentos de um cubo no recorte. */
export function totalNoRecorte(linhas: readonly ComMes[], r: Recorte): { valor: number; qtd: number } {
  const dentro = linhas.filter(l => mesNoRecorte(l.mes, r))
  return { valor: somar(dentro.map(l => l.valor)), qtd: dentro.reduce((a, l) => a + l.qtd, 0) }
}

/** Total de um único mês (zero e 0 lançamentos se o mês não tem linha). */
export function totalDoMes(linhas: readonly ComMes[], mes: number): { valor: number; qtd: number } {
  return totalNoRecorte(linhas, { mesIni: mes, mesFim: mes })
}

export interface PontoMensal {
  mes: number
  /** `null` = mês ainda não alcançado no ano selecionado (ausência ≠ zero). */
  atual: number | null
  /** `null` = ano anterior indisponível (a leitura falhou, ou o ano não tem histórico na base).
   *  Com o ano disponível, mês sem gasto é zero REAL. */
  anterior: number | null
}

/**
 * Série do gráfico: um ponto por mês do recorte, ano selecionado × mesmo mês do ano anterior.
 * `limiteAtual` é o último mês alcançado do ano selecionado (`mesLimite`); depois dele o valor
 * é `null`, não zero. `anterior === null` quando o ano anterior está indisponível (a leitura
 * falhou ou o ano não consta em `anosDisponiveis`): a referência é omitida, nunca zerada.
 */
export function serieMensal(
  atual: readonly ComMes[],
  anterior: readonly ComMes[] | null,
  r: Recorte,
  limiteAtual: number,
): PontoMensal[] {
  return mesesDoRecorte(r).map(mes => ({
    mes,
    atual: mes <= limiteAtual ? totalDoMes(atual, mes).valor : null,
    anterior: anterior ? totalDoMes(anterior, mes).valor : null,
  }))
}

interface LinhaCategoria {
  categoria: string
  /** Alinhado a `meses`; `null` = a categoria não teve lançamento naquele mês (célula "—"). */
  porMes: (number | null)[]
  total: number
  qtd: number
  /** % do total de marketing do recorte (denominador único); `null` se o total é zero. */
  pct: number | null
}

export interface TabelaCategorias {
  meses: number[]
  linhas: LinhaCategoria[]
  /** Total de marketing por mês (alinhado a `meses`); `null` = mês sem lançamento algum. */
  totalPorMes: (number | null)[]
  total: number
  qtd: number
}

/**
 * Tabela categoria × mês do recorte. Linhas ordenadas por gasto (a mais negativa primeiro),
 * desempate por nome. A coluna "% do total" usa UM denominador — o total de marketing do recorte —
 * para todas as linhas; as razões somam 100%.
 */
export function tabelaPorCategoria(linhas: readonly LinhaMesCategoria[], r: Recorte): TabelaCategorias {
  const meses = mesesDoRecorte(r)
  const dentro = linhas.filter(l => mesNoRecorte(l.mes, r))
  const total = somar(dentro.map(l => l.valor))
  const qtdTotal = dentro.reduce((a, l) => a + l.qtd, 0)

  const porCategoria = new Map<string, LinhaMesCategoria[]>()
  for (const l of dentro) {
    const lista = porCategoria.get(l.categoria) ?? []
    lista.push(l)
    porCategoria.set(l.categoria, lista)
  }

  const resultado: LinhaCategoria[] = [...porCategoria.entries()].map(([categoria, ls]) => {
    const totalCat = somar(ls.map(l => l.valor))
    return {
      categoria,
      porMes: meses.map(m => {
        const doMes = ls.filter(l => l.mes === m)
        return doMes.length === 0 ? null : somar(doMes.map(l => l.valor))
      }),
      total: totalCat,
      qtd: ls.reduce((a, l) => a + l.qtd, 0),
      pct: pctDoTotal(totalCat, total),
    }
  }).sort((a, b) => a.total - b.total || a.categoria.localeCompare(b.categoria, 'pt-BR'))

  return {
    meses,
    linhas: resultado,
    totalPorMes: meses.map(m => {
      const doMes = dentro.filter(l => l.mes === m)
      return doMes.length === 0 ? null : somar(doMes.map(l => l.valor))
    }),
    total,
    qtd: qtdTotal,
  }
}

interface LinhaFornecedor {
  /** Chave de agrupamento ('' = sem fornecedor). */
  chave: string
  rotulo: string
  valor: number
  qtd: number
  pct: number | null
}

export interface RankingFornecedores {
  linhas: LinhaFornecedor[]
  total: number
  qtd: number
}

/** Ranking do recorte: a maior despesa (valor mais negativo) primeiro; desempate por nome.
 *  "(sem fornecedor)" entra como qualquer outro — nunca é descartado. */
export function rankingFornecedores(linhas: readonly LinhaMesFornecedor[], r: Recorte): RankingFornecedores {
  const dentro = linhas.filter(l => mesNoRecorte(l.mes, r))
  const total = somar(dentro.map(l => l.valor))
  const porChave = new Map<string, LinhaMesFornecedor[]>()
  for (const l of dentro) {
    const chave = chaveFornecedor(l.fornecedor)
    const lista = porChave.get(chave) ?? []
    lista.push(l)
    porChave.set(chave, lista)
  }
  const resultado: LinhaFornecedor[] = [...porChave.entries()].map(([chave, ls]) => {
    const valor = somar(ls.map(l => l.valor))
    return {
      chave,
      rotulo: rotuloFornecedor(chave),
      valor,
      qtd: ls.reduce((a, l) => a + l.qtd, 0),
      pct: pctDoTotal(valor, total),
    }
  }).sort((a, b) => a.valor - b.valor || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  return { linhas: resultado, total, qtd: dentro.reduce((a, l) => a + l.qtd, 0) }
}
