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
  /** % do PERÍODO (em dias corridos) já decorrido até "hoje" — 0..100. Base do
   *  título do tooltip da barra ("N% do período decorrido"). Difere do ritmo/% da meta. */
  pctDecorrido: number
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

/**
 * Janela do período: "hoje", se é parcial, e quanto do tempo já correu.
 * FATORADA de propósito (v5.4.4): `calcularRitmo` (com série diária) e
 * `calcularRitmoAgregado` (sem série) precisam da MESMA régua de tempo, senão o
 * "% esperado" de um subsetor divergiria do "% esperado" do setor na mesma tela.
 * Caso de contrato compara as duas saídas campo a campo.
 */
function janelaDoPeriodo(from: Date, to: Date, ultimaVenda: string | null) {
  const ultima = ultimaVenda ? parseISO(ultimaVenda) : null

  // "hoje" = última venda, sem passar do fim do período (período passado → hoje = to).
  const hoje = ultima ? (isAfter(ultima, to) ? to : ultima) : to
  const parcial = isBefore(hoje, to)

  // % do período decorrido em DIAS (tempo), independente do ritmo de faturamento.
  const diasPeriodo = differenceInCalendarDays(to, from) + 1
  const diasDecorridos = Math.min(Math.max(differenceInCalendarDays(hoje, from) + 1, 0), diasPeriodo)
  const pctDecorrido = diasPeriodo > 0 ? (diasDecorridos / diasPeriodo) * 100 : 0

  return { hoje, parcial, diasPeriodo, pctDecorrido }
}

export function calcularRitmo(input: RitmoInput): RitmoResultado {
  const from = parseISO(input.from)
  const to = parseISO(input.to)

  const { hoje, parcial, diasPeriodo, pctDecorrido } = janelaDoPeriodo(from, to, input.ultimaVenda)

  // metaPeriodo = soma das metas mensais tocadas, com bordas parciais pró-rata (trata
  // período arbitrário). O ESPERADO é LINEAR sobre o período: esperado = meta × fração
  // de tempo decorrida (decisão do produto — "se 30% do período passou, esperava-se 30%
  // da meta"). Assim esperado/meta === pctDecorrido, e a comparação é "X% da meta vs
  // Y% esperado". (Distinto do acúmulo mês-a-mês; ver ADR-0146 emenda.)
  const metaPeriodo = metaAcumulada(input.metas, from, to)
  const esperadoAteHoje = metaPeriodo * (pctDecorrido / 100)
  const realizado = input.serie.reduce((s, p) => s + p.valor, 0)

  const pctMeta = metaPeriodo > 0 ? (realizado / metaPeriodo) * 100 : null
  const ritmoPct = esperadoAteHoje > 0 ? (realizado / esperadoAteHoje) * 100 : null

  const serieMap = new Map(input.serie.map(p => [p.data, p.valor]))
  let realAcum = 0
  const pontos: PontoAcumulado[] = eachDayOfInterval({ start: from, end: to }).map(d => {
    const iso = format(d, 'yyyy-MM-dd')
    const futuro = isAfter(d, hoje)
    if (!futuro) realAcum += serieMap.get(iso) ?? 0
    // meta acumulada LINEAR (rampa reta 0 → metaPeriodo ao longo dos dias do período) —
    // consistente com o esperado; o marcador do "esperado até hoje" cai exatamente sobre ela.
    const fracDia = diasPeriodo > 0 ? (differenceInCalendarDays(d, from) + 1) / diasPeriodo : 0
    return {
      data: iso,
      realAcum: futuro ? null : realAcum,
      metaAcum: metaPeriodo * fracDia,
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
    pctDecorrido,
    pctReceitaAlvo: pctReceitaAlvoPeriodo(input.metas, from, to),
  }
}

// ── Ritmo AGREGADO (v5.4.4) ──────────────────────────────────────────────────
// Mesmas contas, sem série diária. Existe porque o eixo de SUBSETOR de Weddings
// não tem série diária em fonte nenhuma: `metas_ritmo_diario` foi repontada ao
// Monde e a mv só tem `data_venda + setor_macro_id`, enquanto o subsetor (eixo de
// PRODUTO) vive no upload e só sai agregado por período. Isso não impede nada do
// que o card mostra: o ESPERADO é linear no tempo (`metaPeriodo × pctDecorrido`),
// então só a "escadinha" do gráfico dependia da série — e o gráfico não recebe
// subsetor. Toda a régua de tempo vem de `janelaDoPeriodo`, compartilhada com
// `calcularRitmo`, para que os dois "% esperado" da mesma tela não possam divergir.
//
// AGNÓSTICO DE UNIDADE: `valorMeta`/`realizado` podem ser R$ ou CONTAGEM. O card de
// COMERCIAL usa duas chamadas — uma em R$ (que compõe a soma de Weddings) e uma em
// contratos (que governa o topo e a barra). `pctReceitaAlvo` não faz sentido na
// chamada de contagem; o call-site ignora.

/** Igual ao `RitmoResultado`, sem `pontos` — sem série diária não há série acumulada. */
export type RitmoAgregado = Omit<RitmoResultado, 'pontos'>

export interface RitmoAgregadoInput {
  from: string
  to: string
  ultimaVenda: string | null
  metas: MetaMensal[]
  /** Realizado do período, JÁ agregado pela fonte (não há série para somar). */
  realizado: number
}

export function calcularRitmoAgregado(input: RitmoAgregadoInput): RitmoAgregado {
  const from = parseISO(input.from)
  const to = parseISO(input.to)

  const { hoje, parcial, pctDecorrido } = janelaDoPeriodo(from, to, input.ultimaVenda)

  const metaPeriodo = metaAcumulada(input.metas, from, to)
  const esperadoAteHoje = metaPeriodo * (pctDecorrido / 100)
  const { realizado } = input

  const pctMeta = metaPeriodo > 0 ? (realizado / metaPeriodo) * 100 : null
  const ritmoPct = esperadoAteHoje > 0 ? (realizado / esperadoAteHoje) * 100 : null

  return {
    metaPeriodo,
    realizado,
    pctMeta,
    hoje: format(hoje, 'yyyy-MM-dd'),
    esperadoAteHoje,
    ritmoPct,
    status: classificarRitmo(ritmoPct),
    parcial,
    pctDecorrido,
    pctReceitaAlvo: pctReceitaAlvoPeriodo(input.metas, from, to),
  }
}
