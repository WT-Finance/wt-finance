'use client'

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Search, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import type { ListaOperacoes, OperacaoItem } from '@/types/api'
import { fmtBRL, fmtDateLong } from '@/lib/fmt'
import { margemColor } from '@/lib/config'
import EmptyState from '@/components/shared/empty-state'

// ── Status pills ──────────────────────────────────────────────────────────────

const STATUS_PILLS = [
  { v: 'todos',   l: 'Todas'      },
  { v: 'passado', l: 'Realizados' },
  { v: 'futuro',  l: 'Futuros'    },
]

// ── Período personalizado ─────────────────────────────────────────────────────

type PeriodoPreset = 'todos' | 'personalizado'

interface PeriodoDatas {
  inicio: string | null
  fim: string | null
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10)

// ── Duração helper ────────────────────────────────────────────────────────────

function calcularDuracao(dataVenda: string | null, dataEvento: string | null): number | null {
  if (!dataVenda || !dataEvento) return null
  return Math.round(
    (new Date(dataEvento).getTime() - new Date(dataVenda).getTime()) / (1000 * 60 * 60 * 24)
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[140, 80, 64, 60, 56, 36, 72, 60, 44, 68, 72, 52].map((w, i) => (
        <td key={i} className="py-2.5 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

interface SortThProps {
  children: ReactNode
  field: string | null
  right?: boolean
  title?: string
  ordem: string
  onSort: (field: string) => void
}

function SortTh({ children, field, right, title, ordem, onSort }: SortThProps) {
  const [activeField, activeDir] = ordem.split(':')
  const isActive = field !== null && activeField === field
  const arrow = isActive ? (activeDir === 'asc' ? '▲' : '▼') : null

  const baseClass = `py-2 px-3 text-xs font-medium whitespace-nowrap ${right ? 'text-right' : 'text-left'}`
  const colorClass = isActive ? 'text-[--text-primary]' : 'text-zinc-400'
  const cursorClass = field ? 'cursor-pointer select-none hover:text-zinc-600' : ''
  const helpClass = title && !field ? 'cursor-help underline decoration-dotted decoration-zinc-300' : ''

  if (!field) {
    return (
      <th
        title={title}
        className={`${baseClass} ${colorClass} ${helpClass}`}
      >
        {children}
      </th>
    )
  }

  return (
    <th
      title={title}
      onClick={() => onSort(field)}
      className={`${baseClass} ${colorClass} ${cursorClass}`}
    >
      {children}
      {arrow && <span className="ml-0.5">{arrow}</span>}
    </th>
  )
}

// ── Excel export ──────────────────────────────────────────────────────────────

function exportarParaExcel(operacoes: OperacaoItem[], periodoLabel: string) {
  const dados = operacoes.map(op => ({
    'Operação / Casal':      op.nome_casal ?? op.operacao,
    'Hotel':                 op.hotel ?? '—',
    'Data do Evento':        op.data_evento ? new Date(op.data_evento).toLocaleDateString('pt-BR') : '—',
    'Duração (dias)':        calcularDuracao(op.data_venda_contrato, op.data_evento) ?? '—',
    'Contrato':              op.tipo_contrato ?? '—',
    'Conv.':                 op.convidados ?? 0,
    'Faturamento (R$)':      op.faturamento ?? 0,
    'Rec. Bruta (R$)':       op.receita ?? 0,
    'Mg. Bruta (%)':         op.margem_pct ?? 0,
    'Custos (R$)':           op.custos_internos !== 0 ? op.custos_internos : '—',
    'Rec. Líq. (R$)':        op.resultado_caixa ?? 0,
    'Mg. Líq. (%)':          op.margem_liquida_pct ?? 0,
  }))

  const ws = XLSX.utils.json_to_sheet(dados)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Operações Weddings')
  const hoje = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `weddings-operacoes-${periodoLabel}-${hoje}.xlsx`)
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onSelectOperacao?: (operacao: string) => void
}

export default function ListaOperacoesCard({ onSelectOperacao }: Props) {
  const [status,   setStatus]   = useState('passado')
  const [busca,    setBusca]    = useState('')
  const [buscaDeb, setBuscaDeb] = useState('')
  const [ordem,    setOrdem]    = useState('data_evento:desc')
  const [pagina,   setPagina]   = useState(1)

  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseInt(localStorage.getItem('wt-finance-lista-operacoes-page-size') ?? '10', 10)
    }
    return 10
  })

  const [periodoPreset,  setPeriodoPreset]  = useState<PeriodoPreset>('todos')
  const [periodoCustom,  setPeriodoCustom]  = useState<{ inicio: string; fim: string } | null>(null)
  const [customPopover,  setCustomPopover]  = useState(false)
  const [customFrom,     setCustomFrom]     = useState('')
  const [customTo,       setCustomTo]       = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  const [isExporting,  setIsExporting]  = useState(false)

  const [requestState, setRequestState] = useState<{
    key: string
    data: ListaOperacoes | null
    erro: string | null
  }>({ key: '', data: null, erro: null })

  const periodoAtivo: PeriodoDatas = useMemo(() => {
    if (periodoPreset === 'personalizado' && periodoCustom) {
      return { inicio: periodoCustom.inicio, fim: periodoCustom.fim }
    }
    return { inicio: null, fim: null }
  }, [periodoPreset, periodoCustom])

  const periodoLabel = useMemo(() => {
    if (periodoPreset === 'personalizado' && periodoCustom) {
      return `${periodoCustom.inicio}_${periodoCustom.fim}`
    }
    return 'todos'
  }, [periodoPreset, periodoCustom])

  // Close popover on outside click
  useEffect(() => {
    if (!customPopover) return
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCustomPopover(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [customPopover])

  // Debounce busca 300ms
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => {
      setBuscaDeb(busca)
      setPagina(1)
    }, 300)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [busca])

  const queryString = useMemo(() => {
    const [ordenar_por, direcao] = ordem.split(':')
    const params = new URLSearchParams({
      status,
      subsetor: 'todos',
      ordenar_por,
      direcao,
      pagina: String(pagina),
      por_pagina: String(pageSize),
    })
    if (buscaDeb) params.set('busca', buscaDeb)
    if (periodoAtivo.inicio) params.set('periodo_inicio', periodoAtivo.inicio)
    if (periodoAtivo.fim)    params.set('periodo_fim',    periodoAtivo.fim)
    return params.toString()
  }, [status, buscaDeb, ordem, pagina, pageSize, periodoAtivo])

  const allQueryString = useMemo(() => {
    const [ordenar_por, direcao] = ordem.split(':')
    const params = new URLSearchParams({
      status,
      subsetor: 'todos',
      ordenar_por,
      direcao,
      pagina: '1',
      por_pagina: '200',
    })
    if (buscaDeb) params.set('busca', buscaDeb)
    if (periodoAtivo.inicio) params.set('periodo_inicio', periodoAtivo.inicio)
    if (periodoAtivo.fim)    params.set('periodo_fim',    periodoAtivo.fim)
    return params.toString()
  }, [status, buscaDeb, ordem, periodoAtivo])

  useEffect(() => {
    let cancelled = false

    fetch(`/api/dashboard/weddings/operacoes?${queryString}`)
      .then(async res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<ListaOperacoes>
      })
      .then(data => {
        if (!cancelled) setRequestState({ key: queryString, data, erro: null })
      })
      .catch(e => {
        if (!cancelled) {
          setRequestState({
            key: queryString,
            data: null,
            erro: e instanceof Error ? e.message : 'Erro desconhecido',
          })
        }
      })

    return () => { cancelled = true }
  }, [queryString])

  const loading = requestState.key !== queryString
  const data = loading ? null : requestState.data
  const erro = loading ? null : requestState.erro

  const totalPaginas = data ? Math.ceil(data.total / data.por_pagina) : 0

  const paginasBtns = (() => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(pagina - 2, totalPaginas - 4))
    return Array.from({ length: 5 }, (_, i) => start + i)
  })()

  function handleSort(field: string) {
    setOrdem(prev => {
      const [cur, dir] = prev.split(':')
      if (cur === field) return `${field}:${dir === 'desc' ? 'asc' : 'desc'}`
      return `${field}:desc`
    })
    setPagina(1)
  }

  function handlePageSizeChange(value: string) {
    const size = parseInt(value, 10)
    setPageSize(size)
    localStorage.setItem('wt-finance-lista-operacoes-page-size', value)
    setPagina(1)
  }

  function handlePeriodoPersonalizado() {
    setCustomPopover(prev => !prev)
  }

  function clearPeriodoCustom() {
    setPeriodoCustom(null)
    setPeriodoPreset('todos')
    setCustomPopover(false)
    setPagina(1)
  }

  function aplicarPeriodoCustom() {
    if (!customFrom || !customTo) return
    if (customTo < customFrom) return
    setPeriodoCustom({ inicio: customFrom, fim: customTo })
    setPeriodoPreset('personalizado')
    setCustomPopover(false)
    setPagina(1)
  }

  async function handleExportar() {
    setIsExporting(true)
    try {
      const res = await fetch(`/api/dashboard/weddings/operacoes?${allQueryString}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const resultado = await res.json() as ListaOperacoes
      exportarParaExcel(resultado.operacoes, periodoLabel)
    } catch {
    } finally {
      setIsExporting(false)
    }
  }

  const sortThProps = { ordem, onSort: handleSort }

  const TODAY = isoDate(new Date())

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-[--text-primary]">Lista de Operações</h2>
          {data && !loading && (
            <span className="text-xs text-zinc-400">{data.total} encontradas</span>
          )}
        </div>
        <button
          onClick={handleExportar}
          disabled={isExporting || loading}
          className="flex items-center gap-1.5 px-3 h-8 text-xs font-medium rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isExporting ? (
            <span className="w-3.5 h-3.5 rounded-full border-2 border-zinc-400 border-t-transparent animate-spin" />
          ) : (
            <Download size={14} strokeWidth={1.8} />
          )}
          Exportar
        </button>
      </div>

      {/* Status pills + Personalizado + busca */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_PILLS.map(pill => {
          const isActive = status === pill.v
          return (
            <button
              key={pill.v}
              onClick={() => { setStatus(pill.v); setPagina(1) }}
              className={[
                'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                isActive ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
              ].join(' ')}
              style={isActive ? {
                background:   'var(--brand-soft)',
                borderColor:  'var(--brand)',
                color:        'var(--brand-deep)',
              } : undefined}
            >
              {pill.l}
            </button>
          )
        })}

        {/* Personalizado — separador visual */}
        <span className="text-zinc-200 self-center">|</span>

        <div className="relative">
          <button
            onClick={handlePeriodoPersonalizado}
            className={[
              'px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
              periodoPreset === 'personalizado' ? '' : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50',
            ].join(' ')}
            style={periodoPreset === 'personalizado' ? {
              background:  'var(--brand-soft)',
              borderColor: 'var(--brand)',
              color:       'var(--brand-deep)',
            } : undefined}
          >
            {periodoPreset === 'personalizado' && periodoCustom
              ? `${periodoCustom.inicio.slice(5)} — ${periodoCustom.fim.slice(5)}`
              : 'Personalizado'}
          </button>
          {periodoPreset === 'personalizado' && periodoCustom && (
            <button
              onClick={clearPeriodoCustom}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-zinc-300 hover:bg-zinc-400 text-white flex items-center justify-center text-[10px] leading-none transition-colors"
              title="Limpar filtro de período"
            >
              ×
            </button>
          )}

          {customPopover && (
            <div
              ref={popoverRef}
              className="absolute top-full left-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64 font-sans"
            >
              <p className="text-xs font-semibold mb-3 text-zinc-500">Período personalizado:</p>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-xs mb-1 block text-zinc-400">Início</label>
                  <input
                    type="date" value={customFrom} max={customTo || TODAY}
                    onChange={e => setCustomFrom(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs mb-1 block text-zinc-400">Fim</label>
                  <input
                    type="date" value={customTo} min={customFrom} max={TODAY}
                    onChange={e => setCustomTo(e.target.value)}
                    className="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setCustomPopover(false)}
                  className="text-xs px-2 py-1 text-zinc-400 hover:text-zinc-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={aplicarPeriodoCustom}
                  disabled={!customFrom || !customTo || customTo < customFrom}
                  className="text-xs font-medium text-white px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
                  style={{ background: 'var(--brand)' }}
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>

        <input
          type="text" placeholder="Buscar por casal..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-44 ml-2"
        />
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <SortTh field="nome_casal" {...sortThProps}>Operação / Casal</SortTh>
              <SortTh field="hotel" title="Hotel / fornecedor principal do casamento (Contrato=1)" {...sortThProps}>Hotel</SortTh>
              <SortTh field="data_evento" {...sortThProps}>Data do Evento</SortTh>
              <SortTh field="duracao" title="Dias entre assinatura do contrato e data do casamento" {...sortThProps}>Duração</SortTh>
              <SortTh field="tipo_contrato" title="Tipo de contrato (Tudo Incluído, Cardápio, etc.) — disponível após reimportação com nova coluna" {...sortThProps}>Contrato</SortTh>
              <SortTh field="convidados" right title="Número de convidados únicos nas Diárias de Hospedagem" {...sortThProps}>Conv.</SortTh>
              <SortTh field="faturamento" right title="Soma do valor total das vendas desta operação" {...sortThProps}>Faturamento</SortTh>
              <SortTh field="receita" right title="Faturamento − repasse ao fornecedor (hotel, cia. aérea)" {...sortThProps}>Rec. Bruta</SortTh>
              <SortTh field="margem" right title="Receita Bruta ÷ Faturamento × 100" {...sortThProps}>Mg. Bruta</SortTh>
              <SortTh field="custos" right title="Receita Bruta − Custos Internos (estimado como RB − resultado de caixa quando positivo)" {...sortThProps}>Custos</SortTh>
              <SortTh field="resultado" right title="Entradas − Saídas (resultado de caixa da operação)" {...sortThProps}>Rec. Líq.</SortTh>
              <SortTh field="ml" right title="Receita Líquida ÷ Faturamento × 100" {...sortThProps}>Mg. Líq.</SortTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : erro ? (
              <tr>
                <td colSpan={12} className="py-6 text-center text-sm text-red-500">{erro}</td>
              </tr>
            ) : !data?.operacoes?.length ? (
              <tr>
                <td colSpan={12}>
                  <EmptyState icon={Search} message="Nenhuma operação encontrada para os filtros selecionados" />
                </td>
              </tr>
            ) : (
              data.operacoes.map(op => {
                const rlNegativa = op.resultado_caixa < 0
                const duracao = calcularDuracao(op.data_venda_contrato, op.data_evento)
                return (
                  <tr
                    key={op.operacao}
                    onClick={() => onSelectOperacao?.(op.operacao)}
                    className={[
                      'transition-colors',
                      rlNegativa ? 'bg-danger-bg/40 hover:bg-danger-bg/70' : 'hover:bg-zinc-50',
                      onSelectOperacao ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-zinc-800 text-xs">
                        {op.nome_casal ?? op.operacao}
                      </p>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-500 truncate max-w-[100px] whitespace-nowrap">
                      {op.hotel ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                      {op.data_evento ? fmtDateLong(op.data_evento) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap tabular-nums">
                      {duracao !== null
                        ? <span className="text-zinc-600">{duracao} dias</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                      {op.tipo_contrato ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs whitespace-nowrap">
                      {op.convidados == null || op.convidados === 0 ? (
                        <span
                          className="text-zinc-300"
                          title={op.convidados === 0 ? 'Sem passageiros cadastrados nas Diárias desta operação' : undefined}
                        >
                          {op.convidados === 0 ? '0' : '—'}
                        </span>
                      ) : (
                        <span className="text-zinc-700">{op.convidados}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-zinc-700 whitespace-nowrap">
                      {fmtBRL(op.faturamento)}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-zinc-700 whitespace-nowrap">
                      {fmtBRL(op.receita)}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${margemColor(op.margem_pct)}`}>
                      {op.margem_pct.toFixed(1)}%
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs whitespace-nowrap ${op.custos_internos < 0 ? 'text-danger font-medium' : 'text-zinc-500'}`}>
                      {op.custos_internos !== 0 ? fmtBRL(op.custos_internos) : <span className="text-zinc-300">—</span>}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${rlNegativa ? 'text-danger' : 'text-zinc-700'}`}>
                      {fmtBRL(op.resultado_caixa)}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${margemColor(op.margem_liquida_pct)}`}>
                      {op.margem_liquida_pct.toFixed(1)}%
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {!loading && data && (totalPaginas > 1 || data.total > 0) && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400">
              Pág. {pagina} / {Math.max(totalPaginas, 1)} · {data.total} resultados
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-400">Itens:</span>
              <select
                value={String(pageSize)}
                onChange={e => handlePageSizeChange(e.target.value)}
                className="text-xs border border-zinc-200 rounded-md px-1.5 h-7 text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>
          {totalPaginas > 1 && (
            <div className="flex gap-1">
              <button
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="px-2.5 h-7 text-xs rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Ant.
              </button>
              {paginasBtns.map(p => (
                <button
                  key={p}
                  onClick={() => setPagina(p)}
                  className={`w-7 h-7 text-xs rounded border ${
                    p === pagina
                      ? 'border-blue-500 bg-blue-50 text-blue-600 font-semibold'
                      : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="px-2.5 h-7 text-xs rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próx. →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
