'use client'

import { useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Badge from '@/components/ui/badge'
import EmConstrucaoSecao from '@/components/shared/em-construcao-secao'
import TopSection from '@/components/shared/top-section'
import { alternarAno, serializarAnos } from '@/lib/marketing/anos'
import { carimboGeral } from '@/lib/financeiro-geral/carimbos'
import { faixaDoTopo } from '@/lib/financeiro-geral/faixa-topo'
import type { DadosGeral } from '@/lib/financeiro-geral/tipos'
import CabecalhoGeral from './cabecalho-geral'
import FaixaIndicadores from './faixa-indicadores'
import FiltroAnos from './filtro-anos'
import SecaoAntecipacoes from './secao-antecipacoes'
import SecaoPrejuizos from './secao-prejuizos'
import SecaoRecebiveis from './secao-recebiveis'

// Container client da página "Financeiro · Geral" (v6.4.0; reorganizada na v6.5.0). O servidor entrega o
// dado de cada seção (cada leitura pode falhar sozinha — `Carregado`); aqui mora só a navegação e a
// composição:
//
//  • CINCO seções, nesta ordem (decisão do Yan): Vendas · Recebíveis e inadimplência · Perdas e prejuízos ·
//    Antecipações · Cartões de crédito. Vendas e Cartões são cascas (`EmConstrucaoSecao`) até ganharem
//    versão própria.
//  • ANOS → URL (`?anos=2025,2026`, seleção múltipla, sem teto): cada ano é uma ida às RPCs, então a
//    seleção é navegação (`startTransition` + `scroll: false` — filtro no LUGAR, sem salto ao topo, com o
//    conteúdo esmaecido enquanto o servidor responde). Sem estado local: tudo deriva de `dados`.
//  • As pills valem para as seções de FLUXO (Perdas e prejuízos, Antecipações). Recebíveis (estoque) mostra
//    a posição da última carga; a faixa do topo e "Dias sem antecipação" usam sempre o ano corrente.

export default function GeralContent({ dados, mockup = false }: { dados: DadosGeral; mockup?: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const { anos, anosDisponiveis } = dados
  const indicadores = useMemo(() => faixaDoTopo(dados), [dados])
  const carimbo = useMemo(() => carimboGeral(dados), [dados])

  function alternar(ano: number) {
    const novos = alternarAno(anos, ano)
    // Nada mudou (clicou no único selecionado): sem navegação.
    if (novos.length === anos.length && novos.every((a, i) => a === anos[i])) return
    // Preserva o resto da query; troca só os anos (e descarta o `?ano=` antigo).
    const params = new URLSearchParams(searchParams.toString())
    params.set('anos', serializarAnos(novos))
    params.delete('ano')
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div className="space-y-6" aria-busy={isPending}>
      <CabecalhoGeral carimbo={carimbo} />

      {mockup && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-subtle)]">
          <Badge variant="warning">Mockup</Badge>
          Dados fictícios para aprovação do layout. Estados: <code>?estado=vazio</code> e <code>?estado=erro</code>.
        </p>
      )}

      <div className={`space-y-6 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FiltroAnos selecionados={anos} anos={anosDisponiveis} onAlternar={alternar} />
          <p className="text-xs text-[var(--text-subtle)]">
            Os anos valem para Prejuízos e Antecipações. Recebíveis mostra a posição da última carga.
          </p>
        </div>

        <FaixaIndicadores indicadores={indicadores} />

        <div>
          <TopSection titulo="Vendas">
            <EmConstrucaoSecao />
          </TopSection>

          <TopSection titulo="Recebíveis e inadimplência">
            <SecaoRecebiveis leitura={dados.recebiveis} hoje={dados.hoje} />
          </TopSection>

          <TopSection titulo="Perdas e prejuízos">
            <SecaoPrejuizos leituras={dados.prejuizos} anos={anos} hoje={dados.hoje} />
          </TopSection>

          <TopSection titulo="Antecipações">
            <SecaoAntecipacoes
              leituras={dados.antecipacoes}
              corrente={dados.corrente.antecipacoes}
              anos={anos}
              hoje={dados.hoje}
              podeGerir={dados.podeGerir}
            />
          </TopSection>

          <TopSection titulo="Cartões de crédito">
            <EmConstrucaoSecao />
          </TopSection>
        </div>
      </div>
    </div>
  )
}
