'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  { v: 'data_evento:desc', l: 'Evento ↓' },
  { v: 'data_evento:asc',  l: 'Evento ↑' },
  { v: 'receita:desc',     l: 'Receita ↓' },
  { v: 'receita:asc',      l: 'Receita ↑' },
  { v: 'margem:desc',      l: 'Margem ↓' },
  { v: 'margem:asc',       l: 'Margem ↑' },
  { v: 'resultado:desc',   l: 'Caixa ↓'  },
  { v: 'resultado:asc',    l: 'Caixa ↑'  },
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

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[6, 140, 64, 72, 72, 52, 72, 80].map((w, i) => (
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

  const [data,    setData]    = useState<ListaOperacoes | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro,    setErro]    = useState<string | null>(null)

  // Debounce busca 300ms
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setBuscaDeb(busca), 300)
    return () => { if (debRef.current) clearTimeout(debRef.current) }
  }, [busca])

  // Reset página ao mudar filtros
  useEffect(() => { setPagina(1) }, [status, subsetor, buscaDeb, ordem])

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErro(null)
    const [ordenar_por, direcao] = ordem.split(':')
    const params = new URLSearchParams({ status, subsetor, ordenar_por, direcao, pagina: String(pagina), por_pagina: '50' })
    if (buscaDeb) params.set('busca', buscaDeb)
    try {
      const res = await fetch(`/api/dashboard/weddings/operacoes?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }, [status, subsetor, buscaDeb, ordem, pagina])

  useEffect(() => { fetchData() }, [fetchData])

  const totalPaginas = data ? Math.ceil(data.total / data.por_pagina) : 0

  const paginasBtns = (() => {
    if (totalPaginas <= 5) return Array.from({ length: totalPaginas }, (_, i) => i + 1)
    const start = Math.max(1, Math.min(pagina - 2, totalPaginas - 4))
    return Array.from({ length: 5 }, (_, i) => start + i)
  })()

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-4">
      {/* Header */}
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-sm font-semibold text-zinc-700">Lista de Operações</h2>
        {data && !loading && (
          <span className="text-xs text-zinc-400">{data.total} encontradas</span>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={status} onChange={e => setStatus(e.target.value)}
          className="text-xs border border-zinc-200 rounded-lg px-2.5 h-8 text-zinc-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          {STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>

        <select
          value={subsetor} onChange={e => setSubsetor(e.target.value)}
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
            value={ordem} onChange={e => setOrdem(e.target.value)}
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
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Operação / Casal</th>
              <th className="py-2 px-3 text-left text-xs font-medium text-zinc-400">Evento</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Faturamento</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Receita</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Margem</th>
              <th className="py-2 px-3 text-right text-xs font-medium text-zinc-400">Caixa</th>
              <th className="py-2 px-3 text-left  text-xs font-medium text-zinc-400">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : erro ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-red-500">{erro}</td>
              </tr>
            ) : !data?.operacoes?.length ? (
              <tr>
                <td colSpan={8} className="py-6 text-center text-sm text-zinc-400">
                  Nenhuma operação encontrada.
                </td>
              </tr>
            ) : (
              data.operacoes.map(op => (
                <tr
                  key={op.operacao}
                  onClick={() => onSelectOperacao?.(op.operacao)}
                  className={[
                    'hover:bg-zinc-50 transition-colors',
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
                  <td className={`py-2.5 px-3 text-right tabular-nums text-xs whitespace-nowrap ${op.resultado_caixa < 0 ? 'text-red-500' : 'text-zinc-700'}`}>
                    {fmtBRL(op.resultado_caixa)}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      {op.flags.map(f => <FlagBadge key={f} flag={f} />)}
                    </div>
                  </td>
                </tr>
              ))
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
