'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtMi, parseLocalDate } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'
import { PILL_FILTRO_SM, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import SumarioSubsetorCard from '@/components/weddings/sumario-subsetor'
import { parseRpc, executivaKpisSchema, tendenciaMargemSchema } from '@/lib/schemas-rpc'
import type { RpcLike } from '@/lib/rpc'
import type { TendenciaMargem, ExecutivaKpis, SumarioSubsetor } from '@/types/api'
import {
  SUBSETOR_ORDER,
  SUBSETOR_LABELS,
  subsetorColor,
} from '@/lib/config'
import {
  ChartGrid,
  ChartXAxisMes,
  ChartXAxisCategoria,
  ChartYAxisBRL,
  ChartYAxisPct,
  ChartLegend,
  CustomTooltip,
  dashArrays,
  strokeWidths,
  barRadius,
  barSizes,
  type ChartLegendItem,
} from '@/components/charts'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  Tooltip,
} from 'recharts'

// ── Historico por subsetor (RPC get_weddings_historico_subsetor) ──────────────

interface HistoricoSubsetorRow {
  mes:         string  // 'YYYY-MM-DD' (primeiro dia do mês)
  subsetor:    string
  faturamento: number
  receita:     number
}

// Ordem/cores/labels de subsetor vêm do design system ('@/lib/config'):
// SUBSETOR_ORDER, subsetorColor(), SUBSETOR_LABELS. A RPC pode retornar também
// 'NÃO_CLASSIFICADO', mas, por decisão do usuário, ele NÃO entra no detalhamento
// por subsetor — fica de fora dos gráficos stacked e da legenda. Por isso a ordem
// do drawer é exatamente a do config (sem apêndice de não-classificado).
const SUBSETOR_ORDER_DRAWER: string[] = [...SUBSETOR_ORDER]

// Rótulo de subsetor com fallback para o não-classificado (ausente do config).
function subsetorLabel(s: string): string {
  if (s === 'NÃO_CLASSIFICADO') return 'Não Classif.'
  return SUBSETOR_LABELS[s] ?? s
}

// Linha pivotada (um mês) para os BarCharts stacked.
type StackedRow = { mes: string; label: string } & Record<string, number | string>

// ── Drawer data shape ─────────────────────────────────────────────────────────

interface DrawerData {
  tendencia:    TendenciaMargem | null
  yoyTendencia: TendenciaMargem | null
  kpis:         ExecutivaKpis | null
  sumario:      SumarioSubsetor | null
  historico:    HistoricoSubsetorRow[]
}

// ── Date helpers ──────────────────────────────────────────────────────────────

// toISO LOCAL (por componentes) — pareado com parseLocalDate; sem fuso. (F6, v4.12.)
function toISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeAntDates(from: string, to: string) {
  const fromD = parseLocalDate(from)
  const toD   = parseLocalDate(to)
  const ms    = toD.getTime() - fromD.getTime() + 86400000
  const antTo = new Date(fromD.getTime() - 86400000)
  const antFrom = new Date(antTo.getTime() - ms + 86400000)
  return { from: toISO(antFrom), to: toISO(antTo) }
}

function computeYoyDates(from: string, to: string) {
  const f = parseLocalDate(from); f.setFullYear(f.getFullYear() - 1)
  const t = parseLocalDate(to);   t.setFullYear(t.getFullYear() - 1)
  return { from: toISO(f), to: toISO(t) }
}

// month string (YYYY-MM) helpers
function currentMonthStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function monthToFirstDay(ym: string) {
  // ym = 'YYYY-MM' → primeiro dia do mês
  return `${ym}-01`
}
function monthToLastDay(ym: string) {
  // ym = 'YYYY-MM' → último dia do mês
  const [y, m] = ym.split('-').map(Number)
  return toISO(new Date(y, m, 0)) // dia 0 do mês seguinte = último dia do mês atual
}

// 'YYYY-MM-DD' (primeiro dia do mês) → 'Mmm/AA' (ex: 'jan/26')
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
function mesLabel(isoDay: string) {
  const [y, m] = isoDay.split('-').map(Number)
  return `${MES_ABREV[m - 1]}/${String(y).slice(-2)}`
}

// ── Period pills ─────────────────────────────────────────────────────────────

type PillId = 'este-ano' | 'ult-3m' | 'ult-6m' | 'ult-12m' | 'custom'

