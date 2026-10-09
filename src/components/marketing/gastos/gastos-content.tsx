'use client'

import { useMemo, useTransition, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { alternarAno, serializarAnos } from '@/lib/marketing/anos'
import { fatiasDeFornecedores, fatiasDeResumo, ultimaCargaDe } from '@/lib/marketing/fatias'
import { rotuloPeriodoAnos } from '@/lib/marketing/periodo'
import type { DadosGastosMarketing } from '@/lib/marketing/tipos'
import CabecalhoGastos from './cabecalho-gastos'
import FiltroGlobal from './filtro-global'
import IndicadoresGastos from './indicadores-gastos'
import RankingFornecedores from './ranking-fornecedores'
import SerieMensal from './serie-mensal'
import TabelaCategorias from './tabela-categorias'

// Container client da página "Despesas de Marketing" (v6.3.0). O servidor entrega o dado de CADA
// ano selecionado (cada leitura pode falhar sozinha — `Carregado`); aqui mora só a navegação:
//
//  • ANOS    → URL (`?anos=2025,2026`, seleção múltipla, sem teto): cada ano é uma ida às RPCs, então
//              a seleção é navegação (`startTransition` + `scroll: false` — filtro no LUGAR, sem
//              salto ao topo, com o conteúdo esmaecido enquanto o servidor responde). Não há estado
//              local: tudo o que os cards mostram deriva de `dados`.
//  • PERÍODO → NÃO é estado: é a união dos anos selecionados, cada um no seu recorte
//              (`recortePadrao`: ano fechado = jan–dez; ano corrente = jan até o mês corrente),
//              derivado dos anos e do `hoje` do servidor.
//
// Todos os cards leem as MESMAS fatias por ano. Quem SOMA anos (total, tabela, ranking) mostra erro
// se algum ano selecionado não carregou — somar só os que chegaram daria um total menor sob o mesmo
// rótulo; o gráfico desenha os anos que chegaram e avisa dos ausentes.
//
// `proporcao` é o SLOT do card "Proporção sobre a Receita Bruta" (`proporcao-receita.tsx`, montado
// pela página com a leitura própria de cada ano): aparece ao lado do total; ausente, nada é renderizado.

interface Props {
  dados: DadosGastosMarketing
  proporcao?: ReactNode
}

export default function GastosContent({ dados, proporcao }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const { anos, hoje, anosDisponiveis, porAno } = dados

  const periodo = useMemo(() => rotuloPeriodoAnos(anos, hoje), [anos, hoje])
  const resumo = useMemo(() => fatiasDeResumo(porAno, hoje), [porAno, hoje])
  const fornecedores = useMemo(() => fatiasDeFornecedores(porAno, hoje), [porAno, hoje])
  const ultimaCarga = useMemo(() => ultimaCargaDe(porAno), [porAno])

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
      <CabecalhoGastos ultimaCarga={ultimaCarga} />

      <div className={`space-y-6 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
        <FiltroGlobal selecionados={anos} anos={anosDisponiveis} onAlternar={alternar} />

        <IndicadoresGastos
          periodo={periodo}
          fatias={resumo.fatias}
          anosFalha={resumo.anosFalha}
          proporcao={proporcao}
        />

        <SerieMensal
          periodo={periodo}
          anos={anos}
          fatias={resumo.fatias}
          anosFalha={resumo.anosFalha}
        />

        <TabelaCategorias
          periodo={periodo}
          fatias={resumo.fatias}
          anosFalha={resumo.anosFalha}
        />

        <RankingFornecedores
          periodo={periodo}
          fatias={fornecedores.fatias}
          anosFalha={fornecedores.anosFalha}
        />
      </div>
    </div>
  )
}
