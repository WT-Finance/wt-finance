'use client'

import { useState } from 'react'
import {
  Building2,
  Zap,
  CreditCard,
  Coins,
  Wallet,
  MoreHorizontal,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { fmtBRL } from '@/lib/fmt'

interface PosicaoConta {
  conta: string
  tipo_conta: string
  saldo: number
}

interface Props {
  posicoes: PosicaoConta[]
  saldoTotal: number
}

const MAX_POR_GRUPO = 5

const TIPO_ORDEM = [
  'banco',
  'gateway',
  'cartao_credito',
  'caixa_fisico',
  'carteira_interna',
  'outro',
  'investimento',
] as const

const TIPO_LABEL: Record<string, string> = {
  banco:            'Banco',
  gateway:          'Gateway',
  cartao_credito:   'Cartão de Crédito',
  caixa_fisico:     'Caixa Físico',
  carteira_interna: 'Carteira',
  outro:            'Outro',
  investimento:     'Investimento',
}

const TIPO_ICON: Record<string, React.ReactNode> = {
  banco:            <Building2 size={14} />,
  gateway:          <Zap size={14} />,
  cartao_credito:   <CreditCard size={14} />,
  caixa_fisico:     <Coins size={14} />,
  carteira_interna: <Wallet size={14} />,
  outro:            <MoreHorizontal size={14} />,
  investimento:     <TrendingUp size={14} />,
}

function getLabel(tipo: string): string {
  return TIPO_LABEL[tipo] ?? tipo
}

function getIcon(tipo: string): React.ReactNode {
  return TIPO_ICON[tipo] ?? <MoreHorizontal size={14} />
}

interface GrupoData {
  tipo: string
  label: string
  contas: PosicaoConta[]
  total: number
}

function GrupoRow({ grupo }: { grupo: GrupoData }) {
  const [expandido, setExpandido] = useState(false)
  const [verMais, setVerMais] = useState(false)

  const contasVisiveis = verMais ? grupo.contas : grupo.contas.slice(0, MAX_POR_GRUPO)
  const ocultas = grupo.contas.length - MAX_POR_GRUPO
  const corTotal = grupo.total >= 0 ? 'var(--positive)' : 'var(--negative)'

  return (
    <div>
      {/* Header do grupo */}
      <button
        onClick={() => setExpandido(e => !e)}
        className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-zinc-50 transition-colors text-left group"
      >
        <div className="flex items-center gap-2 text-zinc-500">
          <span className="text-zinc-400 group-hover:text-zinc-500 transition-colors">
            {getIcon(grupo.tipo)}
          </span>
          <span className="text-xs font-medium text-zinc-700">{grupo.label}</span>
          <span className="text-3xs text-zinc-400">· {grupo.contas.length} {grupo.contas.length === 1 ? 'conta' : 'contas'}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-xs font-medium tabular-nums"
            style={{ color: corTotal }}
          >
            {fmtBRL(grupo.total)}
          </span>
          <span className="text-zinc-300">
            {expandido ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </div>
      </button>

      {/* Linhas de contas */}
      {expandido && (
        <div className="ml-2 mt-0.5 border-l border-zinc-100 pl-4 space-y-0">
          {contasVisiveis.map(p => (
            <div
              key={p.conta}
              className="flex justify-between items-center py-1.5 border-b border-zinc-50 last:border-0"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs text-zinc-700 font-medium truncate">{p.conta}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded text-3xs bg-zinc-100 text-zinc-400">
                  {getLabel(p.tipo_conta)}
                </span>
              </div>
              <span
                className="text-xs font-medium tabular-nums shrink-0 ml-2"
                style={{ color: p.saldo >= 0 ? 'var(--positive)' : 'var(--negative)' }}
              >
                {fmtBRL(p.saldo)}
              </span>
            </div>
          ))}
          {grupo.contas.length > MAX_POR_GRUPO && (
            <button
              onClick={() => setVerMais(v => !v)}
              className="mt-1 text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {verMais ? 'Ver menos' : `Ver mais (${ocultas})`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function PosicaoPorConta({ posicoes, saldoTotal }: Props) {
  if (posicoes.length === 0) {
    return <p className="text-xs text-zinc-400">Sem dados</p>
  }

  // Group by tipo_conta
  const gruposMap = new Map<string, PosicaoConta[]>()
  for (const p of posicoes) {
    if (!gruposMap.has(p.tipo_conta)) gruposMap.set(p.tipo_conta, [])
    gruposMap.get(p.tipo_conta)!.push(p)
  }

  // Build ordered group list
  const tiposConhecidos = new Set(TIPO_ORDEM as readonly string[])
  const tiposExtras = [...gruposMap.keys()].filter(t => !tiposConhecidos.has(t)).sort()
  const ordemFinal = [...TIPO_ORDEM, ...tiposExtras]

  const grupos: GrupoData[] = ordemFinal
    .filter(tipo => gruposMap.has(tipo))
    .map(tipo => {
      const contas = gruposMap.get(tipo)!
      return {
        tipo,
        label: getLabel(tipo),
        contas,
        total: contas.reduce((s, c) => s + c.saldo, 0),
      }
    })

  return (
    <div>
      <div className="space-y-0.5">
        {grupos.map(grupo => (
          <GrupoRow key={grupo.tipo} grupo={grupo} />
        ))}
      </div>

      {/* Total geral */}
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-zinc-200 px-2">
        <span className="text-xs font-semibold text-zinc-600">Total Geral</span>
        <span
          className="text-xs font-semibold tabular-nums"
          style={{ color: saldoTotal >= 0 ? 'var(--positive)' : 'var(--negative)' }}
        >
          {fmtBRL(saldoTotal)}
        </span>
      </div>
    </div>
  )
}
