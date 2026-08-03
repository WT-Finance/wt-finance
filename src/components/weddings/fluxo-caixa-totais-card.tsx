'use client'

import type { ReactNode } from 'react'
import { fmtBRL } from '@/lib/fmt'

// Card de TOTAIS do Fluxo de Caixa de Weddings (v5.4.2/M2).
//
// Saiu do cabeçalho do gráfico mensal e ganhou card próprio, acima dos gráficos.
// O FILTRO por operação vive dentro deste card (slot `filtro`), à direita: ele vale
// para o card de totais E para o card dos gráficos, e ficar solto no fundo da página
// não dizia a que pertencia.
//
// A semântica: estes totais são o COMPROMISSO TOTAL da operação filtrada — tudo que
// está em aberto ('A Receber Futuro' / 'A Pagar Futuro') — e NÃO o recorte da janela
// do slider. Isso não é escolha do componente: a RPC calcula os dois totais SEM
// filtro de data (só por operação), em `get_acumulado_weddings__nucleo` (0141), e foi
// medido idêntico em janelas diferentes. A frase que explicava isso na tela saiu a
// pedido do Yan — a garantia continua no ADR-0162 e no out-briefing, não na interface.

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
  /** Filtro por operação, renderizado à direita dentro do card. */
  filtro?: ReactNode
}

export default function FluxoCaixaTotaisCard({ totalAReceber, totalAPagar, filtro }: Props) {
  const semTotais = totalAReceber == null && totalAPagar == null
  // Mesmo sem totais o card permanece, porque agora ele hospeda o filtro.
  if (semTotais && !filtro) return null

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* Os dois KPIs dividem o espaço do card NÃO ocupado pelo filtro em duas
            metades iguais (`flex-1` cada), então a régua vertical cai exatamente no
            MEIO desse espaço. O bloco do filtro é `shrink-0`, então é a largura dele
            que define o espaço restante.
            Dentro das metades, os dois valores alinham à ESQUERDA (decisão do Yan): o
            "a receber" na borda do card e o "a pagar" logo após a régua — encostar o
            primeiro na régua deixava a leitura começando no meio do card. */}
        <div className="flex flex-1 items-center min-w-0">
          <div className="flex flex-1 pr-6 min-w-0">
            {totalAReceber != null && (
              <Total label="Total a receber" valor={totalAReceber} cor={COR_RECEBER} />
            )}
          </div>
          {totalAReceber != null && totalAPagar != null && (
            <span aria-hidden className="w-px self-stretch bg-zinc-200 shrink-0" />
          )}
          <div className="flex flex-1 pl-6 min-w-0">
            {totalAPagar != null && (
              <Total label="Total a pagar" valor={totalAPagar} cor={COR_PAGAR} />
            )}
          </div>
        </div>

        {filtro && (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-[var(--text-muted)]">Filtrar por operação:</span>
            {filtro}
          </div>
        )}
      </div>
    </div>
  )
}
