'use client'

// Faturamento Corporativo — wrapper de ABAS (v4.33.0/Fase 3). Estrutura de abas por cima do
// que já existe: "Emissão" (Fases 1a/1b/2 — <FaturamentoCorp> BYTE-IDÊNTICO, não-regressão) e
// "Cadastro de Clientes" (Fase 3). Molde: gerencial-section.tsx (abas sempre montadas, alterna
// por `hidden` p/ preservar o estado local de cada aba). A11y: role=tablist/tab/tabpanel.

import { useState } from 'react'
import FaturamentoCorp, { AmbienteBadge } from './faturamento-corp'
import CadastroClientes, { type ClienteCorp } from './cadastro-clientes'
import type { AsaasAmbiente } from '@/lib/asaas/client'

interface Props {
  ambiente:    AsaasAmbiente
  configurado: boolean
  clientes:    ClienteCorp[]
}

const PILL = 'foco-neutro rounded-full border px-3 py-1 text-xs font-medium transition-colors'
const ATIVO = 'border-action-soft-border bg-action-soft text-action-primary'
const INATIVO = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'

export default function FaturamentoCorpContent({ ambiente, configurado, clientes }: Props) {
  const [aba, setAba] = useState<'emissao' | 'cadastro'>('emissao')

  return (
    <div>
      {/* Título + subtítulo da PÁGINA (compartilhados: persistem ao trocar de aba) + badge de
          ambiente. As pills das abas ficam ABAIXO do título/subtítulo. */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Faturamento Corporativo</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Emita boletos e notas fiscais e gerencie o cadastro dos clientes corporativos.
          </p>
        </div>
        <AmbienteBadge ambiente={ambiente} configurado={configurado} />
      </div>

      <div role="tablist" aria-label="Faturamento Corporativo" className="flex gap-2 mb-6">
        <button role="tab" id="tab-emissao" aria-selected={aba === 'emissao'} aria-controls="painel-emissao"
          onClick={() => setAba('emissao')} className={`${PILL} ${aba === 'emissao' ? ATIVO : INATIVO}`}>
          Emissão
        </button>
        <button role="tab" id="tab-cadastro" aria-selected={aba === 'cadastro'} aria-controls="painel-cadastro"
          onClick={() => setAba('cadastro')} className={`${PILL} ${aba === 'cadastro' ? ATIVO : INATIVO}`}>
          Cadastro de Clientes
        </button>
      </div>

      {/* Ambas SEMPRE montadas (alterna por hidden) — preserva o estado local de cada aba. */}
      <div role="tabpanel" id="painel-emissao" aria-labelledby="tab-emissao" className={aba === 'emissao' ? '' : 'hidden'}>
        <FaturamentoCorp ambiente={ambiente} configurado={configurado} />
      </div>
      <div role="tabpanel" id="painel-cadastro" aria-labelledby="tab-cadastro" className={aba === 'cadastro' ? '' : 'hidden'}>
        <CadastroClientes clientes={clientes} />
      </div>
    </div>
  )
}
