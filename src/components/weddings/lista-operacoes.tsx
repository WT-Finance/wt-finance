'use client'

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { ListaOperacoes, OperacaoFlag } from '@/types/api'
import { fmtBRL, fmtDate } from '@/lib/fmt'
import { margemColor } from '@/lib/config'

// ── Helpers ──────────────────────────────────────────────────────────────────

const FLAG_CONFIG: Record<OperacaoFlag, { label: string; cls: string }> = {
  margem_negativa: { label: 'Margem −', cls: 'bg-red-50 text-red-600 border-red-200' },
  ncg_alto:        { label: 'NCG alto', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  outlier:         { label: 'Outlier',  cls: 'bg-purple-50 text-purple-600 border-purple-200' },
}

const SITUACAO_DOT: Record<string, string> = {
  futuro:   'bg-blue-400',
  passado:  'bg-zinc-300',
  sem_data: 'bg-zinc-200',
}

const STATUS_OPTS = [
  { v: 'todos',    l: 'Situação: Todas' },
  { v: 'futuro',   l: 'Futuro'          },
  { v: 'passado',  l: 'Passado'         },
  { v: 'sem_data', l: 'Sem data'        },
]

const SUBSETOR_OPTS = [
  { v: 'todos',            l: 'Subsetor: Todos'  },
  { v: 'COMERCIAL',        l: 'Comercial'        },
  { v: 'CONVIDADOS',       l: 'Convidados'       },
  { v: 'PRODUÇÃO',         l: 'Produção'         },
  { v: 'PLANEJAMENTO',     l: 'Planejamento'     },
  { v: 'NÃO_CLASSIFICADO', l: 'Não Classif.'     },
]

const ORDEM_OPTS = [
  { v: 'data_evento:desc', l: 'Evento ↓'    },
  { v: 'data_evento:asc',  l: 'Evento ↑'    },
  { v: 'receita:desc',     l: 'Rec. Bruta ↓' },
  { v: 'receita:asc',      l: 'Rec. Bruta ↑' },
  { v: 'margem:desc',      l: 'Marg. Bruta ↓' },
  { v: 'margem:asc',       l: 'Marg. Bruta ↑' },
  { v: 'resultado:desc',   l: 'Rec. Líq. ↓'  },
  { v: 'resultado:asc',    l: 'Rec. Líq. ↑'  },
  { v: 'ml:desc',          l: 'Marg. Líq. ↓' },
  { v: 'ml:asc',           l: 'Marg. Líq. ↑' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function FlagBadge({ flag }: { flag: OperacaoFlag }) {
  const { label, cls } = FLAG_CONFIG[flag]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {label}
    </span>
  )
}

function Th({ children, right, title }: { children: ReactNode; right?: boolean; title?: string }) {
  return (
    <th
      title={title}
      className={`py-2 px-3 text-xs font-medium text-zinc-400 whitespace-nowrap ${right ? 'text-right' : 'text-left'} ${title ? 'cursor-help underline decoration-dotted decoration-zinc-300' : ''}`}
    >
      {children}
    </th>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[6, 140, 80, 64, 72, 60, 44, 68, 72, 52, 80].map((w, i) => (
        <td key={i} className="py-2.5 px-3">
          <div className="h-3 rounded bg-zinc-100" style={{ width: w }} />
        </td>
      ))}
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onSelectOperacao?: (operacao: string) => void
}

export default function ListaOperacoesCard({ onSelectOperacao }: Props) {
  const [status,   setStatus]   = useState('todos')
  const [subsetor, setSubsetor] = useState('todos')
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
    const params = new URLSearchParams({ status, subsetor, ordenar_por, direcao, pagina: String(pagina), por_pagina: '10' })
    if (buscaDeb) params.set('busca', buscaDeb)
    return params.toString()
  }, [status, subsetor, buscaDeb, ordem, pagina])

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

  return (
    <div className="bg-white rounded-[10px] border border-[--border] px-6 py-5 shadow-[0_1px_3px_rgba(45,42,38,0.04)]">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-semibold text-[--text-primary]">Lista de Operações</h2>
        {data && !loading && (
          <span className="text-xs text-zinc-400">{data.total} encontradas</span>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={status} onChange={e => { setStatus(e.target.value); setPagina(1) }}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        <select
          value={subsetor} onChange={e => { setSubsetor(e.target.value); setPagina(1) }}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {SUBSETOR_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        <input
          type="text" placeholder="Buscar por casal..."
          value={busca} onChange={e => setBusca(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 placeholder:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-200 min-w-44"
        />

        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-zinc-400 hidden sm:inline">Ordenar:</span>
          <select
            value={ordem} onChange={e => { setOrdem(e.target.value); setPagina(1) }}
            className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {ORDEM_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100">
              <th className="py-2 px-3 w-5" />
              <Th>Operação / Casal</Th>
              <Th title="Hotel / fornecedor principal do casamento (Contrato=1)">Hotel</Th>
              <Th>Evento</Th>
              <Th right title="Soma do valor total das vendas desta operação">Faturamento</Th>
              <Th right title="Faturamento − repasse ao fornecedor (hotel, cia. aérea)">Rec. Bruta</Th>
              <Th right title="Receita Bruta ÷ Faturamento × 100">Mg. Bruta</Th>
              <Th right title="Receita Bruta − Custos Internos (estimado como RB − resultado de caixa quando positivo)">Custos Int.</Th>
              <Th right title="Entradas − Saídas (resultado de caixa da operação)">Rec. Líq.</Th>
              <Th right title="Receita Líquida ÷ Faturamento × 100">Mg. Líq.</Th>
              <Th>Flags</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : erro ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-sm text-red-500">{erro}</td>
              </tr>
            ) : !data?.operacoes?.length ? (
              <tr>
                <td colSpan={11} className="py-6 text-center text-sm text-zinc-400">
                  Nenhuma operação encontrada.
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
                      rlNegativa ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-zinc-50',
                      onSelectOperacao ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    <td className="py-2.5 px-3">
                      <span className={`inline-block w-2 h-2 rounded-full ${SITUACAO_DOT[op.situacao] ?? 'bg-zinc-200'}`} />
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-medium text-zinc-800 text-xs">{op.operacao}</p>
                      {op.nome_casal && (
                        <p className="text-[11px] text-zinc-500 truncate max-w-52">{op.nome_casal}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-500 truncate max-w-[100px] whitespace-nowrap">
                      {op.hotel ?? <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-zinc-600 whitespace-nowrap">
                      {op.data_evento ? fmtDate(op.data_evento) : <span className="text-zinc-300">—</span>}
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
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${rlNegativa ? 'text-red-600' : 'text-zinc-700'}`}>
                      {fmtBRL(op.resultado_caixa)}
                    </td>
                    <td className={`py-2.5 px-3 text-right tabular-nums text-xs font-medium whitespace-nowrap ${margemColor(op.margem_liquida_pct)}`}>
                      {op.margem_liquida_pct.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {op.flags.map(f => <FlagBadge key={f} flag={f} />)}
                      </div>
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
