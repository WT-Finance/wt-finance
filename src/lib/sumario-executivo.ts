import { fmtMi } from '@/lib/fmt'

export interface DadosSumario {
  periodo: {
    label: string
    eParcial: boolean
    /** Rótulo do dia atual para períodos parciais. Ex: '1' (dia do mês) ou '01/05'. */
    diaLabel?: string
  }
  faturamento: {
    valor: number
    varAnterior: number | null
    varYoY: number | null
  }
  margem: {
    pct: number | null
    alvo: number
  }
  setores: Array<{
    nome: string
    pctFat: number
    margem: number | null
    margemVsAlvo: number | null
  }>
  prejuizos: {
    quantidade: number
    valor: number
  }
  vendasCount: number
}

function fmtPct(v: number): string {
  const s = v >= 0 ? '+' : ''
  return `${s}${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function classificarVariacao(pct: number | null, tipo: string): string | null {
  if (pct == null) return null
  const abs = Math.abs(pct)
  if (abs < 3)         return `em linha com o período ${tipo} (${fmtPct(pct)})`
  if (pct > 0 && abs < 15) return `acima do período ${tipo} (${fmtPct(pct)})`
  if (pct > 0)         return `bem acima do período ${tipo} (${fmtPct(pct)})`
  if (abs < 15)        return `abaixo do período ${tipo} (${fmtPct(pct)})`
  return               `bem abaixo do período ${tipo} (${fmtPct(pct)})`
}

function montarAberturaPeriodo(d: DadosSumario): string {
  if (d.periodo.eParcial && d.periodo.diaLabel) {
    return `**${d.periodo.label}** — análise parcial (até dia ${d.periodo.diaLabel}).`
  }
  return `**${d.periodo.label}** — análise do período completo.`
}

function montarFraseFaturamento(d: DadosSumario): string {
  const valor = fmtMi(d.faturamento.valor)
  const ant   = classificarVariacao(d.faturamento.varAnterior, 'anterior')
  const yoy   = classificarVariacao(d.faturamento.varYoY, 'YoY')

  if (ant && yoy) return `Faturamento de **${valor}**, ${ant} e ${yoy}.`
  if (ant)        return `Faturamento de **${valor}**, ${ant}.`
  return                 `Faturamento de **${valor}**.`
}

function montarFraseMargem(d: DadosSumario): string | null {
  if (d.margem.pct == null) return null
  const m   = d.margem.pct
  const a   = d.margem.alvo
  const dif = m - a
  const fmt = m.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  let qualif: string
  if (Math.abs(dif) < 0.5) qualif = `em linha com o alvo de ${a}%`
  else if (dif > 0)        qualif = `acima do alvo de ${a}%`
  else                     qualif = `abaixo do alvo de ${a}%`

  return `Margem em **${fmt}%**, ${qualif}.`
}

function montarFraseSetorDestaque(d: DadosSumario): string | null {
  if (d.setores.length === 0) return null
  const maior = [...d.setores].sort((a, b) => b.pctFat - a.pctFat)[0]
  const pct   = Math.round(maior.pctFat)

  if (maior.margem == null) {
    return `**${maior.nome}** representa ${pct}% do faturamento.`
  }
  const mFmt = maior.margem.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  if (maior.margemVsAlvo != null && maior.margemVsAlvo < -2) {
    return `**${maior.nome}** representa ${pct}% do faturamento, com margem de apenas ${mFmt}% — abaixo da média do grupo.`
  }
  if (maior.margemVsAlvo != null && maior.margemVsAlvo > 2) {
    return `**${maior.nome}** representa ${pct}% do faturamento, com margem saudável de ${mFmt}%.`
  }
  return `**${maior.nome}** representa ${pct}% do faturamento, com margem de ${mFmt}%.`
}

function montarFrasePrejuizo(d: DadosSumario): string | null {
  if (d.prejuizos.quantidade === 0) return null
  const val = fmtMi(d.prejuizos.valor)
  if (d.prejuizos.quantidade === 1) return `1 venda com prejuízo no período (${val}).`
  return `${d.prejuizos.quantidade} vendas com prejuízo no período (${val} no total).`
}

export function gerarSumarioExecutivo(d: DadosSumario): string {
  if (d.faturamento.valor === 0) {
    return 'Sem dados disponíveis para o período selecionado.'
  }

  // Com poucos dados omite frases que dependem de agregações estatísticas
  const poucoDados = d.vendasCount < 5

  const frases = [
    montarAberturaPeriodo(d),
    montarFraseFaturamento(d),
    poucoDados ? null : montarFraseMargem(d),
    poucoDados ? null : montarFraseSetorDestaque(d),
    montarFrasePrejuizo(d),
  ].filter((f): f is string => f != null)

  return frases.join(' ')
}
