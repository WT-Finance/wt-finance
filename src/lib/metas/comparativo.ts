// Módulo PURO de composição de períodos do Comparativo de Metas (v5.6.1; períodos
// contíguos na v5.6.4) — sem I/O, sem React, 100% testável. Resolve QUAIS períodos
// entram na comparação (o período em foco vem do preset ou do range escolhido no
// "Personalizado"; o YoY é SEMPRE automático: foco + ANOS_YOY anos anteriores) e
// MONTA o payload de exibição (rótulo, previsto, realizado, parcial) a partir de
// metas e realizado que o chamador já carregou — este módulo não busca dado nenhum,
// só compõe o que chega.
//
// A UNIDADE da comparação é o PERÍODO contíguo de meses-calendário (v5.6.4): os
// presets degeneram em período de 1 mês, então todo o comportamento da v5.6.1
// (mês único) é o caso N=1 do mesmo motor — a paridade com os MetaCards continua
// coberta pelo caso de contrato em rpc-contrato.test.ts.
//
// Convenções (espelham ritmo.ts):
//  • "hoje" é SEMPRE parâmetro ISO 'yyyy-MM-dd' — nunca Date.now() aqui dentro.
//  • ordem cronológica ASC — alimenta as barras do gráfico da esquerda p/ direita.
//  • "foco" = o período mais recente da seleção (alimenta as colunas/KPIs).
//  • "anel" = a meta do PRÓPRIO período em foco — coincide com o "Previsto" das
//    colunas por construção (ajuste do Yan, 11/08); null se nenhuma cadastrada.
//  • "parcial" usa a mesma convenção de carregar-acompanhamento.ts: a janela do
//    período ainda contém "hoje" (to >= hoje) → período em curso, não fechado.

import { format, endOfMonth } from 'date-fns'
import { fmtAxisMes } from '@/lib/fmt'
import type { MetaMensal } from './ritmo'

/** Piso da grade de seleção (decisão de produto; o dado existe desde 2023). */
export const ANO_MINIMO_COMPARATIVO = 2024

/** Meta mensal de contratos de casamento ("Meta de Assessorias", Weddings) —
 *  TRAVADA em 14 por decisão do Yan (v5.6.2, "por ora"); trocar é editar esta linha.
 *  Num período de N meses a meta exibida é proporcional: 14 × N (v5.6.4). */
export const META_ASSESSORIAS_MENSAL = 14

/** Comparação: período em foco + N anos anteriores (mesmo range, YoY — sempre). */
export const ANOS_YOY = 2

/** Teto do range do "Personalizado" (default derivado do briefing da v5.6.1). */
export const TETO_MESES_PERSONALIZADO = 12

export type PresetComparativo = 'este-mes' | 'ultimo-mes' | 'personalizado'

/** Referência de mês-calendário (mes: 1..12). */
export interface MesRef {
  ano: number
  mes: number
}

/** Período CONTÍGUO de meses-calendário, inclusivo nas duas pontas, `inicio` ≤ `fim`. */
export interface PeriodoRef {
  inicio: MesRef
  fim: MesRef
}

export interface ItemPeriodoComparativo {
  periodo: PeriodoRef
  /** "jul/26" ou "jan–abr/26"; ganha " (parcial)" quando o período está em curso. */
  rotulo: string
  /** soma das metas cadastradas dos meses do período; null = nenhuma cadastrada. */
  previsto: number | null
  /** faturamento do período; null = falha/negação fail-safe. */
  realizado: number | null
  /** a janela do período contém "hoje" (to >= hoje). */
  parcial: boolean
}

export interface ComparativoData {
  /** ordem cronológica ASC — alimenta as barras. */
  periodos: ItemPeriodoComparativo[]
  /** o mais recente — alimenta as colunas. */
  foco: ItemPeriodoComparativo
  /** meta do PRÓPRIO período em foco (≡ foco.previsto); null sem meta cadastrada. */
  anel: { periodo: PeriodoRef; rotulo: string; meta: number } | null
}

const NOMES_MES_EXTENSO = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** Nome do mês por extenso, capitalizado e SEM ano ("Maio") — títulos de card (ajuste 11/08). */
export function nomeMes(m: MesRef): string {
  return NOMES_MES_EXTENSO[m.mes - 1]
}

