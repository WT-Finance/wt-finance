// Indicadores de antecipação (v6.4.0) — módulo PURO sobre o retorno de `get_geral_antecipacoes`.
//
// Antecipação é FLUXO (uma leitura por ano). O DESCONTO é só contexto aqui: o custo da antecipação
// já conta em "Custos financeiros" (grupo Antecipação), então nenhum card desta seção soma o desconto
// a custo algum — mostrá-lo duas vezes como "custo" seria contar o mesmo real duas vezes.
//
// "Dias desde a última antecipação" e "maior intervalo do ano" são o sinal de pressão de caixa que a
// gerência já acompanhava na planilha: quanto tempo o caixa passou sem precisar antecipar.

import { pctDe } from './numeros'
import type { Antecipacoes } from './schemas'
import { variacao, type Variacao } from './variacao'

const MS_DIA = 86_400_000

/** Dias corridos entre duas datas 'YYYY-MM-DD' (calendário puro, UTC dos dois lados — sem fuso). */
export function diasEntre(deIso: string, ateIso: string): number {
  const [y1, m1, d1] = deIso.slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = ateIso.slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_DIA)
}

/** "hoje" / "1 dia" / "12 dias". */
export function rotuloDias(dias: number): string {
  if (dias === 0) return 'hoje'
  return dias === 1 ? '1 dia' : `${dias} dias`
}

/** Dias sem antecipar até `hoje` (SP, calculado no servidor). A RPC já devolve o número, calculado no
 *  banco com o "hoje" de SP; sem ele, derivado da última data — mesma conta, calendário puro. Data de
 *  hoje anterior à última (relógio) nunca dá negativo. `null` = nunca houve antecipação. */
export function diasSemAntecipar(
  l: Pick<Antecipacoes, 'dias_desde_ultima' | 'ultima_data'>,
  hoje: string,
): number | null {
  if (l.dias_desde_ultima !== null) return Math.max(0, l.dias_desde_ultima)
  if (l.ultima_data === null) return null
  return Math.max(0, diasEntre(l.ultima_data, hoje))
}

/** A pausa em curso já supera a maior pausa do ano? (sinal de que o caixa está aguentando mais do que
 *  em qualquer momento do ano). `false` sem os dois lados. */
export function pausaAtualEhMaior(
  diasDesdeUltima: number | null,
  maiorIntervalo: Antecipacoes['maior_intervalo_ano'],
): boolean {
  return diasDesdeUltima !== null && maiorIntervalo !== null && diasDesdeUltima > maiorIntervalo.dias
}

export interface IndicadoresAnoAntecipacao {
  ano: number
  volume: number
  liquido: number
  /** Só CONTEXTO — o custo conta em Custos financeiros. */
  desconto: number
  /** % do desconto sobre o volume antecipado; `null` sem volume. */
  descontoPct: number | null
  n: number
  maiorIntervalo: Antecipacoes['maior_intervalo_ano']
  porConta: Antecipacoes['por_conta']
  /** Δ do volume contra o mesmo período do ano anterior — sem juízo (mais antecipação não é bom nem ruim). */
  deltaVolume: Variacao
}

export function indicadoresDoAno(l: Antecipacoes): IndicadoresAnoAntecipacao {
  return {
    ano: l.ano,
    volume: l.total.volume,
    liquido: l.total.liquido,
    desconto: l.total.desconto,
    descontoPct: l.total.desconto_pct ?? pctDe(l.total.desconto, l.total.volume),
    n: l.total.n,
    maiorIntervalo: l.maior_intervalo_ano,
    porConta: l.por_conta,
    deltaVolume: variacao(l.ano_anterior_ytd?.volume, l.total.volume, 'sem-juizo'),
  }
}

/** Todas as contas que aparecem em algum dos anos, em ordem alfabética estável. */
export function contasDosAnos(leituras: readonly Pick<Antecipacoes, 'por_conta'>[]): string[] {
  return [...new Set(leituras.flatMap(l => l.por_conta.map(c => c.conta)))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
