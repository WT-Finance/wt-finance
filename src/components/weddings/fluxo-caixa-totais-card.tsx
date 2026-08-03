'use client'

import { fmtBRL } from '@/lib/fmt'

// Card de TOTAIS do Fluxo de Caixa de Weddings (v5.4.2/M2).
//
// Saiu do cabeçalho do gráfico mensal e ganhou card próprio, acima dos gráficos.
//
// A semântica que o rótulo precisa deixar explícita: estes totais são o
// COMPROMISSO TOTAL da operação filtrada — tudo que está em aberto ('A Receber
// Futuro' / 'A Pagar Futuro') — e NÃO o recorte da janela do slider. Um
// compromisso assumido não é um recorte de tempo. Isso não é uma escolha do
// componente: a RPC calcula os dois totais SEM filtro de data (só por operação),
// em `get_acumulado_weddings__nucleo` (migration 0141) — então eles não variam
// quando a janela muda, por construção. O filtro de operação, sim, os afeta.

const COR_RECEBER = 'var(--chart-fluxo-entrada)'
const COR_PAGAR   = 'var(--chart-fluxo-saida)'

function Total({ label, valor, cor }: { label: string; valor: number; cor: string }) {
  // `shrink-0`: item de flex encolhe abaixo do próprio conteúdo por default
  // (`flex-shrink: 1`), e aí o valor de 8 dígitos INVADE o total vizinho. Pego na
  // conferência visual do mockup — não aparece em tsc/lint/build.
  return (
    <div className="flex flex-col gap-0.5 shrink-0">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      <span className="text-xl font-semibold tabular-nums" style={{ color: cor }}>
        {fmtBRL(valor)}
      </span>
    </div>
  )
}

interface Props {
  totalAReceber?: number
  totalAPagar?:   number
  /** Sufixo do escopo (operação filtrada), quando houver. */
  operacaoLabel?: string
}

export default function FluxoCaixaTotaisCard({ totalAReceber, totalAPagar, operacaoLabel }: Props) {
  if (totalAReceber == null && totalAPagar == null) return null

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
          {totalAReceber != null && (
            <Total label="Total a receber" valor={totalAReceber} cor={COR_RECEBER} />
          )}
          {totalAPagar != null && (
            <Total label="Total a pagar" valor={totalAPagar} cor={COR_PAGAR} />
          )}
        </div>
        <p className="text-xs text-[var(--text-muted)] max-w-md">
          Compromisso total em aberto
          {operacaoLabel ? ` de ${operacaoLabel}` : ' das operações selecionadas'} —
          {' '}<strong className="font-medium">não</strong> muda com a janela dos gráficos.
        </p>
      </div>
    </div>
  )
}
