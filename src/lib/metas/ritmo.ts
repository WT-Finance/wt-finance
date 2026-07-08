// Módulo PURO do ritmo de Metas (v5.0.0) — sem I/O, sem React, 100% testável.
// Cruza o REALIZADO diário (série de mv_vendas_diarias, fonte única) com a META do
// período (soma das metas MENSAIS tocadas, PRÓ-RATA por dias corridos nos meses
// parciais das bordas). Produz: meta do período, % da meta, ritmo (% do esperado
// até hoje) e as séries acumuladas para o gráfico ("escadinha" da meta multi-mês).
//
// Invariantes (do prompt v5.0.0):
//  • "hoje" = data da ÚLTIMA VENDA carregada (não o calendário) — clamp em [., to].
//  • régua com CONSTANTES NOMEADAS (o Yan calibra depois trocando 1 linha).
//  • pró-rata por dias corridos: meta diária de um mês = meta_mensal / dias_do_mês.

import {
  parseISO, format, endOfMonth, getDaysInMonth,
  differenceInCalendarDays, eachDayOfInterval,
  isAfter, isBefore, max as maxDate, min as minDate,
} from 'date-fns'

/** Meta mensal de UM setor (mes: 1..12). */
export interface MetaMensal {
  ano: number
  mes: number
  valorMeta: number
  /** Alvo de % Rec (receita/VT) do mês. null = alvo ainda não cadastrado. */
  pctReceita?: number | null
}

/** Ponto diário de realizado (data ISO 'yyyy-MM-dd', valor = faturamento do dia). */
export interface PontoDia {
  data: string
  valor: number
}

export interface RitmoInput {
  from: string              // ISO 'yyyy-MM-dd' — início do período
  to: string                // ISO 'yyyy-MM-dd' — fim do período
  ultimaVenda: string | null // ISO — data da última venda carregada (global) → "hoje"
  metas: MetaMensal[]       // metas mensais do setor (fonte 'real') que tocam o período
  serie: PontoDia[]         // realizado diário do setor dentro de [from, to]
}

export type RitmoStatus = 'verde' | 'ambar' | 'vermelho'

/** Régua do ritmo — CONSTANTES NOMEADAS (calibragem = trocar estes números). */
export const RITMO_META_ATINGIDA = 100 // ≥ → verde (no ritmo / à frente)
export const RITMO_ATENCAO = 60        // ≥ → âmbar (atenção) ; < → vermelho (abaixo)

export function classificarRitmo(pct: number | null): RitmoStatus | null {
  if (pct === null || !Number.isFinite(pct)) return null
  if (pct >= RITMO_META_ATINGIDA) return 'verde'
  if (pct >= RITMO_ATENCAO) return 'ambar'
  return 'vermelho'
}

export interface PontoAcumulado {
  data: string
  /** realizado acumulado até o dia; null nos dias FUTUROS (> hoje) — a linha para. */
  realAcum: number | null
  /** meta acumulada até o dia (pró-rata) — a "escadinha", desenhada no período todo. */
  metaAcum: number
  futuro: boolean
}

export interface RitmoResultado {
  metaPeriodo: number          // meta pró-rata do período inteiro [from, to]
  realizado: number            // soma do realizado (até onde há venda)
  pctMeta: number | null       // realizado / metaPeriodo * 100 ("% da meta")
  hoje: string                 // ISO — min(ultimaVenda, to)
  esperadoAteHoje: number      // meta pró-rata acumulada até "hoje" (o marcador)
  ritmoPct: number | null      // realizado / esperadoAteHoje * 100 ("ritmo X%")
  status: RitmoStatus | null   // régua aplicada ao ritmo
  parcial: boolean             // "hoje" < to (período ainda em curso)
  pontos: PontoAcumulado[]     // séries acumuladas p/ o gráfico
  /** Alvo de % Rec do período: média dos alvos mensais PONDERADA pela meta VT pró-rata
   *  (só meses com alvo cadastrado). null enquanto nenhum mês do período tiver alvo. */
  pctReceitaAlvo: number | null
}

