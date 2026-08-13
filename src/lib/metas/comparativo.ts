// Módulo PURO de composição de meses do Comparativo de Metas (v5.6.1) — sem I/O,
// sem React, 100% testável. Resolve QUAIS meses entram na comparação (o mês em
// foco vem do preset ou da escolha única do "Personalizado"; o YoY é SEMPRE
// automático: foco + ANOS_YOY anos anteriores) e MONTA o payload de exibição
// (rótulo, previsto, realizado, parcial) a partir de metas e realizado que o
// chamador já carregou — este módulo não busca dado nenhum, só compõe o que chega.
//
// Convenções (espelham ritmo.ts):
//  • "hoje" é SEMPRE parâmetro ISO 'yyyy-MM-dd' — nunca Date.now() aqui dentro.
//  • ordem cronológica ASC — alimenta as barras do gráfico da esquerda p/ direita.
//  • "foco" = o mês mais recente da seleção (alimenta as colunas/KPIs).
//  • "anel" = a meta do PRÓPRIO mês em foco — coincide com o "Previsto" das
//    colunas por construção (ajuste do Yan, 11/08); null se não cadastrada.
//  • "parcial" usa a mesma convenção de carregar-acompanhamento.ts: a janela do
//    mês ainda contém "hoje" (to >= hoje) → mês em curso, não fechado.

import { format, endOfMonth } from 'date-fns'
import { fmtAxisMes } from '@/lib/fmt'
import type { MetaMensal } from './ritmo'

/** Piso da grade de seleção (decisão de produto; o dado existe desde 2023). */
export const ANO_MINIMO_COMPARATIVO = 2024

/** Meta mensal de contratos de casamento ("Meta de Assessorias", Weddings) —
 *  TRAVADA em 14 por decisão do Yan (v5.6.2, "por ora"); trocar é editar esta linha. */
export const META_ASSESSORIAS_MENSAL = 14

/** Comparação: mês em foco + N anos anteriores (mesmo mês, YoY — sempre). */
export const ANOS_YOY = 2

export type PresetComparativo = 'este-mes' | 'ultimo-mes' | 'personalizado'

/** Referência de mês-calendário (mes: 1..12). */
export interface MesRef {
  ano: number
  mes: number
}

export interface ItemMesComparativo {
  mes: MesRef
  /** "jul/26"; ganha o sufixo " (parcial)" quando o mês está em curso. */
  rotulo: string
  /** valor_meta do mês; null = meta não cadastrada. */
  previsto: number | null
  /** faturamento do mês; null = falha/negação fail-safe. */
  realizado: number | null
  /** a janela do mês contém "hoje" (to >= hoje). */
  parcial: boolean
}

export interface ComparativoData {
  /** ordem cronológica ASC — alimenta as barras. */
  meses: ItemMesComparativo[]
  /** o mais recente — alimenta as colunas. */
  foco: ItemMesComparativo
  /** meta do PRÓPRIO mês em foco (≡ foco.previsto); null sem meta cadastrada. */
  anel: { mes: MesRef; rotulo: string; meta: number } | null
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

/** Mês anterior (jan → dez do ano−1). Uso interno de resolverMeses. */
function mesAnterior(m: MesRef): MesRef {
  return m.mes === 1 ? { ano: m.ano - 1, mes: 12 } : { ano: m.ano, mes: m.mes - 1 }
}

/**
 * Rótulo pt-BR minúsculo "mmm/aa" (mesma base do eixo mensal dos gráficos,
 * `fmtAxisMes`), com sufixo " (parcial)" quando o mês está em curso.
 */
export function rotuloMes(m: MesRef, parcial = false): string {
  const base = fmtAxisMes(chaveMes(m))
  return parcial ? `${base} (parcial)` : base
}

/** Expansão YoY: o mês-base + o mesmo mês nos ANOS_YOY anos anteriores, ASC. */
function expandirYoY(base: MesRef): MesRef[] {
  const meses: MesRef[] = []
  for (let i = ANOS_YOY; i >= 0; i--) meses.push({ ano: base.ano - i, mes: base.mes })
  return meses
}

/**
 * Resolve a lista de meses da comparação — o YoY é SEMPRE automático (ajuste do
 * Yan, 11/08: o "Personalizado" escolhe UM mês, que vira o mês em foco; a
 * comparação Ano sobre Ano continua valendo para ele).
 *
 * - 'este-mes': mês de `hoje` como base.
 * - 'ultimo-mes': mês ANTERIOR ao de `hoje` (virada jan→dez do ano−1) como base.
 * - 'personalizado': o mês escolhido como base (defensivo: se chegar mais de um,
 *   vale o mais recente). Lista vazia (ou ausente) cai em 'este-mes' — nunca
 *   retorna vazio.
 */
export function resolverMeses(
  preset: PresetComparativo,
  hoje: string,
  personalizados?: MesRef[],
): MesRef[] {
  if (preset === 'personalizado') {
    const lista = personalizados ?? []
    if (lista.length === 0) return resolverMeses('este-mes', hoje)
    const ordenado = [...lista].sort((a, b) => chaveMes(a).localeCompare(chaveMes(b)))
    return expandirYoY(ordenado[ordenado.length - 1])
  }

  const hojeMes: MesRef = { ano: Number(hoje.slice(0, 4)), mes: Number(hoje.slice(5, 7)) }
  return expandirYoY(preset === 'este-mes' ? hojeMes : mesAnterior(hojeMes))
}

/**
 * Monta o payload de exibição do Comparativo a partir de uma lista de meses já
 * resolvida (`resolverMeses`), das metas do setor (`metasDoSetor`, já filtradas)
 * e do realizado por mês. Puro: nenhuma busca de dado aqui.
 */
export function montarComparativo(input: {
  meses: MesRef[]
  hoje: string
  metas: MetaMensal[]
  realizadoPorMes: ReadonlyMap<string, number | null>
}): ComparativoData {
  const { hoje, metas, realizadoPorMes } = input

  // Defensivo: garante ASC mesmo que o chamador não tenha passado por resolverMeses.
  const mesesOrdenados = [...input.meses].sort((a, b) => chaveMes(a).localeCompare(chaveMes(b)))

  const metaPorChave = new Map(metas.map(m => [chaveMes({ ano: m.ano, mes: m.mes }), m]))

  const itens: ItemMesComparativo[] = mesesOrdenados.map(m => {
    const chave = chaveMes(m)
    const meta = metaPorChave.get(chave)
    const parcial = janelaDoMes(m).to >= hoje
    return {
      mes: m,
      rotulo: rotuloMes(m, parcial),
      previsto: meta?.valorMeta ?? null,
      realizado: realizadoPorMes.get(chave) ?? null,
      parcial,
    }
  })

  // Anel = meta do PRÓPRIO mês em foco — por construção coincide com o "Previsto"
  // das colunas (ajuste do Yan, 11/08; antes era a meta do mês seguinte).
  const foco = itens[itens.length - 1]
  const anel = foco.previsto != null
    ? { mes: foco.mes, rotulo: rotuloMes(foco.mes), meta: foco.previsto }
    : null

  return { meses: itens, foco, anel }
}