const PILLS: { id: PillId; label: string }[] = [
  { id: 'este-ano', label: 'Este ano'      },
  { id: 'ult-3m',   label: 'Últ. 3 meses'  },
  { id: 'ult-6m',   label: 'Últ. 6 meses'  },
  { id: 'ult-12m',  label: 'Últ. 12 meses' },
  { id: 'custom',   label: 'Personalizado' },
]

function pillToDates(pill: PillId): { from: string; to: string } | null {
  const today   = new Date()
  const y       = today.getFullYear()
  const m       = today.getMonth()

  const lastOf  = (year: number, month: number) => new Date(year, month + 1, 0)

  switch (pill) {
    case 'este-ano':
      return { from: `${y}-01-01`, to: toISO(lastOf(y, 11)) }
    case 'ult-3m': {
      const from3 = new Date(y, m - 2, 1)
      return { from: toISO(from3), to: toISO(lastOf(y, m)) }
    }
    case 'ult-6m': {
      const from6 = new Date(y, m - 5, 1)
      return { from: toISO(from6), to: toISO(lastOf(y, m)) }
    }
    case 'ult-12m': {
      const from12 = new Date(y, m - 11, 1)
      return { from: toISO(from12), to: toISO(lastOf(y, m)) }
    }
    case 'custom':
      return null
  }
}

// ── Stacked tooltip (faturamento/receita por subsetor no mês) ───────────────────

function StackedTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name?: string | number; dataKey?: string | number; value?: number; color?: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  // Mostra apenas segmentos com valor > 0, do maior para o menor.
  const linhas = payload
    .filter(p => typeof p.value === 'number' && p.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
  if (!linhas.length) return null
  const total = linhas.reduce((s, p) => s + (p.value ?? 0), 0)
  // O eixo X agora keia em `mes` ('YYYY-MM-DD'); formata p/ 'jan/26' no header.
  const header = label ? mesLabel(label) : ''
  return (
    <div className="bg-white border border-zinc-200 rounded-lg shadow-md px-3 py-2 text-xs">
      <p className="font-medium text-zinc-700 mb-1">{header}</p>
      {linhas.map(p => {
        const key = String(p.dataKey ?? p.name)
        return (
          <p key={key} className="flex items-center justify-between gap-4" style={{ color: p.color }}>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block w-2 h-2 rounded-sm shrink-0" style={{ background: p.color }} />
              <span className="truncate">{subsetorLabel(key)}</span>
            </span>
            <span className="tabular-nums shrink-0">{fmtMi(p.value ?? 0)}</span>
          </p>
        )
      })}
      <p className="flex items-center justify-between gap-4 font-medium text-zinc-700 border-t border-zinc-100 mt-1 pt-1">
        <span>Total</span>
        <span className="tabular-nums shrink-0">{fmtMi(total)}</span>
      </p>
    </div>
  )
}

// ── KPI cell (faixa 3x2, sem card cinza) ────────────────────────────────────────

function KpiCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-3 text-center">
      <p className="text-3xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-lg font-bold tabular-nums" style={{ color: 'var(--brand)' }}>{value}</p>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="text-2xs font-semibold text-zinc-400 uppercase tracking-wide mb-2 mt-6">{label}</p>
  )
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-100 animate-pulse rounded h-24" />
      <div className="bg-zinc-100 animate-pulse rounded h-40" />
      <div className="bg-zinc-100 animate-pulse rounded h-32" />
    </div>
  )
}

// ── Drawer body ───────────────────────────────────────────────────────────────