/** Chave estável 'yyyy-MM' (zero-padded) — usada para dedup/lookup/ordenação. */
export function chaveMes(m: MesRef): string {
  return `${m.ano}-${String(m.mes).padStart(2, '0')}`
}

/** Janela [primeiro dia, último dia] do mês, em ISO 'yyyy-MM-dd'. */
export function janelaDoMes(m: MesRef): { from: string; to: string } {
  const inicio = new Date(m.ano, m.mes - 1, 1)
  const fim = endOfMonth(inicio)
  return { from: format(inicio, 'yyyy-MM-dd'), to: format(fim, 'yyyy-MM-dd') }
}

/** Mês seguinte (dez → jan do ano+1). */
export function mesSeguinte(m: MesRef): MesRef {
  return m.mes === 12 ? { ano: m.ano + 1, mes: 1 } : { ano: m.ano, mes: m.mes + 1 }
}

/** Mês anterior (jan → dez do ano−1). Uso interno de resolverPeriodos. */
function mesAnterior(m: MesRef): MesRef {
  return m.mes === 1 ? { ano: m.ano - 1, mes: 12 } : { ano: m.ano, mes: m.mes - 1 }
}

/** Índice absoluto do mês na linha do tempo (aritmética de range/contiguidade). */
function indiceMes(m: MesRef): number {
  return m.ano * 12 + (m.mes - 1)
}

/**
 * Rótulo pt-BR minúsculo "mmm/aa" (mesma base do eixo mensal dos gráficos,
 * `fmtAxisMes`), com sufixo " (parcial)" quando o mês está em curso.
 */
export function rotuloMes(m: MesRef, parcial = false): string {
  const base = fmtAxisMes(chaveMes(m))
  return parcial ? `${base} (parcial)` : base
}

// ---------------------------------------------------------------------------
// Período contíguo (v5.6.4)
// ---------------------------------------------------------------------------

/** Período degenerado de 1 mês (o caso dos presets e da seleção antiga). */
export function periodoDeMes(m: MesRef): PeriodoRef {
  return { inicio: m, fim: m }
}

/** Normaliza duas pontas em período ASC — a ordem dos cliques é indiferente. */
export function normalizarPeriodo(a: MesRef, b: MesRef): PeriodoRef {
  return indiceMes(a) <= indiceMes(b) ? { inicio: a, fim: b } : { inicio: b, fim: a }
}

/** Quantidade de meses do período (inclusivo nas duas pontas). */
export function qtdMesesPeriodo(p: PeriodoRef): number {
  return indiceMes(p.fim) - indiceMes(p.inicio) + 1
}

/** Expansão do período em meses-calendário, ASC (atravessa virada de ano). */
export function mesesDoPeriodo(p: PeriodoRef): MesRef[] {
  const meses: MesRef[] = []
  for (let m = p.inicio; indiceMes(m) <= indiceMes(p.fim); m = mesSeguinte(m)) meses.push(m)
  return meses
}

/** Chave estável do período ('2026-01..2026-04'; mês único degenera em chaveMes). */
export function chavePeriodo(p: PeriodoRef): string {
  return qtdMesesPeriodo(p) === 1 ? chaveMes(p.inicio) : `${chaveMes(p.inicio)}..${chaveMes(p.fim)}`
}

/** Janela [1º dia do mês inicial, último dia do mês final], em ISO 'yyyy-MM-dd'. */
export function janelaDoPeriodo(p: PeriodoRef): { from: string; to: string } {
  return { from: janelaDoMes(p.inicio).from, to: janelaDoMes(p.fim).to }
}

/**
 * Rótulo do período na mesma base do eixo mensal: mês único = "ago/26"; range no
 * mesmo ano = "jan–abr/26"; range que cruza ano = "nov/25–fev/26". Sufixo
 * " (parcial)" quando o período está em curso.
 */
export function rotuloPeriodo(p: PeriodoRef, parcial = false): string {
  let base: string
  if (qtdMesesPeriodo(p) === 1) {
    base = fmtAxisMes(chaveMes(p.inicio))
  } else if (p.inicio.ano === p.fim.ano) {
    base = `${fmtAxisMes(chaveMes(p.inicio)).split('/')[0]}–${fmtAxisMes(chaveMes(p.fim))}`
  } else {
    base = `${fmtAxisMes(chaveMes(p.inicio))}–${fmtAxisMes(chaveMes(p.fim))}`
  }
  return parcial ? `${base} (parcial)` : base
}

