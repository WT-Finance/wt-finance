'use client'

import { useMemo } from 'react'
import { Users } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { ValorContabil } from '@/components/shared/valor-contabil'
import { Card } from '@/components/ui/card'
import { rankingFornecedoresPeriodo, type FatiaAno } from '@/lib/marketing/agregacao'
import { fmtPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import type { LinhaMesFornecedor } from '@/lib/marketing/tipos'
import CabecalhoCard from './cabecalho-card'

// Componente E — ranking por fornecedor do período: valor, % do total e nº de lançamentos.
// Soma os anos selecionados (cada um no seu recorte). É só leitura: não há mais tabela de
// lançamentos, então a linha NÃO é clicável e não há estado de seleção. O fornecedor vazio aparece
// como "(sem fornecedor)" e nunca some do ranking.
//
// Falha isolada: se a leitura do ranking cai em algum ano selecionado, este card é OMITIDO com um
// aviso discreto (`ErroCarregamento`, sem alarme) — somar só os anos que chegaram daria um ranking
// que não fecha com o total — e o resto da página segue de pé (invariante 14).
//
// O valor segue o sinal da DRE; a barra usa o módulo SÓ como comprimento (geometria), nunca como
// número exibido.

const COR_BARRA = 'var(--action-soft-border)'

interface Props {
  /** Rótulo do período ("2025 + 2026 (até out)"). */
  periodo: string
  /** Os anos selecionados cujo ranking carregou, cada um no seu recorte. */
  fatias: readonly FatiaAno<LinhaMesFornecedor>[]
  /** Anos selecionados cuja leitura do ranking falhou. */
  anosFalha: readonly number[]
}

export default function RankingFornecedores({ periodo, fatias, anosFalha }: Props) {
  const ranking = useMemo(() => rankingFornecedoresPeriodo(fatias), [fatias])

  if (anosFalha.length > 0) {
    return (
      <ErroCarregamento
        className="px-1"
        mensagem={`Ranking por fornecedor indisponível para ${rotuloAnos(anosFalha)} — o restante da página segue normal.`}
      />
    )
  }

  if (ranking.qtd === 0) {
    return (
      <Card>
        <CabecalhoCard titulo="Por fornecedor" subtitulo={periodo} />
        <EmptyState icon={Users} message={`Sem lançamentos pagos em ${periodo}.`} />
      </Card>
    )
  }

  // Só geometria (comprimento da barra): o piso evita 0/0 quando o período soma zero.
  const maior = Math.max(0.01, ...ranking.linhas.map(l => Math.abs(l.valor)))

  return (
    <Card>
      <CabecalhoCard
        titulo="Por fornecedor"
        subtitulo={`${periodo} · ${ranking.linhas.length} ${ranking.linhas.length === 1 ? 'fornecedor' : 'fornecedores'}`}
      />

      {/* Cabeçalho das colunas (some em tela estreita, onde a linha vira nome + % + valor). */}
      <div className="hidden items-center gap-3 px-3 pb-1 text-2xs font-medium text-[var(--text-muted)] sm:flex">
        <span className="w-56 shrink-0">Fornecedor</span>
        <span className="min-w-0 flex-1" />
        <span className="w-14 shrink-0 text-right">% do total</span>
        <span className="w-16 shrink-0 text-right">Lanç.</span>
        <span className="w-36 shrink-0 text-right">Valor</span>
      </div>

      <div className="pr-1.5">
        <ScrollAutoHide className="max-h-[360px] pr-3.5">
          <ul className="space-y-0.5">
            {ranking.linhas.map(l => (
              <li key={l.chave === '' ? '__sem__' : l.chave}>
                <div className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 transition-colors hover:bg-[var(--surface-soft)]">
                  <span
                    className={`min-w-0 flex-1 truncate text-xs sm:w-56 sm:flex-none sm:shrink-0 ${l.chave === '' ? 'italic text-[var(--text-muted)]' : 'text-zinc-700'}`}
                    title={l.rotulo}
                  >
                    {l.rotulo}
                  </span>
                  <span className="hidden min-w-0 flex-1 sm:block" aria-hidden>
                    <span
                      className="block h-2 rounded-full"
                      style={{ width: `${Math.max(2, (Math.abs(l.valor) / maior) * 100)}%`, background: COR_BARRA }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right text-2xs tabular-nums text-[var(--text-muted)]">{fmtPct(l.pct)}</span>
                  <span className="hidden w-16 shrink-0 text-right text-2xs tabular-nums text-[var(--text-muted)] sm:block">{l.qtd}</span>
                  <span className="w-36 shrink-0 text-xs text-zinc-800"><ValorContabil valor={l.valor} /></span>
                </div>
              </li>
            ))}
          </ul>
        </ScrollAutoHide>
      </div>
    </Card>
  )
}