/**
 * Meta acumulada (pró-rata por dias corridos) de `from` até `ate`, inclusive.
 * Cada mês contribui `valorMeta * (dias no recorte) / (dias do mês)`.
 */
function metaAcumulada(metas: MetaMensal[], from: Date, ate: Date): number {
  if (isBefore(ate, from)) return 0
  let acc = 0
  for (const m of metas) {
    const mStart = new Date(m.ano, m.mes - 1, 1)
    const mEnd = endOfMonth(mStart)
    const oStart = maxDate([from, mStart])
    const oEnd = minDate([ate, mEnd])
    if (!isBefore(oEnd, oStart)) {
      const dias = differenceInCalendarDays(oEnd, oStart) + 1
      const diasNoMes = getDaysInMonth(mStart)
      acc += (m.valorMeta * dias) / diasNoMes
    }
  }
  return acc
}

/**
 * Alvo de % Rec do período: para os meses do período QUE TÊM alvo cadastrado,
 * média dos alvos ponderada pela meta VT pró-rata (Σ VT·pct / Σ VT). Assim um mês
 * grande pesa mais e meses sem alvo não distorcem. null se nenhum mês tem alvo.
 */
function pctReceitaAlvoPeriodo(metas: MetaMensal[], from: Date, to: Date): number | null {
  let vtBase = 0
  let recAlvo = 0
  for (const m of metas) {
    if (m.pctReceita == null) continue
    const mStart = new Date(m.ano, m.mes - 1, 1)
    const mEnd = endOfMonth(mStart)
    const oStart = maxDate([from, mStart])
    const oEnd = minDate([to, mEnd])
    if (!isBefore(oEnd, oStart)) {
      const dias = differenceInCalendarDays(oEnd, oStart) + 1
      const vt = (m.valorMeta * dias) / getDaysInMonth(mStart)
      vtBase += vt
      recAlvo += vt * (m.pctReceita / 100)
    }
  }
  return vtBase > 0 ? (recAlvo / vtBase) * 100 : null
}

export function calcularRitmo(input: RitmoInput): RitmoResultado {
  const from = parseISO(input.from)
  const to = parseISO(input.to)
  const ultima = input.ultimaVenda ? parseISO(input.ultimaVenda) : null

  // "hoje" = última venda, sem passar do fim do período (período passado → hoje = to).
  const hoje = ultima ? (isAfter(ultima, to) ? to : ultima) : to
  const parcial = isBefore(hoje, to)

  const metaPeriodo = metaAcumulada(input.metas, from, to)
  const esperadoAteHoje = metaAcumulada(input.metas, from, hoje)
  const realizado = input.serie.reduce((s, p) => s + p.valor, 0)

  const pctMeta = metaPeriodo > 0 ? (realizado / metaPeriodo) * 100 : null
  const ritmoPct = esperadoAteHoje > 0 ? (realizado / esperadoAteHoje) * 100 : null

  const serieMap = new Map(input.serie.map(p => [p.data, p.valor]))
  let realAcum = 0
  const pontos: PontoAcumulado[] = eachDayOfInterval({ start: from, end: to }).map(d => {
    const iso = format(d, 'yyyy-MM-dd')
    const futuro = isAfter(d, hoje)
    if (!futuro) realAcum += serieMap.get(iso) ?? 0
    return {
      data: iso,
      realAcum: futuro ? null : realAcum,
      metaAcum: metaAcumulada(input.metas, from, d),
      futuro,
    }
  })

  return {
    metaPeriodo,
    realizado,
    pctMeta,
    hoje: format(hoje, 'yyyy-MM-dd'),
    esperadoAteHoje,
    ritmoPct,
    status: classificarRitmo(ritmoPct),
    parcial,
    pontos,
    pctReceitaAlvo: pctReceitaAlvoPeriodo(input.metas, from, to),
  }
}
