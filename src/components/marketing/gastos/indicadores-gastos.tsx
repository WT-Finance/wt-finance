'use client'

import { useMemo, type ReactNode } from 'react'
import { WalletMinimal } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { fmtBRL2 } from '@/lib/fmt'
import type { FatiaAno } from '@/lib/marketing/agregacao'
import { fmtDeltaPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import type { LinhaMesCategoria } from '@/lib/marketing/tipos'
import {
  linhasTotalPorAno, type LinhaTotalAno, type SentidoVariacao, type VariacaoVsAnterior,
} from '@/lib/marketing/total-por-ano'

// Componente B — indicadores: o card "Total de despesas no período" e, ao lado, o SLOT `proporcao`
// com o card "Proporção sobre a Receita Bruta" (`proporcao-receita.tsx`, 2 das 3 colunas): ausente,
// nada é renderizado e o total ocupa só a sua coluna. Os dois degradam de forma independente
// (leituras diferentes, regimes diferentes).
//
// O título é fixo, SEM o período (quem diz o período são as pills de ano). Sempre uma linha por ano
// selecionado — MESMO com um ano só (decisão do Yan, 09/10: o formato não muda com a seleção) —, do
// mais recente ao mais antigo, cada uma com o valor do ano e a variação % contra o ano logo abaixo
// (o mais antigo não tem), e no fim o "Acumulado" (a soma; com um ano, igual à linha).
// As contas (ordem, recorte igual com igual, Δ, acumulado, fail-closed) estão em
// `@/lib/marketing/total-por-ano` — aqui só se desenha.
//
// Variação: o sinal é o da DRE (despesa < 0), então despesa que CRESCE é Δ negativo = DESFAVORÁVEL.
// A cor nunca vai sozinha: a palavra ("favorável"/"desfavorável") vai escrita ao lado, e a tinta é a
// `-deep` (`text-negative-deep`/`text-positive-deep`), que passa AA em corpo pequeno (skill
// `ui-design-system` §1.3).
//
// Tile local, no molde do `Tile` do inventário, e não `KpiCard`: o `KpiCard` exige `KpiMetrica`
// do domínio de Performance e desenha seta ↑/↓ — que aqui reforçaria a leitura errada de uma
// despesa (negativa, no sinal da DRE).
//
// Valor com 2 casas (`fmtBRL2`), não abreviado: a página existe para bater ao centavo com a
// linha de Marketing da DRE, e "R$ -85,3 k" esconderia exatamente a diferença que se procura.
//
// Soma de anos: se algum ano selecionado não carregou, o card mostra o erro nomeando o ano — o
// total (ou a variação) dos que chegaram, sob o mesmo rótulo, seria um número errado.

const TITULO = 'Total de despesas no período'

const CLASSE_ROTULO = 'text-2xs font-semibold uppercase leading-[1.3] tracking-[0.5px] text-[var(--text-muted)]'

/** Casca branca comum aos estados do card. */
const CASCA = 'flex h-full flex-col rounded-xl bg-white px-5 py-4 shadow-sm'

const PALAVRA: Record<SentidoVariacao, { texto: string; classe: string }> = {
  favoravel: { texto: 'favorável', classe: 'text-positive-deep' },
  desfavoravel: { texto: 'desfavorável', classe: 'text-negative-deep' },
  neutro: { texto: 'estável', classe: 'text-[var(--text-muted)]' },
}

/** "−50,0% desfavorável · vs 2025 (jan–out)" — o Δ colorido COM a palavra, e a referência ao lado. */
function Variacao({ v }: { v: VariacaoVsAnterior }) {
  const palavra = v.sentido ? PALAVRA[v.sentido] : null
  return (
    <p className="mt-0.5 flex flex-wrap justify-end gap-x-1.5 text-2xs text-[var(--text-subtle)]">
      <span className={`font-semibold tabular-nums ${palavra?.classe ?? ''}`}>
        {fmtDeltaPct(v.pct)}{palavra ? ` ${palavra.texto}` : ''}
      </span>
      <span>{v.referencia}</span>
    </p>
  )
}

/** Uma linha por ano (mais recente primeiro) e o Acumulado no rodapé — com 1 ou com N anos. */
function TilePorAno({ linhas, acumulado }: { linhas: readonly LinhaTotalAno[]; acumulado: number }) {
  return (
    <div className={CASCA}>
      <div className="flex min-h-8 items-start gap-1.5">
        <p className={CLASSE_ROTULO}>{TITULO}</p>
      </div>

      <ul className="mt-1 space-y-3">
        {linhas.map(l => (
          <li key={l.ano}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span
                className="text-xs font-semibold text-[var(--text-muted)]"
                title={l.recorte ? `${l.ano} em andamento: ${l.recorte}` : undefined}
              >
                {l.rotulo}
              </span>
              <span className="shrink-0 whitespace-nowrap text-base font-extrabold leading-none tabular-nums text-zinc-800">
                {fmtBRL2(l.valor)}
              </span>
            </div>
            {l.variacao && <Variacao v={l.variacao} />}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-3 border-t border-[var(--border)] pt-3">
        <span className="text-xs font-semibold text-text-primary">Acumulado</span>
        <span className="shrink-0 whitespace-nowrap text-base font-extrabold leading-none tabular-nums text-zinc-800">
          {fmtBRL2(acumulado)}
        </span>
      </div>
    </div>
  )
}

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)") — só para a mensagem de "sem lançamentos". */
  periodo: string
  /** Os anos selecionados que carregaram, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesCategoria>[]
  /** Anos selecionados cujo resumo falhou (vazio = o total é completo). */
  anosFalha: readonly number[]
  /** Slot do card "Proporção sobre a Receita Bruta" — opcional; ausente, não renderiza nada. */
  proporcao?: ReactNode
}

export default function IndicadoresGastos({ periodo, fatias, anosFalha, proporcao }: Props) {
  const total = useMemo(() => linhasTotalPorAno(fatias, anosFalha), [fatias, anosFalha])

  // Grade de três colunas: a 1ª célula é o total (ou o erro / o vazio dele) e o slot `proporcao`
  // ocupa as outras duas. A grade é SEMPRE montada: a proporção é por competência e tem leitura
  // própria — um total que falhou (ou sem lançamento pago) não pode escondê-la, nem o contrário.
  let primeira: ReactNode
  if (!total.ok) {
    primeira = (
      <div className="flex h-full items-center rounded-xl bg-white px-5 py-4 shadow-sm">
        <ErroCarregamento
          mensagem={`Não foi possível carregar os indicadores de ${rotuloAnos(total.anosFalha)} — recarregue a página.`}
        />
      </div>
    )
  } else if (total.acumulado.qtd === 0) {
    primeira = (
      <div className="rounded-xl bg-white shadow-sm">
        <EmptyState icon={WalletMinimal} message={`Sem lançamentos pagos em ${periodo}.`} />
      </div>
    )
  } else {
    primeira = <TilePorAno linhas={total.linhas} acumulado={total.acumulado.valor} />
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {primeira}
      {proporcao}
    </div>
  )
}
