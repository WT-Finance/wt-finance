'use client'

import { useState, useRef, useEffect } from 'react'
import { differenceInDays, parseISO, format } from 'date-fns'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtBRL } from '@/lib/fmt'
import ListDrawer from '@/components/shared/list-drawer'

export interface ProximoLancamento {
  numero:           string | null
  vencimento:       string
  pessoa:           string | null
  descricao:        string | null
  valor_final:      number
  tipo:             'Entrada' | 'Saída'
  status:           string
  dias_para_vencer: number
}

interface Props {
  lancamentos: ProximoLancamento[]
}

type Filtro = '5d' | '10d' | 'custom'

const LIMITE_INICIAL = 9

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

function fmtShort(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

function LancamentoRow({ v, i }: { v: ProximoLancamento; i: number }) {
  const isEntrada = v.tipo === 'Entrada'
  const isHoje    = v.dias_para_vencer === 0

  return (
    <div key={v.numero ?? i} className="py-2 flex items-start justify-between gap-2">
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <div className={[
          'shrink-0 w-8 text-center rounded px-0.5 py-0.5',
          isHoje ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-500',
        ].join(' ')}>
          <p className="text-[10px] font-semibold leading-none">
            {formatDateShort(v.vencimento)}
          </p>
          {isHoje && (
            <p className="text-[8px] leading-none mt-0.5 font-medium">hoje</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-700 truncate font-medium leading-snug">
            {v.pessoa ?? '—'}
          </p>
          {v.descricao && (
            <p className="text-[10px] text-zinc-400 truncate leading-snug">{v.descricao}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={[
          'inline-block px-1.5 py-0.5 rounded text-[9px] font-medium',
          isEntrada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
        ].join(' ')}>
          {isEntrada ? 'A Receber' : 'A Pagar'}
        </span>
        <span
          className="text-[10px] font-semibold tabular-nums"
          style={{ color: isEntrada ? 'var(--positive)' : 'var(--negative)' }}
        >
          {fmtBRL(v.valor_final)}
        </span>
      </div>
    </div>
  )
}

export default function ProximosLancamentosLateral({ lancamentos: lancamentosDefault }: Props) {
  const [filtro, setFiltro]           = useState<Filtro>('10d')
  const [dadosCustom, setDadosCustom] = useState<ProximoLancamento[] | null>(null)
  const [loading, setLoading]         = useState(false)
  const [drawerOpen, setDrawerOpen]   = useState(false)

  // Popover state
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [customFrom, setCustomFrom]   = useState(todayIso())
  const [customTo, setCustomTo]       = useState(todayIso())
  const [appliedRange, setAppliedRange] = useState<{ from: string; to: string } | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!popoverOpen) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverOpen])

  const lancamentos: ProximoLancamento[] =
    filtro === '5d'  ? lancamentosDefault.filter(l => l.dias_para_vencer <= 5) :
    filtro === '10d' ? lancamentosDefault :
                       dadosCustom ?? []

  const visiveis = lancamentos.slice(0, LIMITE_INICIAL)
  const temMais  = lancamentos.length > LIMITE_INICIAL

  const handlePillClick = (f: Filtro) => {
    if (f === 'custom') {
      setPopoverOpen(p => !p)
      return
    }
    setFiltro(f)
    setDadosCustom(null)
    setAppliedRange(null)
    setPopoverOpen(false)
  }

  const aplicarCustom = async () => {
    setPopoverOpen(false)
    const dias = differenceInDays(parseISO(customTo), new Date()) + 1
    const fromDate = parseISO(customFrom)
    const toDate   = parseISO(customTo)

    if (dias <= 10) {
      setDadosCustom(lancamentosDefault.filter(l => {
        const d = parseISO(l.vencimento)
        return d >= fromDate && d <= toDate
      }))
    } else {
      setLoading(true)
      const supabase = getBrowserClient()
      const { data } = await supabase.rpc('get_proximos_lancamentos', { p_dias: Math.max(dias, 1) })
      const all = (data as ProximoLancamento[] | null) ?? []
      setDadosCustom(all.filter(l => {
        const d = parseISO(l.vencimento)
        return d >= fromDate && d <= toDate
      }))
      setLoading(false)
    }

    setAppliedRange({ from: customFrom, to: customTo })
    setFiltro('custom')
  }

  const customLabel = appliedRange
    ? `${fmtShort(appliedRange.from)} — ${fmtShort(appliedRange.to)}`
    : 'Personalizado'

  const pillClass = (f: Filtro) => [
    'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
    filtro === f
      ? 'bg-zinc-800 text-white border-zinc-800'
      : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
  ].join(' ')

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm h-full flex flex-col">

        {/* Fixed header */}
        <div className="px-4 pt-4 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-700">Próximos Lançamentos</h3>
            <span className="text-[10px] text-zinc-400 tabular-nums">{lancamentos.length} itens</span>
          </div>

          {/* Pills + popover */}
          <div className="relative mb-3" ref={popoverRef}>
            <div className="flex items-center gap-1.5">
              <button className={pillClass('5d')}  onClick={() => handlePillClick('5d')}>5 dias</button>
              <button className={pillClass('10d')} onClick={() => handlePillClick('10d')}>10 dias</button>
              <button
                className={pillClass('custom')}
                onClick={() => handlePillClick('custom')}
                disabled={loading}
              >
                {loading ? '...' : customLabel}
              </button>
            </div>

            {popoverOpen && (
              <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-4 w-64">
                <p className="text-[11px] font-medium text-zinc-500 mb-3">Período personalizado</p>
                <div className="space-y-2 mb-4">
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">De</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={e => setCustomFrom(e.target.value)}
                      className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 block mb-1">Até</label>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom}
                      onChange={e => setCustomTo(e.target.value)}
                      className="w-full text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPopoverOpen(false)}
                    className="flex-1 text-[11px] text-zinc-400 hover:text-zinc-600 py-1.5 rounded border border-zinc-200 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={aplicarCustom}
                    className="flex-1 text-[11px] text-white py-1.5 rounded transition-colors"
                    style={{ background: 'var(--brand)' }}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* List */}
        {lancamentos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 pb-4">
            <p className="text-xs text-zinc-400 text-center">
              {filtro === 'custom' && dadosCustom === null
                ? 'Selecione um período e clique em Aplicar'
                : 'Nenhum vencimento no período selecionado'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 px-4 divide-y divide-zinc-50">
              {visiveis.map((v, i) => (
                <LancamentoRow key={v.numero ?? i} v={v} i={i} />
              ))}
            </div>

            {temMais && (
              <div className="shrink-0 border-t border-zinc-100">
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 transition-colors"
                >
                  Ver mais
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {drawerOpen && (
        <ListDrawer titulo="Próximos Lançamentos" onClose={() => setDrawerOpen(false)}>
          <div className="divide-y divide-zinc-50">
            {lancamentos.map((v, i) => (
              <LancamentoRow key={v.numero ?? i} v={v} i={i} />
            ))}
          </div>
        </ListDrawer>
      )}
    </>
  )
}
