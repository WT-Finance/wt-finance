'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, ReferenceLine, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartXAxisMes, ChartYAxisBRL, ChartLegend, CustomTooltip,
  chartColors, chartMargins, strokeWidths, dashArrays, fillMonths,
} from '@/components/charts'
import type { ChartLegendItem } from '@/components/charts'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import type {
  DrilldownOperacao, VisaoFinanceira, SumarioSubsetor, AcumuladoMensalItem,
} from '@/types/api'
import { fmtBRL2, fmtDateLong, fmtAxisMes, fmtMeses } from '@/lib/fmt'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM' do mês atual (para o marcador "hoje" e o trecho efetivo/projetado). */
function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Duração em dias entre a venda do contrato e o evento. Null se faltar data. */
function calcDuracaoDias(dataVenda: string | null, dataEvento: string | null): number | null {
  if (!dataVenda || !dataEvento) return null
  const v = new Date(dataVenda + 'T00:00:00')
  const e = new Date(dataEvento + 'T00:00:00')
  const dias = Math.round((e.getTime() - v.getTime()) / 86_400_000)
  return Number.isFinite(dias) ? dias : null
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

/** Célula da faixa 3×2 (padrão KpiCell do drawer principal). */
function InfoCell({ label, value, destaque }: {
  label: string; value: string; destaque?: boolean
}) {
  return (
    <div className="bg-white px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}
      </p>
      <p
        className="text-base font-bold tabular-nums"
        style={{ color: destaque ? 'var(--brand)' : 'var(--text-primary)' }}
      >
        {value}
      </p>
    </div>
  )
}

/** Linha de fluxo (Entradas/Saídas) com dois sub-valores. */
function FluxoRow({ label, total, sub1Label, sub1, sub2Label, sub2, isEntrada }: {
  label: string; total: number
  sub1Label: string; sub1: number
  sub2Label: string; sub2: number
  isEntrada: boolean
}) {
  const color = isEntrada ? 'text-success' : 'text-danger'
  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-semibold text-zinc-700">{label}</span>
        <span className={`text-sm font-semibold tabular-nums ${color}`}>{fmtBRL2(total)}</span>
      </div>
      <div className="grid grid-cols-1 gap-1 pl-3 border-l-2 border-zinc-100">
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-zinc-400">{sub1Label}</span>
          <span className="text-xs tabular-nums text-zinc-600">{fmtBRL2(sub1)}</span>
        </div>
        <div className="flex justify-between items-baseline">
          <span className="text-[10px] text-zinc-400">{sub2Label}</span>
          <span className="text-xs tabular-nums text-zinc-600">{fmtBRL2(sub2)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Caixa Acumulado por Mês (Entradas e Saídas — Efetivo + Projetado) ──────────

// Cores semânticas do design system (tokens.css): verde harmônico c/ Weddings
// para Entradas, terracota dessaturada para Saídas. Nunca hex hardcoded.
const COR_ENTRADA = 'var(--positive)'
const COR_SAIDA   = 'var(--negative)'

type CurvaPonto = {
  mes:               string         // 'YYYY-MM'
  entrada_projetada: number
  saida_projetada:   number
  /** Trecho sólido (realizado até hoje) + ponto-junção no mês atual, p/ não "vazar". */
  entrada_efetiva_plot: number | null
  saida_efetiva_plot:   number | null
}

/**
 * Caixa acumulado contínuo, DUAS curvas: Entradas (verde) e Saídas (vermelho).
 * Cada uma tem trecho EFETIVO sólido (realizado, até hoje) e trecho PROJETADO
 * tracejado (inclui agendado futuro). Marcador vertical "hoje". Eixo X contínuo.
 */
function CaixaAcumuladoChart({ rows }: { rows: AcumuladoMensalItem[] }) {
  const mesAtual = currentMonth()

  // Eixo X CONTÍNUO (preenche meses faltantes) + linha sólida ligada à tracejada
  // no mês atual (ponto-junção), evitando o "buraco" entre as duas séries.
  const data: CurvaPonto[] = useMemo(() => {
    const continua = fillMonths<AcumuladoMensalItem>(
      rows,
      r => r.mes,
      mes => ({
        mes,
        entrada_efetiva:   null,
        entrada_projetada: 0,
        saida_efetiva:     null,
        saida_projetada:   0,
        eh_futuro:         mes > mesAtual,
      }),
    )
    // Efetivo "carregado" para a frente até o último mês não-futuro (a curva
    // realizada não cai a zero em meses sem liquidação).
    // for-loop (não .map) para o forward-fill: a mutação dos acumuladores fica
    // na execução síncrona do useMemo, sem escapar num callback (react-hooks/immutability).
    const out: CurvaPonto[] = []
    let ultimaEntrada: number | null = null
    let ultimaSaida:   number | null = null
    for (const r of continua) {
      if (!r.eh_futuro && r.entrada_efetiva != null) ultimaEntrada = r.entrada_efetiva
      if (!r.eh_futuro && r.saida_efetiva   != null) ultimaSaida   = r.saida_efetiva
      const entradaEf = r.eh_futuro ? null : (r.entrada_efetiva ?? ultimaEntrada)
      const saidaEf   = r.eh_futuro ? null : (r.saida_efetiva   ?? ultimaSaida)
      // ponto-junção: no mês atual a linha sólida ainda toca o último efetivo,
      // para emendar visualmente com a tracejada.
      const entradaPlot = r.mes === mesAtual ? (entradaEf ?? ultimaEntrada) : entradaEf
      const saidaPlot   = r.mes === mesAtual ? (saidaEf   ?? ultimaSaida)   : saidaEf
      out.push({
        mes:                  r.mes,
        entrada_projetada:    r.entrada_projetada,
        saida_projetada:      r.saida_projetada,
        entrada_efetiva_plot: entradaPlot,
        saida_efetiva_plot:   saidaPlot,
      })
    }
    return out
  }, [rows, mesAtual])

  const legendItems: ChartLegendItem[] = [
    { label: 'Entradas',  color: COR_ENTRADA,        type: 'line' },
    { label: 'Saídas',    color: COR_SAIDA,          type: 'line' },
    { label: 'Projetado', color: chartColors.axisTick, type: 'line', dashed: true },
  ]

  // Marcador "hoje" só faz sentido se o mês atual estiver no intervalo.
  const temHoje = data.some(d => d.mes === mesAtual)

  const tooltipLabel = (name: string): string => {
    switch (name) {
      case 'entrada_efetiva_plot': return 'Entradas (efetivo)'
      case 'entrada_projetada':    return 'Entradas (projetado)'
      case 'saida_efetiva_plot':   return 'Saídas (efetivo)'
      case 'saida_projetada':      return 'Saídas (projetado)'
      default:                     return name
    }
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={chartMargins.default}>
          {ChartGrid()}
          {ChartXAxisMes('mes', { interval: 'preserveStartEnd' })}
          {ChartYAxisBRL({ width: 64, abs: false })}
          {temHoje && (
            <ReferenceLine
              x={mesAtual}
              stroke={chartColors.axisTick}
              strokeDasharray={dashArrays.reference}
              label={{ value: 'hoje', position: 'insideTopRight', fontSize: 10, fill: chartColors.axisTick }}
            />
          )}
          <Tooltip
            content={<CustomTooltip
              labelFormatter={(l) => fmtAxisMes(String(l))}
              formatter={(v, name) => [fmtBRL2(v), tooltipLabel(String(name))]}
            />}
          />
          {/* Projetado — tracejado, desenhado primeiro (fica "atrás"). */}
          <Line
            type="monotone" dataKey="entrada_projetada"
            stroke={COR_ENTRADA} strokeWidth={strokeWidths.lineDashed}
            strokeDasharray={dashArrays.reference}
            dot={false} isAnimationActive={false} connectNulls
          />
          <Line
            type="monotone" dataKey="saida_projetada"
            stroke={COR_SAIDA} strokeWidth={strokeWidths.lineDashed}
            strokeDasharray={dashArrays.reference}
            dot={false} isAnimationActive={false} connectNulls
          />
          {/* Efetivo — sólido, por cima. */}
          <Line
            type="monotone" dataKey="entrada_efetiva_plot"
            stroke={COR_ENTRADA} strokeWidth={strokeWidths.line}
            dot={false} isAnimationActive={false} connectNulls
          />
          <Line
            type="monotone" dataKey="saida_efetiva_plot"
            stroke={COR_SAIDA} strokeWidth={strokeWidths.line}
            dot={false} isAnimationActive={false} connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
      <ChartLegend items={legendItems} />
    </div>
  )
}

// ── Main Drawer ───────────────────────────────────────────────────────────────

interface Props {
  operacao: string
  onClose:  () => void
}

export default function DrilldownDrawer({ operacao, onClose }: Props) {
  const [requestState, setRequestState] = useState<{
    operacao: string
    data: DrilldownOperacao | null
  }>({ operacao: '', data: null })
  const [visible, setVisible] = useState(false)

  const handleClose = useCallback(() => {
    setVisible(false)
    setTimeout(onClose, 280)
  }, [onClose])

  // Slide-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  // Esc
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [handleClose])

  // Body scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Fetch
  useEffect(() => {
    let cancelled = false

    fetch(`/api/dashboard/weddings/operacao/${encodeURIComponent(operacao)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<DrilldownOperacao>
      })
      .then(data => {
        if (!cancelled) setRequestState({ operacao, data })
      })
      .catch(() => {
        if (!cancelled) setRequestState({ operacao, data: null })
      })

    return () => { cancelled = true }
  }, [operacao])

  const loading = requestState.operacao !== operacao
  const data = loading ? null : requestState.data
  const vf: VisaoFinanceira | undefined = data?.visao_financeira

  // NCG no SINAL correto: (A pagar − A receber). >0 = necessidade (vermelho);
  // <0 = sobra (verde). Computado no front a partir da visao_financeira.
  const ncg = vf ? vf.a_pagar - vf.a_receber : 0

  // Resultado Previsto = projetado: (recebido + a receber) − (pago + a pagar),
  // ou seja entradas_total − saidas_total. (Decisão do usuário, v4.8.2.)
  const resultadoPrevisto = vf ? vf.entradas_total - vf.saidas_total : 0

  // Duração (dias) entre venda do contrato e evento.
  const duracaoDias = calcDuracaoDias(data?.data_venda_contrato ?? null, data?.data_evento ?? null)

  // Margem Bruta = Receita Bruta / Faturamento.
  const margemBruta = vf && vf.faturamento > 0 ? (vf.receita_bruta / vf.faturamento) * 100 : 0

  // Composição por Subsetor no formato SumarioSubsetor (reuso do card).
  const sumario: SumarioSubsetor | null = useMemo(() => {
    if (!data || data.decomposicao_subsetor.length === 0) return null
    const subsetores = data.decomposicao_subsetor.map(s => ({
      subsetor:        s.subsetor,
      n_vendas:        0,
      faturamento:     s.faturamento,
      receita:         s.receita,
      margem_pct:      s.margem_pct,
      pct_faturamento: s.pct_faturamento,
    }))
    const faturamento = subsetores.reduce((acc, s) => acc + s.faturamento, 0)
    const receita     = subsetores.reduce((acc, s) => acc + s.receita, 0)
    return {
      periodo:    { inicio: '', fim: '' },
      subsetores,
      total: {
        n_vendas:   0,
        faturamento,
        receita,
        margem_pct: faturamento > 0 ? Math.round((receita / faturamento) * 100 * 10) / 10 : 0,
      },
    }
  }, [data])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.45)', opacity: visible ? 1 : 0, transition: 'opacity 280ms ease' }}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl"
        style={{
          transform:  visible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header — empilhado, sem badge */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-100 shrink-0">
          <div className="min-w-0 pr-3">
            <p className="text-base font-semibold text-zinc-900 truncate">{operacao}</p>
            {data?.nome_casal && (
              <p className="text-sm text-zinc-500 mt-0.5 truncate">{data.nome_casal}</p>
            )}
            {data?.data_evento && (
              <p className="text-xs text-zinc-400 mt-0.5">{fmtDateLong(data.data_evento)}</p>
            )}
            {data?.hotel && (
              <p className="text-xs text-zinc-400 mt-0.5 truncate">{data.hotel}</p>
            )}
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable content — espaçamento vertical generoso entre seções
            (consistência com o drawer principal). */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-8">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-24 rounded-xl bg-zinc-100" />
              <div className="h-40 rounded-xl bg-zinc-100" />
              <div className="h-48 rounded-xl bg-zinc-100" />
              <div className="h-36 rounded-xl bg-zinc-100" />
            </div>
          ) : !data || !vf ? (
            <p className="text-sm text-zinc-400 text-center py-12">Erro ao carregar dados da operação.</p>
          ) : (
            <>
              {/* ── 1. Informações Gerais — faixa 3×2 ─────────────────── */}
              <div>
                <SectionTitle>Informações Gerais</SectionTitle>
                {/* Divisórias finas via gap que revela o fundo (padrão do drawer
                    principal): sem bordas fortes entre as células. */}
                <div className="grid grid-cols-3 gap-px bg-zinc-100 border border-zinc-100 rounded-lg overflow-hidden">
                  <InfoCell
                    label="Duração"
                    value={duracaoDias != null ? fmtMeses(duracaoDias) : '—'}
                    destaque
                  />
                  <InfoCell
                    label="Tipo de Contrato"
                    value={data.tipo_contrato ?? '—'}
                    destaque
                  />
                  <InfoCell
                    label="Convidados"
                    value={data.convidados != null ? String(data.convidados) : '—'}
                    destaque
                  />
                  <InfoCell label="Faturamento"   value={fmtBRL2(vf.faturamento)}   destaque />
                  <InfoCell label="Receita Bruta" value={fmtBRL2(vf.receita_bruta)} destaque />
                  <InfoCell label="Margem Bruta"  value={`${margemBruta.toFixed(1)}%`} destaque />
                </div>
              </div>

              {/* ── 2. Fluxo de Caixa ─────────────────────────────────── */}
              <div>
                <SectionTitle>Fluxo de Caixa</SectionTitle>
                <div className="border border-zinc-100 rounded-lg p-3">
                  <div className="grid grid-cols-2 gap-x-4">
                    <FluxoRow
                      label="Entradas" total={vf.entradas_total} isEntrada
                      sub1Label="Recebido"   sub1={vf.recebido}
                      sub2Label="A receber"  sub2={vf.a_receber}
                    />
                    <FluxoRow
                      label="Saídas"   total={vf.saidas_total} isEntrada={false}
                      sub1Label="Pago"      sub1={vf.pago}
                      sub2Label="A pagar"   sub2={vf.a_pagar}
                    />
                  </div>
                  {/* v4.9/M6: rótulos na 1ª linha, valores na 2ª — assim os 3 valores
                      alinham horizontalmente mesmo quando um rótulo quebra em 2 linhas
                      (telas estreitas). Mantém os 3 indicadores (decisão do usuário). */}
                  <div className="grid grid-cols-3 grid-rows-[auto_auto] gap-x-4 gap-y-0.5 items-start pt-2 border-t border-zinc-100 mt-1">
                    <span className="text-xs font-semibold text-zinc-700 leading-tight">Resultado de Caixa</span>
                    <span className="text-xs font-semibold text-zinc-700 leading-tight">Resultado Previsto</span>
                    {/* NCG: >0 = necessidade (vermelho); <0 = sobra (verde). Só o valor colorido. */}
                    <span className="text-xs font-semibold text-zinc-700 leading-tight">NCG</span>
                    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${vf.resultado_caixa >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmtBRL2(vf.resultado_caixa)}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${resultadoPrevisto >= 0 ? 'text-success' : 'text-danger'}`}>
                      {fmtBRL2(resultadoPrevisto)}
                    </span>
                    <span className={`text-sm font-semibold tabular-nums whitespace-nowrap ${ncg > 0 ? 'text-danger' : 'text-success'}`}>
                      {fmtBRL2(ncg)}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── 3. Composição por Subsetor ───────────────────────── */}
              {sumario && (
                <div>
                  <SectionTitle>Composição por Subsetor</SectionTitle>
                  <SumarioSubsetorCard data={sumario} semBox />
                </div>
              )}

              {/* ── 4. Caixa Acumulado por Mês (Efetivo + Projetado) ──── */}
              {data.acumulado_mensal.length > 0 && (
                <div>
                  <SectionTitle>Caixa Acumulado por Mês</SectionTitle>
                  <CaixaAcumuladoChart rows={data.acumulado_mensal} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
