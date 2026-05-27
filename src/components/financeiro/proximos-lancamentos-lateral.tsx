'use client'

import { useState } from 'react'
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

const LIMITE_INICIAL = 9

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function ProximosLancamentosLateral({ lancamentos }: Props) {
  const [expandido, setExpandido] = useState(false)

  const visiveis = expandido ? lancamentos : lancamentos.slice(0, LIMITE_INICIAL)
  const temMais  = lancamentos.length > LIMITE_INICIAL

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700">Próximos Lançamentos (10d)</h3>
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {lancamentos.length > LIMITE_INICIAL && !expandido
            ? `${LIMITE_INICIAL} de ${lancamentos.length}`
            : `${lancamentos.length} itens`}
        </span>
      </div>

      {lancamentos.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-zinc-400">Nenhum vencimento nos próximos 10 dias</p>
        </div>
      ) : (
        <>
          <div className="divide-y divide-zinc-50">
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
              className="mt-3 w-full text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors py-1 border-t border-zinc-50"
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
