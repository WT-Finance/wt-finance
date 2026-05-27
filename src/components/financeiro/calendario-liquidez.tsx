'use client'

import { useState, useEffect, useCallback } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtMi, fmtBRL } from '@/lib/fmt'

// ── Types ────────────────────────────────────────────────────────────────────

interface CalendarioDia {
  data: string         // 'YYYY-MM-DD'
  dia: number
  eh_hoje: boolean
  fora_do_mes: boolean
  entradas_dia: number
  saidas_dia: number
  saldo_dia: number
}

interface LancamentoDia {
  numero: string | null
  pessoa: string | null
  descricao: string | null
  valor_final: number
  conta_previsao: string | null
  tipo: string
  status: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function formatMesAno(d: Date): string {
  return `${MESES_PT[d.getMonth()]}/${d.getFullYear()}`
}

function formatDataLonga(isoDate: string): string {
  const [y, m, day] = isoDate.split('-')
  return `${parseInt(day, 10)} de ${MESES_EXTENSO[parseInt(m, 10) - 1]} de ${y}`
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getCellStyle(dia: CalendarioDia): React.CSSProperties {
  if (dia.fora_do_mes) return { opacity: 0.35 }
  if (dia.saldo_dia > 0) return { background: 'var(--positive-soft)' }
  if (dia.saldo_dia < 0) return { background: 'var(--negative-soft)' }
  return {}
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DrillDownModal({
  data,
  lancamentos,
  onClose,
}: {
  data: string
  lancamentos: LancamentoDia[] | null
  onClose: () => void
}) {
  const entradas = lancamentos?.filter(l => l.tipo === 'Entrada') ?? []
  const saidas   = lancamentos?.filter(l => l.tipo === 'Saída') ?? []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800 capitalize">
            {formatDataLonga(data)}
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-3">
          {lancamentos === null ? (
            <p className="text-xs text-zinc-400 py-4 text-center">Carregando...</p>
          ) : lancamentos.length === 0 ? (
            <p className="text-xs text-zinc-400 py-4 text-center">Nenhum lançamento nesta data</p>
          ) : (
            <>
              {entradas.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Entradas</p>
                  <div className="space-y-1.5">
                    {entradas.map((l, i) => (
                      <LancamentoRow key={l.numero ?? i} lancamento={l} />
                    ))}
                  </div>
                </div>
              )}
              {saidas.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Saídas</p>
                  <div className="space-y-1.5">
                    {saidas.map((l, i) => (
                      <LancamentoRow key={l.numero ?? `s${i}`} lancamento={l} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LancamentoRow({ lancamento: l }: { lancamento: LancamentoDia }) {
  const isEntrada = l.tipo === 'Entrada'
  const isFuturo  = l.status === 'A Receber Futuro' || l.status === 'A Pagar Futuro'

  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-zinc-50 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-700 truncate font-medium">{l.pessoa ?? '—'}</p>
        {l.descricao && (
          <p className="text-[10px] text-zinc-400 truncate">{l.descricao}</p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className={[
            'inline-block px-1.5 py-0.5 rounded text-[9px] font-medium',
            isFuturo
              ? isEntrada
                ? 'bg-zinc-100 text-zinc-500'
                : 'bg-zinc-100 text-zinc-500'
              : isEntrada
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700',
          ].join(' ')}
        >
          {isEntrada ? (isFuturo ? 'A Receber' : 'Recebido') : (isFuturo ? 'A Pagar' : 'Pago')}
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: isEntrada ? 'var(--positive)' : 'var(--negative)' }}
        >
          {isEntrada ? '+' : '-'}{fmtBRL(l.valor_final)}
        </span>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CalendarioLiquidez() {
  const hoje = new Date()
  const [mesReferencia, setMesReferencia] = useState<Date>(
    new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  )
  const [cells, setCells]       = useState<CalendarioDia[]>([])
  const [loading, setLoading]   = useState(true)

  // Drill-down state
  const [diaSelecionado, setDiaSelecionado]   = useState<string | null>(null)
  const [lancamentos, setLancamentos]         = useState<LancamentoDia[] | null>(null)
  const [modalAberto, setModalAberto]         = useState(false)

  // ── Navigation ──────────────────────────────────────────────────────────────
  const mesAnterior = () => setMesReferencia(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))
  const mesProximo  = () => setMesReferencia(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))
  const irHoje      = () => setMesReferencia(new Date(hoje.getFullYear(), hoje.getMonth(), 1))

  // ── Fetch calendar data ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setCells([])

    const mesIso = toIsoDate(mesReferencia)
    const supabase = getBrowserClient()

    supabase
      .rpc('get_calendario_liquidez', { p_mes_referencia: mesIso })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[CalendarioLiquidez]', error.message)
          setLoading(false)
          return
        }
        setCells((data as CalendarioDia[] | null) ?? [])
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [mesReferencia])

  // ── Drill-down handler ───────────────────────────────────────────────────────
  const abrirDia = useCallback((dia: CalendarioDia) => {
    setDiaSelecionado(dia.data)
    setLancamentos(null)
    setModalAberto(true)

    const supabase = getBrowserClient()
    supabase
      .rpc('get_lancamentos_do_dia', { p_data: dia.data })
      .then(({ data, error }) => {
        if (error) {
          console.error('[get_lancamentos_do_dia]', error.message)
          setLancamentos([])
          return
        }
        setLancamentos((data as LancamentoDia[] | null) ?? [])
      })
  }, [])

  const fecharModal = useCallback(() => {
    setModalAberto(false)
    setDiaSelecionado(null)
    setLancamentos(null)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        {/* Card title */}
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>
          Calendário de Liquidez
        </h3>

        {/* Header: navigation */}
        <div className="flex items-center justify-between mb-0.5">
          <button
            onClick={mesAnterior}
            className="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
            aria-label="Mês anterior"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>

          <span className="text-xs font-semibold text-zinc-600">
            {formatMesAno(mesReferencia)}
          </span>

          <button
            onClick={mesProximo}
            className="p-1.5 rounded hover:bg-zinc-100 text-zinc-500 hover:text-zinc-800 transition-colors"
            aria-label="Próximo mês"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
        <div className="flex justify-center mb-3">
          <button
            onClick={irHoje}
            className="text-[9px] text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Redefinir
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 mb-1">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-zinc-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="h-14 rounded animate-pulse bg-zinc-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(dia => {
              const cellStyle: React.CSSProperties = {
                ...getCellStyle(dia),
                ...(dia.eh_hoje
                  ? { outline: '2px solid var(--brand)', outlineOffset: '-2px' }
                  : {}),
              }

              return (
                <button
                  key={dia.data}
                  onClick={() => abrirDia(dia)}
                  className="rounded p-1 text-left min-h-14 hover:brightness-95 transition-all cursor-pointer"
                  style={cellStyle}
                >
                  {/* Day number */}
                  <p className={[
                    'text-xs font-semibold leading-none mb-0.5',
                    dia.fora_do_mes ? 'text-zinc-300' : 'text-zinc-700',
                  ].join(' ')}>
                    {dia.dia}
                  </p>

                  {/* Entradas / Saídas */}
                  {!dia.fora_do_mes && (dia.entradas_dia > 0 || dia.saidas_dia > 0) && (
                    <div className="space-y-px">
                      {dia.entradas_dia > 0 && (
                        <p className="text-[9px] leading-none tabular-nums" style={{ color: 'var(--positive-deep)' }}>
                          +{fmtMi(dia.entradas_dia)}
                        </p>
                      )}
                      {dia.saidas_dia > 0 && (
                        <p className="text-[9px] leading-none tabular-nums" style={{ color: 'var(--negative-deep)' }}>
                          -{fmtMi(dia.saidas_dia)}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Saldo */}
                  {!dia.fora_do_mes && dia.saldo_dia !== 0 && (
                    <p
                      className="text-[9px] font-semibold leading-none tabular-nums mt-0.5"
                      style={{ color: dia.saldo_dia >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                    >
                      {fmtMi(dia.saldo_dia)}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-zinc-100">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }} />
            <span className="text-[10px] text-zinc-400">Saldo positivo</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded" style={{ background: '#fff1f2', border: '1px solid #fecdd3' }} />
            <span className="text-[10px] text-zinc-400">Saldo negativo</span>
          </div>
        </div>
      </div>

      {/* Drill-down modal */}
      {modalAberto && diaSelecionado && (
        <DrillDownModal
          data={diaSelecionado}
          lancamentos={lancamentos}
          onClose={fecharModal}
        />
      )}
    </>
  )
}
