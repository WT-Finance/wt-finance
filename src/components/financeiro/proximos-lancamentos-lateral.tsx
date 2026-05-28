'use client'

import { useState, useRef, useEffect } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
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

type TipoFiltro = 'todos' | 'receber' | 'pagar'
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

// --- Linha tabular ---
function LancamentoRow({ v }: { v: ProximoLancamento }) {
  const isEntrada = v.tipo === 'Entrada'
  const isHoje    = v.dias_para_vencer === 0
  const Icon      = isEntrada ? ArrowDownRight : ArrowUpRight
  const cor       = isEntrada ? 'var(--positive)' : 'var(--negative)'

  return (
    <tr className="border-b border-zinc-50 last:border-0">
      {/* Ícone + Data */}
      <td className="py-1.5 pr-2 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Icon size={12} style={{ color: cor }} className="shrink-0" />
          {isHoje ? (
            <span
              className="text-[9px] font-semibold px-1 py-0.5 rounded"
              style={{ background: 'var(--neutral-soft)', color: 'var(--neutral)' }}
            >
              HOJE
            </span>
          ) : (
            <span className="text-[10px] text-zinc-500 tabular-nums">
              {formatDateShort(v.vencimento)}
            </span>
          )}
        </div>
      </td>
      {/* Pessoa / Descrição */}
      <td className="py-1.5 min-w-0 max-w-0 w-full">
        <p className="text-[11px] font-medium text-zinc-700 truncate leading-none">
          {v.pessoa ?? '—'}
        </p>
        {v.descricao && v.descricao !== 'Pagamento venda' && (
          <p className="text-[9px] text-zinc-400 truncate leading-none mt-0.5">{v.descricao}</p>
        )}
      </td>
      {/* Valor */}
      <td className="py-1.5 pl-2 text-right whitespace-nowrap">
        <span className="text-[10px] font-semibold tabular-nums" style={{ color: cor }}>
          {isEntrada ? '+' : '-'}{fmtBRL(v.valor_final)}
        </span>
      </td>
    </tr>
  )
}

