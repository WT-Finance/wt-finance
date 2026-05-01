import type {
  ExecutivaKpis, MixSetor, PrejuizosSummary,
  Historico12m, DecomposicaoVariacao,
} from '@/types/api'
import type { Benchmarks } from '@/lib/config'

export interface PontoAtencao {
  regra:            string
  severidade:       'amarelo' | 'vermelho'
  mensagem:         string
  impacto_estimado: number
}

export interface DadosPeriodo {
  kpis:         ExecutivaKpis | null
  mix:          MixSetor | null
  prejuizos:    PrejuizosSummary | null
  prejuizosAnt: PrejuizosSummary | null
  historico:    Historico12m | null
  decomposicao: DecomposicaoVariacao | null
  benchmarks:   Benchmarks
  eParcial:     boolean
}

export interface ResultadoAlertas {
  pontos:          PontoAtencao[]
  totalDisparados: number
  estado:          'com_alertas' | 'sem_alertas' | 'sem_dados'
}

const fmt1 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// ── Regra 1: Margem abaixo do alvo ─────────────────────────────────────────
function regraMargemAbaixoAlvo(d: DadosPeriodo): PontoAtencao | null {
  const margem = d.kpis?.margem_pct.valor
  if (margem == null || margem >= d.benchmarks.margemAlvo) return null

  const dif       = margem - d.benchmarks.margemAlvo
  const isVermelho = margem < d.benchmarks.margemAtencao
  const mensagem  = isVermelho
    ? `Margem em ${fmt1(margem)}%, criticamente abaixo do alvo de ${d.benchmarks.margemAlvo}% (${fmt1(dif)} p.p.).`
    : `Margem em ${fmt1(margem)}%, abaixo do alvo de ${d.benchmarks.margemAlvo}% (${fmt1(dif)} p.p.).`

  return {
    regra:            'margem_abaixo_alvo',
    severidade:       isVermelho ? 'vermelho' : 'amarelo',
    mensagem,
    impacto_estimado: (d.kpis?.faturamento.valor ?? 0) * Math.abs(dif) / 100,
  }
}

// ── Regra 2: Tendência de queda de margem ──────────────────────────────────
function regraTendenciaQuedaMargem(d: DadosPeriodo): PontoAtencao | null {
  const meses = (d.historico?.meses ?? []).filter(m => m.margem_pct != null)

  // Para período parcial, exclui o mês em curso (dados incompletos)
  const base = d.eParcial ? meses.filter(m => !m.eh_atual) : meses
  if (base.length < 3) return null

  const [m1, m2, m3] = base.slice(-3).map(m => m.margem_pct!)
  if (m2 >= m1 || m3 >= m2) return null // não está em queda contínua

  const quedaTotal = m1 - m3
  if (quedaTotal <= 1) return null // < 1 p.p. — não significativo

  return {
    regra:            'tendencia_queda_margem',
    severidade:       quedaTotal > 2 ? 'vermelho' : 'amarelo',
    mensagem:         `Margem caindo há 3 meses (${fmt1(m1)}% → ${fmt1(m2)}% → ${fmt1(m3)}%).`,
    impacto_estimado: 0,
  }
}

// ── Regra 3: Setor com margem muito abaixo do grupo ────────────────────────
function regraSetorMargemBaixa(d: DadosPeriodo): PontoAtencao | null {
  const setores = d.mix?.setores ?? []
  const limiar  = d.benchmarks.margemAlvo - 3

  const candidatos = setores.filter(
    s => s.margem_pct != null && s.margem_pct < limiar && s.pct_faturamento > 20,
  )
  if (candidatos.length === 0) return null

  const pior    = candidatos.sort((a, b) => (a.margem_pct ?? 0) - (b.margem_pct ?? 0))[0]
  const pctFmt  = Math.round(pior.pct_faturamento)
  const impacto = (d.kpis?.faturamento.valor ?? 0) *
    (pior.pct_faturamento / 100) *
    Math.abs((pior.margem_pct ?? 0) - d.benchmarks.margemAlvo) / 100

  return {
    regra:            'setor_margem_baixa',
    severidade:       'amarelo',
    mensagem:         `${pior.display_nome} tem margem de ${fmt1(pior.margem_pct!)}% (alvo ${d.benchmarks.margemAlvo}%) e representa ${pctFmt}% do faturamento.`,
    impacto_estimado: impacto,
  }
}

// ── Regra 4: Vendas com prejuízo crescentes ────────────────────────────────
function regraPrejuizosCrescentes(d: DadosPeriodo): PontoAtencao | null {
  const qtd    = d.prejuizos?.quantidade    ?? 0
  const qtdAnt = d.prejuizosAnt?.quantidade ?? 0

  if (qtd < 5 || qtdAnt === 0 || qtd <= qtdAnt * 1.5) return null

  return {
    regra:            'prejuizos_crescentes',
    severidade:       'amarelo',
    mensagem:         `${qtd} vendas com prejuízo no período (vs ${qtdAnt} no anterior).`,
    impacto_estimado: d.prejuizos?.valor_prejuizo_total ?? 0,
  }
}

// ── Regra 5: Queda forte em setor específico ───────────────────────────────
function regraSetorComQuedaForte(d: DadosPeriodo): PontoAtencao | null {
  const decompSetores = d.decomposicao?.setores ?? []
  const mixSetores    = d.mix?.setores          ?? []

  const candidatos = decompSetores.filter(s => {
    if (s.variacao_pct == null || s.variacao_pct >= -15) return false
    const mix = mixSetores.find(ms => ms.setor_macro === s.nome)
    return mix != null && mix.pct_faturamento > 15
  })
  if (candidatos.length === 0) return null

  const pior   = candidatos.sort((a, b) => (a.variacao_pct ?? 0) - (b.variacao_pct ?? 0))[0]
  const mix    = mixSetores.find(ms => ms.setor_macro === pior.nome)
  const pctFat = Math.round(mix?.pct_faturamento ?? 0)

  return {
    regra:            'setor_queda_forte',
    severidade:       'amarelo',
    mensagem:         `${pior.display_nome} caiu ${fmt1(Math.abs(pior.variacao_pct!))}% vs período anterior, representando ${pctFat}% do faturamento.`,
    impacto_estimado: Math.abs(pior.variacao),
  }
}

// ── Avaliação de todas as regras ───────────────────────────────────────────

const REGRAS = [
  regraMargemAbaixoAlvo,
  regraTendenciaQuedaMargem,
  regraSetorMargemBaixa,
  regraPrejuizosCrescentes,
  regraSetorComQuedaForte,
]

const MAX_ALERTAS = 3

export function avaliarTodasRegras(dados: DadosPeriodo): ResultadoAlertas {
  if (!dados.kpis) {
    return { pontos: [], totalDisparados: 0, estado: 'sem_dados' }
  }

  const todos = REGRAS
    .map(r => r(dados))
    .filter((p): p is PontoAtencao => p !== null)
    .sort((a, b) => {
      if (a.severidade !== b.severidade)
        return a.severidade === 'vermelho' ? -1 : 1
      return b.impacto_estimado - a.impacto_estimado
    })

  if (todos.length === 0) {
    return { pontos: [], totalDisparados: 0, estado: 'sem_alertas' }
  }

  return {
    pontos:          todos.slice(0, MAX_ALERTAS),
    totalDisparados: todos.length,
    estado:          'com_alertas',
  }
}