/**
 * Título humano do período para os cards ("Meta de {aqui}"): mês único mantém o
 * extenso da v5.6.1 ("Agosto"); range usa o rótulo compacto ("jan–abr/26").
 */
export function tituloPeriodo(p: PeriodoRef): string {
  return qtdMesesPeriodo(p) === 1 ? nomeMes(p.inicio) : rotuloPeriodo(p)
}

/** Expansão YoY: o período-base + o mesmo range nos ANOS_YOY anos anteriores, ASC. */
function expandirYoY(base: PeriodoRef): PeriodoRef[] {
  const periodos: PeriodoRef[] = []
  for (let i = ANOS_YOY; i >= 0; i--) {
    periodos.push({
      inicio: { ano: base.inicio.ano - i, mes: base.inicio.mes },
      fim:    { ano: base.fim.ano - i,    mes: base.fim.mes },
    })
  }
  return periodos
}

/**
 * Resolve a lista de períodos da comparação — o YoY é SEMPRE automático (ajuste do
 * Yan, 11/08: a comparação Ano sobre Ano vale para o período em foco, seja ele um
 * preset de 1 mês ou o range contíguo do "Personalizado", v5.6.4).
 *
 * - 'este-mes': mês de `hoje` como base.
 * - 'ultimo-mes': mês ANTERIOR ao de `hoje` (virada jan→dez do ano−1) como base.
 * - 'personalizado': o range escolhido como base. Sem range (null/ausente) cai em
 *   'este-mes' — nunca retorna vazio.
 */
export function resolverPeriodos(
  preset: PresetComparativo,
  hoje: string,
  personalizado?: PeriodoRef | null,
): PeriodoRef[] {
  if (preset === 'personalizado') {
    if (!personalizado) return resolverPeriodos('este-mes', hoje)
    return expandirYoY(normalizarPeriodo(personalizado.inicio, personalizado.fim))
  }

  const hojeMes: MesRef = { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }
  return expandirYoY(periodoDeMes(preset === 'este-mes' ? hojeMes : mesAnterior(hojeMes)))
}

/**
 * Monta o payload de exibição do Comparativo a partir de uma lista de períodos já
 * resolvida (`resolverPeriodos`), das metas do setor (`metasDoSetor`, já filtradas)
 * e do realizado por período (chave = `chavePeriodo`). Puro: nenhuma busca de dado.
 *
 * Previsto do período = SOMA das metas cadastradas dos meses que ele cobre; mês sem
 * meta não zera a soma (contribui nada) e período sem NENHUMA meta vira null — a
 * mesma convenção "nulo omite" do mês único (v5.2.1/v5.6.1).
 */
export function montarComparativo(input: {
  periodos: PeriodoRef[]
  hoje: string
  metas: MetaMensal[]
  realizadoPorPeriodo: ReadonlyMap<string, number | null>
}): ComparativoData {
  const { hoje, metas, realizadoPorPeriodo } = input

  // Defensivo: garante ASC mesmo que o chamador não tenha passado por resolverPeriodos.
  const periodosOrdenados = [...input.periodos]
    .sort((a, b) => chaveMes(a.inicio).localeCompare(chaveMes(b.inicio)))

  const metaPorChave = new Map(metas.map(m => [chaveMes({ ano: m.ano, mes: m.mes }), m]))

  const itens: ItemPeriodoComparativo[] = periodosOrdenados.map(p => {
    const cadastradas = mesesDoPeriodo(p)
      .map(m => metaPorChave.get(chaveMes(m))?.valorMeta)
      .filter((v): v is number => v != null)
    const previsto = cadastradas.length > 0 ? cadastradas.reduce((s, v) => s + v, 0) : null
    const parcial = janelaDoPeriodo(p).to >= hoje
    return {
      periodo: p,
      rotulo: rotuloPeriodo(p, parcial),
      previsto,
      realizado: realizadoPorPeriodo.get(chavePeriodo(p)) ?? null,
      parcial,
    }
  })

  // Anel = meta do PRÓPRIO período em foco — por construção coincide com o "Previsto"
  // das colunas (ajuste do Yan, 11/08; antes era a meta do mês seguinte).
  const foco = itens[itens.length - 1]
  const anel = foco.previsto != null
    ? { periodo: foco.periodo, rotulo: rotuloPeriodo(foco.periodo), meta: foco.previsto }
    : null

  return { periodos: itens, foco, anel }
}