// --- Pills de tipo ---
function TipoPills({
  value,
  onChange,
}: {
  value: TipoFiltro
  onChange: (t: TipoFiltro) => void
}) {
  const pills: { id: TipoFiltro; label: string }[] = [
    { id: 'todos',   label: 'Todos'     },
    { id: 'receber', label: 'A receber' },
    { id: 'pagar',   label: 'A pagar'   },
  ]
  return (
    <div className="flex gap-1.5">
      {pills.map(p => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={[
            'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
            value === p.id
              ? 'bg-zinc-800 text-white border-zinc-800'
              : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
          ].join(' ')}
        >
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ── Drawer content ────────────────────────────────────────────────────────────

function DrawerContent({ lancamentosDefault }: { lancamentosDefault: ProximoLancamento[] }) {
  const [tipoFiltro, setTipoFiltro]     = useState<TipoFiltro>('todos')
  const [filtro, setFiltro]             = useState<Filtro>('10d')
  const [dadosCustom, setDadosCustom]   = useState<ProximoLancamento[] | null>(null)
  const [loading, setLoading]           = useState(false)
  const [popoverOpen, setPopoverOpen]   = useState(false)
  const [customFrom, setCustomFrom]     = useState(todayIso())
  const [customTo, setCustomTo]         = useState(todayIso())
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

  const baseData: ProximoLancamento[] =
    filtro === '5d'  ? lancamentosDefault.filter(l => l.dias_para_vencer <= 5) :
    filtro === '10d' ? lancamentosDefault :
                       dadosCustom ?? []

  const lancamentos = tipoFiltro === 'todos'
    ? baseData
    : baseData.filter(l =>
        tipoFiltro === 'receber' ? l.tipo === 'Entrada' : l.tipo === 'Saída'
      )

  const handlePillPeriodoClick = (f: Filtro) => {
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

  const pillPeriodoClass = (f: Filtro) => [
    'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
    filtro === f
      ? 'bg-zinc-800 text-white border-zinc-800'
      : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
  ].join(' ')

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header */}
      <div className="sticky top-0 bg-white z-10 pb-3 border-b border-zinc-100">
        <p className="text-xs text-zinc-400 mb-3">
          Próximos lançamentos de contas a pagar e a receber.
        </p>

        {/* Pills de tipo */}
        <TipoPills value={tipoFiltro} onChange={setTipoFiltro} />

        {/* Pills de período */}
        <div className="relative mt-2" ref={popoverRef}>
          <div className="flex items-center gap-1.5">
            <button className={pillPeriodoClass('5d')}  onClick={() => handlePillPeriodoClick('5d')}>5 dias</button>
            <button className={pillPeriodoClass('10d')} onClick={() => handlePillPeriodoClick('10d')}>10 dias</button>
            <button
              className={pillPeriodoClass('custom')}
              onClick={() => handlePillPeriodoClick('custom')}
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

      {/* Lista rolável */}
      <div className="flex-1 overflow-y-auto pt-3">
        {lancamentos.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-8">
            {filtro === 'custom' && dadosCustom === null
              ? 'Selecione um período e clique em Aplicar'
              : 'Nenhum lançamento no período e filtro selecionados'}
          </p>
        ) : (
          <table className="w-full">
            <tbody>
              {lancamentos.map((v, i) => (
                <LancamentoRow key={v.numero ?? i} v={v} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ProximosLancamentosLateral({ lancamentos: lancamentosDefault }: Props) {
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const filtrados = tipoFiltro === 'todos'
    ? lancamentosDefault
    : lancamentosDefault.filter(l =>
        tipoFiltro === 'receber' ? l.tipo === 'Entrada' : l.tipo === 'Saída'
      )

  const visiveis = filtrados.slice(0, LIMITE_INICIAL)

  return (
    <>
      <div className="rounded-xl bg-white shadow-sm flex-1 flex flex-col">
        {/* Header */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-zinc-700">Próximos Lançamentos</h3>
            <span className="text-[10px] text-zinc-400 tabular-nums">{filtrados.length} itens</span>
          </div>
          <TipoPills value={tipoFiltro} onChange={setTipoFiltro} />
        </div>

        {/* Tabela */}
        {filtrados.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-4 pb-4">
            <p className="text-xs text-zinc-400 text-center">
              {tipoFiltro === 'todos'
                ? 'Nenhum vencimento nos próximos 10 dias'
                : `Nenhum lançamento ${tipoFiltro === 'receber' ? 'a receber' : 'a pagar'} nos próximos 10 dias`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 px-4">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-100">
                    <th className="py-1 text-left text-[9px] font-medium text-zinc-400 uppercase tracking-wide w-16">
                      Data
                    </th>
                    <th className="py-1 text-left text-[9px] font-medium text-zinc-400 uppercase tracking-wide">
                      <span className="block">Pessoa</span>
                      <span className="block text-[8px] font-normal">Descrição</span>
                    </th>
                    <th className="py-1 text-right text-[9px] font-medium text-zinc-400 uppercase tracking-wide">
                      Valor
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((v, i) => (
                    <LancamentoRow key={v.numero ?? i} v={v} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="shrink-0 border-t border-zinc-100">
              <button
                onClick={() => setDrawerOpen(true)}
                className="w-full text-xs text-zinc-400 hover:text-zinc-600 py-1.5 transition-colors"
              >
                Ver mais
              </button>
            </div>
          </>
        )}
      </div>

      {drawerOpen && (
        <ListDrawer titulo="Próximos Lançamentos" onClose={() => setDrawerOpen(false)}>
          <DrawerContent lancamentosDefault={lancamentosDefault} />
        </ListDrawer>
      )}
    </>
  )
}
