// Tabela "Por categoria" em colunas por ANO (v6.3.0, 4ª rodada) — módulo PURO.
//
// A tabela mostra, por ano selecionado, o total do ano e (quando o ano é expandido) os meses dele;
// no fim, o "Acumulado" dos anos e a "% do total". ESTE módulo monta a estrutura COMPLETA —
// todos os meses de todos os anos —, sem saber o que está expandido: o componente só decide quais
// colunas desenhar. Assim a completude é provável independentemente do estado de tela:
//
//   Σ meses de um ano  ≡  total do ano        (quando o ano tem lançamento)
//   Σ totais dos anos  ≡  acumulado           (≡ `totalDoPeriodo`, o card "Total de despesas")
//   Σ categorias       ≡  linha de total      (por mês, por ano e no acumulado)
//
// Cada ano é lido por `tabelaPorCategoria` no SEU recorte (ano fechado jan–dez; ano corrente jan até
// o mês corrente — sem colunas de futuro) e as categorias são costuradas entre os anos.
//
// DINHEIRO: somas em centavos via `somar` (agregacao.ts); valores no sinal da DRE (despesa < 0).
//
// AUSÊNCIA × ZERO (a mesma convenção da tabela mensal): `null` = a categoria não teve lançamento
// naquele mês/ano (célula "—"); `0` = houve lançamento e somou zero. Um ano sem NENHUM lançamento
// no recorte tem total `null` ("—"), não zero.

import { pctDoTotal, somar, tabelaPorCategoria, type FatiaAno } from './agregacao'
import { mesesDoRecorte, rotuloAnoNoTotal, rotuloRecorte, recorteParcial } from './periodo'
import type { LinhaMesCategoria } from './tipos'

/** Um ano da tabela: o eixo de meses (já cortado no recorte) e o rodapé do ano. */
export interface ColunaAno {
  ano: number
  /** "2026*" no ano parcial; "2025" no inteiro (convenção da página). */
  rotulo: string
  /** "jan–out" quando o ano é parcial; `null` num ano inteiro. */
  recorte: string | null
  /** Os meses do ano no recorte — jan–dez num ano fechado, só até o mês atual no corrente. */
  meses: number[]
  /** Total de marketing por mês (alinhado a `meses`); `null` = mês sem lançamento algum. */
  totalPorMes: (number | null)[]
  /** Total do ano no recorte; `null` = ano sem lançamento algum. */
  total: number | null
  qtd: number
}

/** O que uma categoria fez num ano. */
interface CelulaAno {
  /** Alinhado a `ColunaAno.meses`; `null` = sem lançamento da categoria naquele mês. */
  porMes: (number | null)[]
  /** Total da categoria no ano; `null` = a categoria não aparece nesse ano. */
  total: number | null
}

interface LinhaCategoriaAno {
  categoria: string
  /** Alinhado a `TabelaPorAno.anos`. */
  anos: CelulaAno[]
  /** Σ dos totais dos anos em que a categoria aparece. */
  acumulado: number
  qtd: number
  /** Participação no acumulado (denominador único); `null` se o acumulado total é zero contábil. */
  pct: number | null
}

export interface TabelaPorAno {
  /** Do ano mais antigo ao mais recente — a ordem do gráfico mensal. */
  anos: ColunaAno[]
  /** Ordenadas pelo acumulado (a mais negativa primeiro), desempate por nome. */
  linhas: LinhaCategoriaAno[]
  /** Σ dos anos, cada um no seu recorte — o mesmo número de `totalDoPeriodo`. */
  acumulado: number
  qtd: number
}

export function tabelaCategoriasPorAno(fatias: readonly FatiaAno<LinhaMesCategoria>[]): TabelaPorAno {
  const ordenadas = [...fatias].sort((a, b) => a.ano - b.ano)
  const porAno = ordenadas.map(f => ({ fatia: f, tabela: tabelaPorCategoria(f.linhas, f.recorte) }))

  const anos: ColunaAno[] = porAno.map(({ fatia, tabela }) => ({
    ano: fatia.ano,
    rotulo: rotuloAnoNoTotal(fatia.ano, fatia.recorte),
    recorte: recorteParcial(fatia.recorte) ? rotuloRecorte(fatia.recorte) : null,
    meses: mesesDoRecorte(fatia.recorte),
    totalPorMes: tabela.totalPorMes,
    total: tabela.qtd === 0 ? null : tabela.total,
    qtd: tabela.qtd,
  }))

  const categorias = new Set<string>()
  for (const { tabela } of porAno) for (const l of tabela.linhas) categorias.add(l.categoria)

  const acumulado = somar(anos.flatMap(a => (a.total === null ? [] : [a.total])))

  const linhas: LinhaCategoriaAno[] = [...categorias].map(categoria => {
    const celulas: CelulaAno[] = porAno.map(({ fatia, tabela }) => {
      const l = tabela.linhas.find(x => x.categoria === categoria)
      return l
        ? { porMes: l.porMes, total: l.total }
        : { porMes: mesesDoRecorte(fatia.recorte).map(() => null), total: null }
    })
    const acum = somar(celulas.flatMap(c => (c.total === null ? [] : [c.total])))
    const qtd = porAno.reduce((s, { tabela }) => s + (tabela.linhas.find(x => x.categoria === categoria)?.qtd ?? 0), 0)
    return { categoria, anos: celulas, acumulado: acum, qtd, pct: pctDoTotal(acum, acumulado) }
  }).sort((a, b) => a.acumulado - b.acumulado || a.categoria.localeCompare(b.categoria, 'pt-BR'))

  return { anos, linhas, acumulado, qtd: anos.reduce((s, a) => s + a.qtd, 0) }
}

// ── Expansão por ano (estado local da tela) ─────────────────────────────────────────────────────

/** Mantém só os anos abertos que AINDA estão selecionados: ao mudar a seleção, um ano que saiu e
 *  voltou entra recolhido (e anos novos nascem recolhidos por não estarem na lista). */
export function podarAnosAbertos(abertos: readonly number[], anosSelecionados: readonly number[]): number[] {
  return abertos.filter(a => anosSelecionados.includes(a))
}

/** Alterna um ano na lista de abertos. */
export function alternarAnoAberto(abertos: readonly number[], ano: number): number[] {
  return abertos.includes(ano) ? abertos.filter(a => a !== ano) : [...abertos, ano]
}

/** Nº de colunas que um ano ocupa: recolhido = só o total; aberto = os meses + o total. */
export function colunasDoAno(coluna: Pick<ColunaAno, 'meses'>, aberto: boolean): number {
  return aberto ? coluna.meses.length + 1 : 1
}
