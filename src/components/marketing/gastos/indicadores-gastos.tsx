'use client'

import { useMemo, type ReactNode } from 'react'
import { WalletMinimal } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { fmtBRL2 } from '@/lib/fmt'
import { totalDoPeriodo, type FatiaAno } from '@/lib/marketing/agregacao'
import { rotuloAnos } from '@/lib/marketing/periodo'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'

// Componente B — indicadores. Hoje UM card: "Total de despesas no período" (a soma dos anos
// selecionados, cada um no seu recorte). Ao lado dele há um SLOT (`proporcao`) para o card
// "Proporção sobre a Receita Bruta", que outra missão monta: ausente, nada é renderizado e o total
// ocupa só a sua coluna.
//
// Tile local, no molde do `Tile` do inventário, e não `KpiCard`: o `KpiCard` exige `KpiMetrica`
// do domínio de Performance e desenha seta ↑/↓ — que aqui reforçaria a leitura errada de uma
// despesa (negativa, no sinal da DRE).
//
// Valor com 2 casas (`fmtBRL2`), não abreviado: a página existe para bater ao centavo com a
// linha de Marketing da DRE, e "R$ -85,3 k" esconderia exatamente a diferença que se procura.
//
// Soma de anos: se algum ano selecionado não carregou, o card mostra o erro nomeando o ano — o
// total dos que chegaram, sob o rótulo "no período", seria um número errado.

const plural = (n: number) => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`

function Tile({ rotulo, valor, children }: {
  rotulo: string
  valor: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-white px-5 py-4 shadow-sm">
      <div className="flex min-h-8 items-start gap-1.5">
        <p className="text-2xs font-semibold uppercase leading-[1.3] tracking-[0.5px] text-[var(--text-muted)]">
          {rotulo}
        </p>
      </div>
      <p
        className="mt-auto whitespace-nowrap pt-1 font-extrabold leading-none tabular-nums text-zinc-800"
        style={{ fontSize: 'clamp(16px, 1.7vw, 26px)' }}
      >
        {valor}
      </p>
      <div className="mt-1.5 min-h-8 space-y-0.5 text-2xs text-[var(--text-subtle)]">{children}</div>
    </div>
  )
}

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou (vazio = o total é completo). */
  anosFalha: readonly number[]
  /** Slot do card "Proporção sobre a Receita Bruta" — opcional; ausente, não renderiza nada. */
  proporcao?: ReactNode
}

export default function IndicadoresGastos({ periodo, fatias, anosFalha, proporcao }: Props) {
  const total = useMemo(() => totalDoPeriodo(fatias), [fatias])

  if (anosFalha.length > 0) {
    return (
      <ErroCarregamento
        mensagem={`Não foi possível carregar os indicadores de ${rotuloAnos(anosFalha)} — recarregue a página.`}
      />
    )
  }
  if (total.qtd === 0) {
    return (
      <div className="rounded-xl bg-white shadow-sm">
        <EmptyState icon={WalletMinimal} message={`Sem lançamentos pagos em ${periodo}.`} />
      </div>
    )
  }

  // Mesma grade de três colunas de antes: um card ocupa 1/3, dois ocupam 2/3 (total + proporção).
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile rotulo={`Total de despesas no período · ${periodo}`} valor={fmtBRL2(total.valor)}>
        <p>{plural(total.qtd)}</p>
      </Tile>
      {proporcao}
    </div>
  )
}
