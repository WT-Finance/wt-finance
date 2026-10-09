// Indicadores da página "Despesas de Marketing" (v6.3.0) — módulo PURO.
//
// ── CONVENÇÃO DO Δ% (decisão desta versão, a validar visualmente pelo Yan) ───────────────
// O Δ% é o MESMO da DRE: `deltaYtd(anoAnterior, atual)` sobre valores COM SINAL, denominador em
// módulo. Como o gasto é negativo, gasto MAIOR que o do ano anterior dá Δ NEGATIVO:
//
//     anterior −100 k → atual −120 k:  (−120 + 100) / |−100| = −20%   → desfavorável
//     anterior −100 k → atual  −80 k:  (−80  + 100) / |−100| = +20%   → favorável
//
// Assim a regra de cor da plataforma (positivo = favorável/verde, negativo = desfavorável/vermelho)
// vale SEM inverter nada, e o número é idêntico ao Δ que a DRE mostra para a linha Marketing nos
// mesmos dois períodos (dois números vizinhos concordam). O custo é de leitura — "−20%" numa
// página de gasto pode soar como "gastou 20% a menos" —, por isso a UI escreve a palavra
// ("desfavorável"/"favorável") ao lado do número e explica a convenção no "?". Não depende só de cor.
//
// ── ANO ANTERIOR SEM HISTÓRICO ≠ ZERO ────────────────────────────────────────────────────
// A base começa em 2024. Ver 2024 compara com 2023, que NÃO tem dado: a RPC devolve um resumo
// vazio, e somar um resumo vazio dá R$ 0,00 — número inventado ("gastamos zero em 2023"). Por
// isso o ano anterior só é "disponível" quando consta em `anosDisponiveis` (anos com lançamento na
// base). Indisponível → `anoAnterior`/`deltaPct` ficam `null` (a UI mostra "—") e a série omite a
// referência. Ano anterior DISPONÍVEL com um mês sem gasto é zero real e entra como zero.
//
// `KpiCard` não é usado: exige `KpiMetrica`/`PeriodoRef` do domínio de Performance e a seta ↓/↑
// dele reforçaria justamente a leitura errada.

import { deltaYtd } from '@/lib/dre/colunas-tabela'
import { totalDoMes, totalNoRecorte } from './agregacao'
import { anoDaData, mesDaData, type Recorte } from './periodo'
import type { LinhaMesCategoria } from './tipos'

/** O ano anterior tem histórico na base? (`anosDisponiveis` = anos com algum lançamento.) */
export function anoAnteriorDisponivel(ano: number, anosDisponiveis: readonly number[]): boolean {
  return anosDisponiveis.includes(ano - 1)
}

/** O cubo do ano anterior que os cards podem USAR: `null` quando ele não tem histórico na base
 *  (o resumo vazio da RPC não é "zero gasto") ou quando a leitura falhou. Um ano anterior
 *  disponível com meses sem lançamento devolve o cubo — e mês sem gasto é zero real. */
function cuboAnteriorUsavel(
  ano: number,
  anosDisponiveis: readonly number[],
  anterior: readonly LinhaMesCategoria[] | null,
): readonly LinhaMesCategoria[] | null {
  return anoAnteriorDisponivel(ano, anosDisponiveis) ? anterior : null
}

export type SentidoDelta = 'favoravel' | 'desfavoravel' | 'neutro'

/** |Δ| abaixo disto lê como "estável" (o mesmo limiar do `KpiCard`). */
const LIMIAR_NEUTRO_PCT = 0.5

/** Sentido do Δ (já no sinal da DRE). `null` quando não há Δ (travessão). */
export function sentidoDoDelta(delta: number | null): SentidoDelta | null {
  if (delta === null) return null
  if (Math.abs(delta) < LIMIAR_NEUTRO_PCT) return 'neutro'
  return delta > 0 ? 'favoravel' : 'desfavoravel'
}

export interface Indicadores {
  /** Despesa no recorte do ano selecionado. */
  periodo: { valor: number; qtd: number }
  /** Mesmo recorte no ano anterior; `null` = o ano anterior não tem histórico na base
   *  (`anteriorSemHistorico`) ou o resumo dele não carregou. */
  anoAnterior: { valor: number; qtd: number } | null
  /** O ano anterior não consta em `anosDisponiveis`: ausência de dado, não zero. */
  anteriorSemHistorico: boolean
  /** Δ% sobre o ano anterior (convenção acima); `null` = travessão (sem base ou base ≈ 0). */
  deltaPct: number | null
  sentido: SentidoDelta | null
  /** Mês de referência = a ponta final do recorte. É o mês corrente quando o recorte termina nele. */
  mesRef: { mes: number; valor: number; qtd: number; corrente: boolean }
}

/**
 * @param atual     cubo mês × categoria do ano selecionado
 * @param anterior  cubo do ano anterior (`null` se a leitura falhou)
 * @param anosDisponiveis  anos com lançamento na base — o ano anterior fora dela é "sem histórico"
 * @param hoje      'YYYY-MM-DD' (servidor) — define o mês corrente
 */
export function calcularIndicadores(args: {
  ano: number
  hoje: string
  recorte: Recorte
  atual: readonly LinhaMesCategoria[]
  anterior: readonly LinhaMesCategoria[] | null
  anosDisponiveis: readonly number[]
}): Indicadores {
  const { ano, hoje, recorte, atual, anterior, anosDisponiveis } = args
  const periodo = totalNoRecorte(atual, recorte)
  const anteriorSemHistorico = !anoAnteriorDisponivel(ano, anosDisponiveis)
  const usavel = cuboAnteriorUsavel(ano, anosDisponiveis, anterior)
  const anoAnterior = usavel ? totalNoRecorte(usavel, recorte) : null
  const deltaPct = anoAnterior ? deltaYtd(anoAnterior.valor, periodo.valor) : null
  const mes = recorte.mesFim
  const doMes = totalDoMes(atual, mes)
  return {
    periodo,
    anoAnterior,
    anteriorSemHistorico,
    deltaPct,
    sentido: sentidoDoDelta(deltaPct),
    mesRef: {
      mes,
      valor: doMes.valor,
      qtd: doMes.qtd,
      corrente: ano === anoDaData(hoje) && mes === mesDaData(hoje),
    },
  }
}
