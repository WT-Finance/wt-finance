'use client'

import { useState } from 'react'
import VisualizacaoAgregadaTab from './visualizacao-agregada-tab'
import BaseDadosTab from './base-dados-tab'
import { type Lancamento } from './lancamento-row'
import { type Conta, type DiaProjecao } from './tipos'

interface Props {
  saldos: Conta[]
  projecao: DiaProjecao[]
  lancamentos: Lancamento[]
}

const PILL_BASE   = 'px-3 py-1 rounded-full text-xs font-medium border transition-colors'
const PILL_INACT  = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'
const PILL_ACTIVE = { background: 'var(--brand-soft)', borderColor: 'var(--brand)', color: 'var(--brand-deep)' }

export default function GerencialSection({ saldos, projecao, lancamentos }: Props) {
  const [tab, setTab] = useState<'agregada' | 'base'>('agregada')

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <button
          className={`${PILL_BASE} ${tab === 'agregada' ? '' : PILL_INACT}`}
          style={tab === 'agregada' ? PILL_ACTIVE : undefined}
          onClick={() => setTab('agregada')}
        >
          Visualização Agregada
        </button>
        <button
          className={`${PILL_BASE} ${tab === 'base' ? '' : PILL_INACT}`}
          style={tab === 'base' ? PILL_ACTIVE : undefined}
          onClick={() => setTab('base')}
        >
          Base de Dados
        </button>
      </div>
      {tab === 'agregada'
        ? <VisualizacaoAgregadaTab saldos={saldos} projecao={projecao} />
        : <BaseDadosTab lancamentos={lancamentos} />
      }
    </div>
  )
}
