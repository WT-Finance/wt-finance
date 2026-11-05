'use client'

import { useMemo, type ReactNode } from 'react'
import { fatiasDeFornecedores, fatiasDeResumo, ultimaCargaDe } from '@/lib/marketing/fatias'
import { rotuloPeriodoAnos } from '@/lib/marketing/periodo'
import type { DadosGastosMarketing } from '@/lib/marketing/tipos'
import CabecalhoGastos from './cabecalho-gastos'
import IndicadoresGastos from './indicadores-gastos'
import RankingFornecedores from './ranking-fornecedores'
import SerieMensal from './serie-mensal'
import TabelaCategorias from './tabela-categorias'

// Container client da página "Despesas de Marketing" (v6.3.0; v6.5.0: sem filtro de anos). O servidor
// entrega o dado de CADA um dos 3 anos fixos — o corrente e os dois anteriores (cada leitura pode
// falhar sozinha — `Carregado`); aqui não há navegação nem estado local: tudo o que os cards
// mostram deriva de `dados`.
//
//  • PERÍODO → derivado dos anos e do `hoje` do servidor: a união dos anos, cada um no seu recorte
//              (`recortePadrao`: ano fechado = jan–dez; ano corrente = jan até o mês corrente).
//
// Todos os cards leem as MESMAS fatias por ano. Quem SOMA anos (total, tabela, ranking) mostra erro
// se algum ano não carregou — somar só os que chegaram daria um total menor sob o mesmo
// rótulo; o gráfico desenha os anos que chegaram e avisa dos ausentes.
//
// `proporcao` é o SLOT do card "Proporção sobre a Receita Bruta" (`proporcao-receita.tsx`, montado
// pela página com a leitura própria de cada ano): aparece ao lado do total; ausente, nada é renderizado.

interface Props {
  dados: DadosGastosMarketing
  proporcao?: ReactNode
}

export default function GastosContent({ dados, proporcao }: Props) {
  const { anos, hoje, porAno } = dados

  const periodo = useMemo(() => rotuloPeriodoAnos(anos, hoje), [anos, hoje])
  const resumo = useMemo(() => fatiasDeResumo(porAno, hoje), [porAno, hoje])
  const fornecedores = useMemo(() => fatiasDeFornecedores(porAno, hoje), [porAno, hoje])
  const ultimaCarga = useMemo(() => ultimaCargaDe(porAno), [porAno])

  return (
    <div className="space-y-6">
      <CabecalhoGastos ultimaCarga={ultimaCarga} />

      <div className="space-y-6">
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
