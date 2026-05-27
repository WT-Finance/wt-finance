'use client'

import { useState } from 'react'
import { fmtBRL } from '@/lib/fmt'

interface DecomposicaoGrupo {
  grupo_categoria: string
  sinal: 'entrada' | 'saida'
  valor_total: number
}

interface Props {
  entradas: DecomposicaoGrupo[]  // already filtered sinal === 'entrada', sorted by valor_total desc
  saidas: DecomposicaoGrupo[]    // already filtered sinal === 'saida', sorted by valor_total desc
}

const MAX_VISIBLE = 5

function GrupoBlock({
  items,
  label,
  cor,
}: {
  items: DecomposicaoGrupo[]
  label: string
  cor: 'positive' | 'negative'
}) {
  const [expandido, setExpandido] = useState(false)

  const total = items.reduce((s, i) => s + i.valor_total, 0)
  const visiveis = expandido ? items : items.slice(0, MAX_VISIBLE)
  const ocultos = items.length - MAX_VISIBLE

  return (
    <div>
      <p className="text-xs mb-3 font-medium" style={{ color: `var(--${cor})` }}>
        {label}
      </p>
      <div className="space-y-2.5">
        {visiveis.map(item => {
          const pct = total > 0 ? (item.valor_total / total) * 100 : 0
          return (
            <div key={item.grupo_categoria}>
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-xs text-zinc-600 truncate pr-2 min-w-0">
                  {item.grupo_categoria || '(sem categoria)'}
                </span>
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-[10px] text-zinc-400">
                    {total > 0 ? `${pct.toFixed(1)}%` : '—'}
                  </span>
                  <span className="text-xs font-medium text-zinc-800 tabular-nums">
                    {fmtBRL(item.valor_total)}
                  </span>
                </div>
              </div>
              <div className="h-[3px] rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct.toFixed(1)}%`,
                    background: `var(--${cor})`,
                    opacity: 0.4,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {items.length > MAX_VISIBLE && (
        <button
          onClick={() => setExpandido(e => !e)}
          className="mt-2 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
        >
          {expandido ? 'Ver menos' : `Ver mais (${ocultos})`}
        </button>
      )}
    </div>
  )
}

export default function ComposicaoPeriodo({ entradas, saidas }: Props) {
  if (!entradas.length && !saidas.length) {
    return <p className="text-xs text-zinc-400">Sem dados</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {entradas.length > 0 && (
        <GrupoBlock items={entradas} label="Entradas por grupo" cor="positive" />
      )}
      {saidas.length > 0 && (
        <GrupoBlock items={saidas} label="Saídas por grupo" cor="negative" />
      )}
    </div>
  )
}