function DrawerBody({ setor }: { setor: string }) {
  // v4.10/M2: subsetores só existem em Weddings. Para Trips/Corp, as seções de
  // subsetor (stacked Faturamento/Receita por Subsetor + Composição) são podadas.
  const isWeddings = setor === 'Weddings'
  const [activePill, setActivePill]             = useState<PillId>('este-ano')
  const [data, setData]                         = useState<DrawerData | null>(null)
  const [loadedKey, setLoadedKey]               = useState<string | null>(null)
  const [customFrom, setCustomFrom]             = useState('') // YYYY-MM
  const [customTo, setCustomTo]                 = useState('') // YYYY-MM
  const [showCustomPicker, setShowCustomPicker] = useState(false)
  // Inicializa já com 'este-ano' (era um efeito de mount que setava — react-hooks/set-state-in-effect).
  const [activeDates, setActiveDates]           = useState<{ from: string; to: string } | null>(() => pillToDates('este-ano'))
  // loading DERIVADO: true enquanto a chave atual (datas+setor+aba) não for a última carregada
  // (sem setLoading síncrono no efeito de fetch). Durante o refetch, segue mostrando os dados anteriores.
  const fetchKey = activeDates ? `${activeDates.from}|${activeDates.to}|${setor}|${isWeddings}` : null
  const loading  = loadedKey !== fetchKey
  const popoverRef = useRef<HTMLDivElement>(null)

  const maxMonth = currentMonthStr()

  // Close popover on outside click
  useEffect(() => {
    if (!showCustomPicker) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowCustomPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCustomPicker])

  // Fetch when activeDates changes
  useEffect(() => {
    if (!activeDates) return
    let cancelled = false
    const k = `${activeDates.from}|${activeDates.to}|${setor}|${isWeddings}`

    const { from: p_from, to: p_to } = activeDates
    const ant = computeAntDates(p_from, p_to)
    const yoy = computeYoyDates(p_from, p_to)

    const supabase = getBrowserClient()

    // RPCs parametrizadas por setor (herdam a aba). As de subsetor
    // (get_sumario_subsetor / get_weddings_historico_subsetor) são específicas de
    // Weddings — só consultadas quando isWeddings; para Trips/Corp ficam vazias.
    // RpcLike (não { data }): parseRpc (F7) precisa do campo `error` que o supabase-js
    // sempre devolve em runtime, ainda que o tipo da chamada `as any` não o exponha.
    const promessas: Promise<RpcLike>[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_tendencia_margem', { p_from, p_to, p_setor: setor }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_tendencia_margem', { p_from: yoy.from, p_to: yoy.to, p_setor: setor }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase.rpc as any)('get_executiva_kpis', {
        p_from, p_to, p_setor: setor,
        p_ant_from: ant.from, p_ant_to: ant.to,
        p_yoy_from: yoy.from, p_yoy_to: yoy.to,
      }),
    ]
    if (isWeddings) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      promessas.push((supabase.rpc as any)('get_sumario_subsetor', { p_from, p_to }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      promessas.push((supabase.rpc as any)('get_weddings_historico_subsetor', { p_from, p_to }))
    }

    Promise.all(promessas).then(([tendRes, yoyRes, kpisRes, sumRes, histRes]) => {
      if (cancelled) return
      setData({
        // F7 (v4.12.1): valida shape; drift/erro → null (logado em parseRpc).
        tendencia:    parseRpc(tendenciaMargemSchema, tendRes, 'get_tendencia_margem'),
        yoyTendencia: parseRpc(tendenciaMargemSchema, yoyRes, 'get_tendencia_margem (yoy)'),
        kpis:         parseRpc(executivaKpisSchema, kpisRes, 'get_executiva_kpis'),
        sumario:      isWeddings ? ((sumRes?.data as SumarioSubsetor) ?? null) : null,
        historico:    isWeddings ? ((histRes?.data as HistoricoSubsetorRow[]) ?? []) : [],
      })
      setLoadedKey(k)
    })

    return () => { cancelled = true }
  }, [activeDates, setor, isWeddings])

  const handlePillClick = (pill: PillId) => {
    if (pill === 'custom') {
      setShowCustomPicker(p => !p)
      return
    }
    setShowCustomPicker(false)
    setActivePill(pill)
    const dates = pillToDates(pill)
    if (dates) setActiveDates(dates)
  }

  const aplicarCustom = () => {
    if (!customFrom || !customTo) return
    setShowCustomPicker(false)
    setActivePill('custom')
    setActiveDates({
      from: monthToFirstDay(customFrom),
      to:   monthToLastDay(customTo),
    })
  }

  const pillClass  = (pill: PillId) => [PILL_FILTRO_SM, activePill === pill ? '' : PILL_FILTRO_INATIVO].join(' ')
  const pillStyle  = (pill: PillId) => (activePill === pill ? PILL_FILTRO_ATIVO_STYLE : undefined)

  // Chart data helpers — YoY com 4 séries: Faturamento e Receita, atual e ano anterior.
  // COR distingue MÉTRICA (faturamento=dourado, receita=cinza-azulado);
  // TRAÇO distingue PERÍODO (atual=sólido, anterior=tracejado). Escala Y única.
  //
  // As linhas ATUAIS param no mês corrente: meses futuros do período selecionado
  // vêm com valor 0 da RPC, o que esticaria a linha "atual" até o fim do ano. Para
  // esses meses (data_inicio além do mês atual), os valores atuais viram `null` e
  // a Line (connectNulls=false) interrompe ali. As linhas do ANO ANTERIOR cobrem o
  // período anterior completo (já consolidado) → mantêm seus valores.
  const mesAtual = currentMonthStr() // 'YYYY-MM'
  const yoyMerged = (data?.tendencia?.pontos ?? []).map((p, i) => {
    const ant = data?.yoyTendencia?.pontos[i]
    const futuro = p.data_inicio.slice(0, 7) > mesAtual
    return {
      label:             p.label,
      fatAtual:          futuro ? null : p.faturamento,
      fatAnterior:       ant?.faturamento ?? 0,
      receitaAtual:      futuro ? null : p.receita,
      receitaAnterior:   ant?.receita ?? 0,
    }
  })

  const margemData = data?.tendencia?.pontos ?? []

  // ── Stacked por subsetor (M2) ────────────────────────────────────────────────
  // Pivota o array flat { mes, subsetor, faturamento, receita } em uma linha por mês
  // com uma chave por subsetor presente. Faturamento e Receita têm escalas Y
  // INDEPENDENTES (M5): cada gráfico usa o próprio máximo mensal empilhado.
  const historico = data?.historico ?? []

  // Subsetores que de fato aparecem no período, na ordem fixa.
  const subsetoresPresentes = SUBSETOR_ORDER_DRAWER.filter(s =>
    historico.some(r => r.subsetor === s),
  )

  function pivotar(metric: 'faturamento' | 'receita'): StackedRow[] {
    const byMes = new Map<string, StackedRow>()
    for (const r of historico) {
      let row = byMes.get(r.mes)
      if (!row) {
        row = { mes: r.mes, label: mesLabel(r.mes) }
        byMes.set(r.mes, row)
      }
      row[r.subsetor] = (Number(row[r.subsetor]) || 0) + (r[metric] ?? 0)
    }
    return [...byMes.values()].sort((a, b) => a.mes.localeCompare(b.mes))
  }

  const fatData = pivotar('faturamento')
  const recData = pivotar('receita')

  // Escalas Y INDEPENDENTES (M5): cada gráfico stacked auto-escala pelo próprio
  // total mensal (o eixo BRL do primitivo parte de 0 e ajusta o topo sozinho).
  // A receita é fração do faturamento, então o eixo próprio dá legibilidade ao
  // seu detalhe interno — não mais a escala compartilhada do faturamento.
  const temHistorico = historico.length > 0

  // Legenda única dos subsetores presentes — entre os dois gráficos stacked.
  const subsetorLegendItems: ChartLegendItem[] = subsetoresPresentes.map(s => ({
    label: subsetorLabel(s),
    color: subsetorColor(s),
    type:  'rect',
  }))

  // Legenda do YoY (2×2): COR = métrica (Faturamento dourado / Receita cinza-azulado);
  // TRAÇO = período (sólido = atual / tracejado = ano anterior, referência).
  const yoyLegendItems: ChartLegendItem[] = [
    { label: 'Faturamento (atual)',        color: 'var(--brand)',          type: 'line' },
    { label: 'Faturamento (ano anterior)', color: 'var(--brand)',          type: 'line', dashed: true },
    { label: 'Receita (atual)',            color: 'var(--text-secondary)', type: 'line' },
    { label: 'Receita (ano anterior)',     color: 'var(--text-secondary)', type: 'line', dashed: true },
  ]

  return (
    <div>
      {/* Pills row — bloco sticky CONTÍNUO grudado ao cabeçalho (sem fresta).
          O scroll body do ListDrawer tem px-6 py-5; aqui o bloco é "esticado" com
          margens negativas (-mx-6 / -mt-5) e recompensado com padding equivalente
          para que o fundo branco cubra TODA a faixa superior do viewport de scroll
          (topo e laterais), evitando que o conteúdo apareça por trás ao rolar.
          O `sticky` ancora pela PADDING-BOX do container de scroll, que tem pt-5
          (20px). Com `top-0` o bloco grudaria 20px ABAIXO do topo, deixando o
          conteúdo aparecer naquela fresta. `-top-5` puxa a ancoragem 20px para
          cima — exatamente o pt-5 do corpo — colando o bloco rente ao cabeçalho.
          O pt-5 interno reposiciona as pills no lugar visual original. */}
      <div
        className="sticky -top-5 z-20 bg-white -mx-6 -mt-5 px-6 pt-5 pb-3 mb-1 border-b border-zinc-100"
        ref={popoverRef}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {PILLS.map(p => (
            <button
              key={p.id}
              className={pillClass(p.id)}
              style={pillStyle(p.id)}
              onClick={() => handlePillClick(p.id)}
              disabled={loading}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom month picker popover (seleção por MÊS).
            left-6 compensa o px-6 do bloco sticky esticado (-mx-6), mantendo o
            popover alinhado à borda esquerda das pills. */}
        {showCustomPicker && (
          <div className="absolute top-full left-6 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64">
            <p className="text-2xs font-medium text-zinc-500 mb-3">Período personalizado</p>
            <div className="space-y-2 mb-4">
              <div>
                <label className="text-3xs text-zinc-400 block mb-1">Mês inicial</label>
                <input
                  type="month"
                  aria-label="Mês inicial"
                  value={customFrom}
                  max={maxMonth}
                  onChange={e => setCustomFrom(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                />
              </div>
              <div>
                <label className="text-3xs text-zinc-400 block mb-1">Mês final</label>
                <input
                  type="month"
                  aria-label="Mês final"
                  value={customTo}
                  min={customFrom || undefined}
                  max={maxMonth}
                  onChange={e => setCustomTo(e.target.value)}
                  className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustomPicker(false)}
                className="flex-1 text-2xs text-zinc-400 hover:text-zinc-600 py-1.5 rounded border border-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={aplicarCustom}
                disabled={!customFrom || !customTo}
                className="flex-1 text-2xs text-white py-1.5 rounded transition-colors disabled:opacity-50"
                style={{ background: 'var(--brand)' }}
              >
                Aplicar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading or content */}
      {loading ? (
        <LoadingSkeleton />
      ) : !data ? (
        <p className="text-xs text-zinc-400 text-center py-8">Selecione um período</p>
      ) : (
        <div>
          {/* KPIs — faixa 3x2 uniforme (6 células iguais, sem sobra à direita).
              Separadores finos via gap que revela o fundo (border-zinc-100). */}
          <SectionHeader label="Indicadores" />
          <div className="grid grid-cols-3 gap-px bg-zinc-100 border border-zinc-100 rounded-lg overflow-hidden">
            <KpiCell label="Faturamento"  value={fmtMi(data.kpis?.faturamento?.valor  ?? 0)} />
            <KpiCell label="Receita"      value={fmtMi(data.kpis?.receita?.valor      ?? 0)} />
            <KpiCell label="Margem"       value={`${(data.kpis?.margem_pct?.valor     ?? 0).toFixed(1)}%`} />
            <KpiCell label="Nº Vendas"    value={String(data.kpis?.vendas?.valor      ?? 0)} />
            <KpiCell label="Ticket Médio" value={fmtMi(data.kpis?.ticket_medio?.valor ?? 0)} />
            <KpiCell label="Rec. Média"   value={fmtMi(data.kpis?.receita_media?.valor ?? 0)} />
          </div>

          {/* M2/M5: stacked Faturamento + Receita por subsetor.
              Escalas Y INDEPENDENTES; legenda única ENTRE os dois gráficos.
              v4.10/M2: só Weddings (Trips/Corp não têm subsetor → podado). */}
          {isWeddings && temHistorico && (
            <div className="mt-6">
              {/* Gráfico 1 — Faturamento por Subsetor */}
              <SectionHeader label="Faturamento por Subsetor" />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={fatData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {ChartGrid()}
                  {ChartXAxisMes('mes', { interval: 0 })}
                  {ChartYAxisBRL({ width: 76 })}
                  <Tooltip content={<StackedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  {subsetoresPresentes.map((s, idx) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="sub"
                      fill={subsetorColor(s)}
                      radius={idx === subsetoresPresentes.length - 1 ? barRadius.top : barRadius.none}
                      barSize={barSizes.column}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>

              {/* Legenda ÚNICA — entre os dois gráficos stacked (M5) */}
              <ChartLegend items={subsetorLegendItems} />

              {/* Gráfico 2 — Receita por Subsetor (escala Y PRÓPRIA) */}
              <SectionHeader label="Receita por Subsetor" />
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={recData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  {ChartGrid()}
                  {ChartXAxisMes('mes', { interval: 0 })}
                  {ChartYAxisBRL({ width: 76 })}
                  <Tooltip content={<StackedTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                  {subsetoresPresentes.map((s, idx) => (
                    <Bar
                      key={s}
                      dataKey={s}
                      name={s}
                      stackId="sub"
                      fill={subsetorColor(s)}
                      radius={idx === subsetoresPresentes.length - 1 ? barRadius.top : barRadius.none}
                      barSize={barSizes.column}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Comparação Ano Anterior — COR = métrica (Faturamento dourado / Receita
              cinza-azulado); TRAÇO = período (SÓLIDO atual / TRACEJADO ano anterior).
              Escala Y única — a receita, naturalmente mais baixa, é aceitável. */}
          <SectionHeader label="Comparação Ano Anterior" />
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={yoyMerged} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {ChartGrid()}
              {ChartXAxisCategoria('label')}
              {ChartYAxisBRL({ width: 76 })}
              <Tooltip content={(p) => (
                <CustomTooltip {...p} showColorDot formatter={(v, n) => [fmtMi(v), n]} />
              )} />
              <Line
                dataKey="fatAtual"
                name="Faturamento (atual)"
                stroke="var(--brand)"
                dot={false}
                strokeWidth={strokeWidths.line}
                connectNulls={false}
              />
              <Line
                dataKey="fatAnterior"
                name="Faturamento (ano anterior)"
                stroke="var(--brand)"
                dot={false}
                strokeWidth={strokeWidths.lineDashed}
                strokeDasharray={dashArrays.reference}
              />
              <Line
                dataKey="receitaAtual"
                name="Receita (atual)"
                stroke="var(--text-secondary)"
                dot={false}
                strokeWidth={strokeWidths.line}
                connectNulls={false}
              />
              <Line
                dataKey="receitaAnterior"
                name="Receita (ano anterior)"
                stroke="var(--text-secondary)"
                dot={false}
                strokeWidth={strokeWidths.lineDashed}
                strokeDasharray={dashArrays.reference}
              />
            </LineChart>
          </ResponsiveContainer>
          <ChartLegend items={yoyLegendItems} />

          {/* Tendência de Margem.
              Eixo Y com a MESMA largura (76) e as MESMAS margens do gráfico de
              Comparação Ano Anterior acima → áreas de plotagem idênticas, eixo X
              (datas) verticalmente alinhado entre os dois. */}
          <SectionHeader label="Tendência de Margem" />
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={margemData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              {ChartGrid()}
              {ChartXAxisCategoria('label')}
              {ChartYAxisPct({ width: 76, casas: 0 })}
              <Tooltip content={(p) => (
                <CustomTooltip {...p} showColorDot
                  formatter={(v, n) => [`${v.toFixed(1)}%`, n]} />
              )} />
              <Line
                dataKey="margem_pct"
                name="Margem %"
                stroke="var(--brand-deep)"
                dot={false}
                strokeWidth={strokeWidths.line}
              />
            </LineChart>
          </ResponsiveContainer>

          {/* Composição por Subsetor — sem box, mesmo período das pills.
              v4.10/M2: só Weddings (podado para Trips/Corp). */}
          {isWeddings && (
            <>
              <div className="flex items-baseline gap-2 mb-2 mt-6">
                <p className="text-2xs font-semibold text-zinc-400 uppercase tracking-wide">Composição por Subsetor</p>
                <span className="text-2xs" style={{ color: 'var(--brand)' }}>no período selecionado</span>
              </div>
              <SumarioSubsetorCard data={data.sumario} semBox />
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

interface Props {
  /** Setor do conteúdo: 'Weddings' | 'Lazer' (Trips) | 'Corporativo' | 'todos'.
   *  Para setor ≠ 'Weddings' as seções de subsetor são podadas (v4.10/M2). */
  setor: string
  onClose: () => void
}

export default function KpiPrincipalDrawer({ setor, onClose }: Props) {
  return (
    <ListDrawer
      titulo="Análise Histórica"
      subtitulo="Análise da evolução histórica de faturamento e receita do setor"
      onClose={onClose}
    >
      <DrawerBody setor={setor} />
    </ListDrawer>
  )
}
