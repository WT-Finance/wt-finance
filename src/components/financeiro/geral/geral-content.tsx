'use client'

import { useMemo, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import EmConstrucaoSecao from '@/components/shared/em-construcao-secao'
import TopSection from '@/components/shared/top-section'
import { alternarAno, serializarAnos } from '@/lib/marketing/anos'
import { carimbosDaPagina } from '@/lib/financeiro-geral/carimbos'
import { faixaDoTopo } from '@/lib/financeiro-geral/faixa-topo'
import type { DadosGeral } from '@/lib/financeiro-geral/tipos'
import CabecalhoGeral from './cabecalho-geral'
import FaixaIndicadores from './faixa-indicadores'
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
//  • ANOS → URL, só em "Perdas e prejuízos" (`?prejuizos=2025,2026`, seleção múltipla, sem teto). Cada ano é
//    uma ida às RPCs, então a seleção é navegação (`startTransition` + `scroll: false` — filtro no LUGAR, sem
//    salto ao topo, com o conteúdo esmaecido enquanto o servidor responde). Sem estado local: tudo deriva de
//    `dados`. O antigo `?anos=` segue aceito como valor inicial; ao primeiro clique é trocado por `?prejuizos=`.
//    As pills valem só para "Prejuízo por Pessoa"; o "Prejuízo Mensal" e "Antecipações" são fixos no ano
//    corrente e nos dois anteriores.
//  • Recebíveis (estoque) mostra a posição da última carga e não tem pills; a faixa do topo e "Dias sem
//    antecipação" usam sempre o ano corrente.
//  • A data de atualização de cada base mora no CABEÇALHO (uma linha por fonte), não nas seções.

export default function GeralContent({ dados }: { dados: DadosGeral }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const { anosPrejuizos, anosAntecipacoes, anosDisponiveis } = dados
  const indicadores = useMemo(() => faixaDoTopo(dados), [dados])
  const carimbos = useMemo(() => carimbosDaPagina(dados), [dados])

  function alternarAnoPrejuizos(ano: number) {
    const novos = alternarAno(anosPrejuizos, ano)
    // Nada mudou (clicou no único selecionado): sem navegação.
    if (novos.length === anosPrejuizos.length && novos.every((a, i) => a === anosPrejuizos[i])) return
    // Preserva o resto da query. Grava só `?prejuizos=`; o antigo `?anos=`/`?ano=` e o extinto `?antecipacoes=`
    // (links salvos) saem da URL — Antecipações é fixa e não lê parâmetro nenhum.
    const params = new URLSearchParams(searchParams.toString())
    params.set('prejuizos', serializarAnos(novos))
    params.delete('anos')
    params.delete('ano')
    params.delete('antecipacoes')
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div className="space-y-6" aria-busy={isPending}>
      <CabecalhoGeral carimbos={carimbos} />

      <div className={`space-y-6 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
        <FaixaIndicadores indicadores={indicadores} />

        <div>
          <TopSection titulo="Vendas">
            <EmConstrucaoSecao />
          </TopSection>

          <TopSection titulo="Recebíveis e inadimplência">
            <SecaoRecebiveis leitura={dados.recebiveis} hoje={dados.hoje} />
          </TopSection>

          <TopSection titulo="Perdas e prejuízos">
            <SecaoPrejuizos
              leituras={dados.prejuizos}
              leiturasMensal={dados.prejuizosMensal}
              anos={anosPrejuizos}
              anosDisponiveis={anosDisponiveis}
              onAlternarAno={alternarAnoPrejuizos}
              hoje={dados.hoje}
            />
          </TopSection>

          <TopSection titulo="Antecipações">
            <SecaoAntecipacoes
              leituras={dados.antecipacoes}
              corrente={dados.corrente.antecipacoes}
              anos={anosAntecipacoes}
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
