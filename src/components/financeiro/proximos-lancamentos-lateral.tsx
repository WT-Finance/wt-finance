'use client'

import { useState } from 'react'
import { getBrowserClient } from '@/lib/supabase/client'
import { fmtBRL } from '@/lib/fmt'

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

export default function ProximosLancamentosLateral({ lancamentos: lancamentosDefault }: Props) {
  const [filtro, setFiltro]           = useState<Filtro>('10d')
  const [diasCustom, setDiasCustom]   = useState('30')
  const [dadosCustom, setDadosCustom] = useState<ProximoLancamento[] | null>(null)
  const [loading, setLoading]         = useState(false)
  const [expandido, setExpandido]     = useState(false)

  const lancamentos: ProximoLancamento[] =
    filtro === '5d'  ? lancamentosDefault.filter(l => l.dias_para_vencer <= 5) :
    filtro === '10d' ? lancamentosDefault :
                       dadosCustom ?? []

  const visiveis = expandido ? lancamentos : lancamentos.slice(0, LIMITE_INICIAL)
  const temMais  = lancamentos.length > LIMITE_INICIAL

  const handleFiltro = (f: Filtro) => {
    setFiltro(f)
    setExpandido(false)
    if (f !== 'custom') setDadosCustom(null)
  }

  const aplicarCustom = async () => {
    const dias = parseInt(diasCustom, 10)
    if (!dias || dias <= 0) return
    if (dias <= 10) {
      setDadosCustom(lancamentosDefault.filter(l => l.dias_para_vencer <= dias))
      return
    }
    setLoading(true)
    const supabase = getBrowserClient()
    const { data } = await supabase.rpc('get_proximos_lancamentos', { p_dias: dias })
    setDadosCustom((data as ProximoLancamento[] | null) ?? [])
    setLoading(false)
  }

  const pillClass = (f: Filtro) => [
    'text-[11px] px-2.5 py-0.5 rounded-full border transition-colors',
    filtro === f
      ? 'bg-zinc-800 text-white border-zinc-800'
      : 'text-zinc-500 border-zinc-200 hover:border-zinc-400 hover:text-zinc-700',
  ].join(' ')

  return (
    /* overflow-hidden tells CSS Grid to ignore this item's content height
       when calculating the row height → calendar drives the row height;
       this box then stretches to match via align-self:stretch + h-full  */
    <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">

      {/* Fixed header zone */}
      <div className="px-4 pt-4 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-700">Próximos Lançamentos</h3>
          <span className="text-[10px] text-zinc-400 tabular-nums">
            {lancamentos.length > LIMITE_INICIAL && !expandido
              ? `${LIMITE_INICIAL} de ${lancamentos.length}`
              : `${lancamentos.length} itens`}
          </span>
        </div>

        {/* Pills */}
        <div className="flex items-center gap-1.5 mb-3">
          <button className={pillClass('5d')}     onClick={() => handleFiltro('5d')}>5 dias</button>
          <button className={pillClass('10d')}    onClick={() => handleFiltro('10d')}>10 dias</button>
          <button className={pillClass('custom')} onClick={() => handleFiltro('custom')}>Personalizado</button>
        </div>

        {/* Custom period */}
        {filtro === 'custom' && (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="number"
              min={1}
              max={365}
              value={diasCustom}
              onChange={e => setDiasCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && aplicarCustom()}
              className="w-14 text-xs border border-zinc-200 rounded px-2 py-1 text-zinc-700 focus:outline-none focus:border-zinc-400 tabular-nums"
            />
            <span className="text-[11px] text-zinc-400">dias</span>
            <button
              onClick={aplicarCustom}
              disabled={loading}
              className="text-[11px] px-3 py-1 rounded border border-zinc-300 text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-40"
            >
              {loading ? '...' : 'Aplicar'}
            </button>
          </div>
        )}
      </div>

      {/* Scrollable list — fills remaining height */}
      {lancamentos.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-4 pb-4">
          <p className="text-xs text-zinc-400 text-center">
            {filtro === 'custom' && dadosCustom === null
              ? 'Informe um período e clique em Aplicar'
              : 'Nenhum vencimento no período selecionado'}
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto min-h-0 px-4 divide-y divide-zinc-50">
            {visiveis.map((v, i) => {
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
            })}
          </div>

          {temMais && (
            <button
              onClick={() => setExpandido(e => !e)}
              className="shrink-0 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors py-2 px-4 border-t border-zinc-100"
            >
              {expandido
                ? 'Ver menos'
                : `Ver mais (${lancamentos.length - LIMITE_INICIAL} restantes)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
