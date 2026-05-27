'use client'

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import type { ListaOperacoes } from '@/types/api'
import { fmtBRL, fmtDateLong } from '@/lib/fmt'
import { margemColor } from '@/lib/config'
import EmptyState from '@/components/shared/empty-state'

// ── Status pills ──────────────────────────────────────────────────────────────

const STATUS_PILLS = [
  { v: 'todos',   l: 'Todas'      },
  { v: 'passado', l: 'Realizados' },
  { v: 'futuro',  l: 'Futuros'    },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[140, 80, 64, 56, 120, 36, 72, 60, 44, 68, 72, 52].map((w, i) => (
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

  const [requestState, setRequestState] = useState<{
    key: string
    data: ListaOperacoes | null
    erro: string | null
  }>({ key: '', data: null, erro: null })

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
      por_pagina: '10',
    })
    if (buscaDeb) params.set('busca', buscaDeb)
    return params.toString()
  }, [status, buscaDeb, ordem, pagina])

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

  const sortThProps = { ordem, onSort: handleSort }

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-semibold text-[--text-primary]">Lista de Operações</h2>
        {data && !loading && (
          <span className="text-xs text-zinc-400">{data.total} encontradas</span>
        )}
      </div>

      {/* Status pills */}
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
              <SortTh field={null} title="Tipo de contrato (Tudo Incluído, Cardápio, etc.) — disponível após reimportação com nova coluna" {...sortThProps}>Contrato</SortTh>
              <SortTh field={null} title="Passageiros cadastrados nas Diárias de Hospedagem — disponível após reimportação com nova coluna" {...sortThProps}>Passageiros</SortTh>
              <SortTh field={null} right title="Número de convidados únicos nas Diárias de Hospedagem" {...sortThProps}>Conv.</SortTh>
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
                    <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                      {op.tipo_contrato ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-500 max-w-30">
                      {op.passageiros_raw ? (
                        <span
                          className="block truncate"
                          title={op.passageiros_raw}
                        >
                          {op.passageiros_raw}
                        </span>
                      ) : (
                        <span className="text-zinc-300">—</span>
                      )}
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
                    <td className="py-2.5 px-3 text-right tabular-nums text-xs text-zinc-500 whitespace-nowrap">
                      {op.custos_internos > 0 ? fmtBRL(op.custos_internos) : <span className="text-zinc-300">—</span>}
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
      {!loading && data && totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-100">
          <span className="text-xs text-zinc-400">
            Pág. {pagina} / {totalPaginas} · {data.total} resultados
          </span>
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
        </div>
      )}
    </div>
  )
}
