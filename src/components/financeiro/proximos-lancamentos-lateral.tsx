'use client'

import { useState } from 'react'
import { fmtBRL } from '@/lib/fmt'

interface ProximoVencimento {
  numero:           string | null
  vencimento:       string
  pessoa:           string | null
  descricao:        string | null
  valor_final:      number
  tipo:             'Entrada' | 'Saída'
  status:           string
  dias_para_vencer: number
  aging:            'a_vencer' | 'vencido_ate_30d' | 'vencido_30_a_90d' | 'vencido_mais_90d'
}

interface Props {
  vencimentos: ProximoVencimento[]
}

const LIMITE_INICIAL = 10
const LIMITE_EXPANDIDO = 30

function formatDateShort(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

export default function ProximosLancamentosLateral({ vencimentos }: Props) {
  const [expandido, setExpandido] = useState(false)

  // Filtrar próximos 10 dias (a_vencer com dias 0-10)
  const filtrados = vencimentos
    .filter(v => v.dias_para_vencer >= 0 && v.dias_para_vencer <= 10)
    .sort((a, b) => {
      // Ordenar por vencimento asc, depois por valor desc
      if (a.vencimento < b.vencimento) return -1
      if (a.vencimento > b.vencimento) return 1
      return b.valor_final - a.valor_final
    })

  const limite = expandido ? LIMITE_EXPANDIDO : LIMITE_INICIAL
  const visiveis = filtrados.slice(0, limite)
  const temMais  = filtrados.length > LIMITE_INICIAL

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm h-full">
      {/* Title */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-zinc-700">Próximos Lançamentos (10d)</h3>
        <span className="text-[10px] text-zinc-400 tabular-nums">
          {filtrados.length} itens
        </span>
      </div>

      {filtrados.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-zinc-400">Nenhum vencimento nos próximos 10 dias</p>
        </div>
      ) : (
        <>
          <div className="space-y-0 divide-y divide-zinc-50">
            {visiveis.map((v, i) => {
              const isEntrada = v.tipo === 'Entrada'
              const isHoje    = v.dias_para_vencer === 0

              return (
                <div key={v.numero ?? i} className="py-2 flex items-start justify-between gap-2">
                  {/* Left: date badge + content */}
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {/* Date badge */}
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

                    {/* Person + description */}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-zinc-700 truncate font-medium leading-snug">
                        {v.pessoa ?? '—'}
                      </p>
                      {v.descricao && (
                        <p className="text-[10px] text-zinc-400 truncate leading-snug">
                          {v.descricao}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: badge + value */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={[
                      'inline-block px-1.5 py-0.5 rounded text-[9px] font-medium',
                      isEntrada
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700',
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

          {/* Ver mais / menos */}
          {temMais && (
            <button
              onClick={() => setExpandido(e => !e)}
              className="mt-3 w-full text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors py-1"
            >
              {expandido
                ? 'Ver menos'
                : `Ver mais (${filtrados.length - LIMITE_INICIAL} restantes)`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
