'use client'

import { useMemo } from 'react'
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartXAxisCategoria, ChartYAxisPct, ChartZeroLine, CustomTooltip,
  barRadius,
} from '@/components/charts'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { Card } from '@/components/ui/card'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { fmtAv } from '@/lib/dre/av'
import { rotuloAnos } from '@/lib/marketing/periodo'
import {
  barrasProporcao, escalaProporcao, type LeituraProporcao,
} from '@/lib/marketing/proporcao'
import CabecalhoCard from './cabecalho-card'

// Card "Proporção sobre a Receita Bruta" (v6.3.0) — vive no slot `proporcao` de `IndicadoresGastos`,
// ao lado do total (2 das 3 colunas). UMA BARRA POR ANO selecionado (o mais antigo à esquerda), com
// o % de Marketing sobre a Receita Bruta por COMPETÊNCIA — o MESMO número do grupo Marketing na
// grade "Proporção sobre a Receita Bruta" da DRE (`dre/grade-proporcao.tsx`). A conta vem pronta da
// RPC; aqui só se desenha (montagem das barras e da escala: `@/lib/marketing/proporcao`).
//
// Regime DIFERENTE do resto da página: o total, os gráficos e as tabelas são pagos (caixa); esta
// proporção é competência. O subtítulo diz isso para ninguém somar um com o outro.
//
// Sinal: o da DRE (despesa NEGATIVA) → as barras descem a partir da linha do zero, como o resto da
// página, e o rótulo é o `fmtAv` da DRE (1 casa, negativo entre parênteses). O eixo NÃO é invertido
// (a inversão da grade da DRE serve à LINHA de tendência; aqui a barra para baixo é a leitura).
// Domínio e ticks vêm de `escalaProporcao` (o default do Recharts ancora em zero e cortaria os
// negativos) e o zero é desenhado por `ChartZeroLine`. Cores por ano: as de "Despesas mensais".
//
// Degradação: cada ano é uma leitura independente. As barras que vieram são desenhadas e um aviso
// discreto nomeia os ausentes; se nenhuma veio, o card mostra só o aviso.

const ALTURA = 190

const AJUDA =
  'Quanto o Marketing consumiu da Receita Bruta em cada ano, no regime de competência — o mesmo ' +
  'número do grupo Marketing no gráfico "Proporção sobre a Receita Bruta" da DRE. O percentual é ' +
  'negativo, como na coluna AV do demonstrativo (despesa), e a barra desce a partir do zero. O ano ' +
  'corrente conta só os meses já cobertos pela base (marcado com * e o número de meses). ' +
  'Atenção: o restante desta página é pago (caixa); esta proporção é por competência, então não ' +
  'se soma nem se confronta diretamente com os totais ao lado.'

interface Props {
  /** Os anos selecionados na página (a ordem não importa — as barras saem em ordem crescente). */
  anos: readonly number[]
  /** Uma leitura por ano selecionado; cada uma pode ter falhado sozinha. */
  leituras: readonly LeituraProporcao[]
}

export default function ProporcaoReceita({ anos, leituras }: Props) {
  const { barras, anosFalha } = useMemo(() => barrasProporcao(anos, leituras), [anos, leituras])
  const escala = useMemo(() => escalaProporcao(barras.map(b => b.pct)), [barras])
  const dados = useMemo(
    () => barras.map(b => ({ rotulo: b.rotuloEixo, pct: b.pct, cor: b.cor })),
    [barras],
  )
  const tooltipPorRotulo = useMemo(
    () => new Map(barras.map(b => [b.rotuloEixo, b.rotuloTooltip])),
    [barras],
  )

  const descricao = barras
    .map(b => `${b.rotuloTooltip}: ${b.rotuloPct === '—' ? 'sem ponto' : b.rotuloPct}`)
    .join('; ')

  return (
    <Card className="h-full sm:col-span-2">
      <CabecalhoCard
        titulo="Proporção sobre a Receita Bruta"
        subtitulo="Regime de competência · igual ao gráfico da DRE"
        acao={(
          <GatilhoAjuda
            rotulo="Proporção sobre a Receita Bruta"
            texto={AJUDA}
            ancoraDireita
            classNameBalao="z-30 w-72 !whitespace-normal font-normal normal-case tracking-normal leading-snug"
          />
        )}
      />

      {barras.length > 0 && (
        // `height` fixo no pai — `min-height` faz o ResponsiveContainer medir 0 e o gráfico some.
        <div role="img" aria-label={`Proporção de Marketing sobre a Receita Bruta por ano — ${descricao}`}>
          <ResponsiveContainer width="100%" height={ALTURA}>
            <BarChart data={dados} margin={{ top: 16, right: 16, bottom: 0, left: 0 }} barCategoryGap="22%">
              {ChartGrid()}
              {/* `interval: 0` — o default do primitivo esconderia o ano do meio. */}
              {ChartXAxisCategoria('rotulo', { interval: 0 })}
              {ChartYAxisPct({ casas: escala.casas, width: 48, domain: escala.domain, ticks: escala.ticks })}
              {ChartZeroLine()}
              <Tooltip
                content={p => (
                  <CustomTooltip
                    {...p}
                    // Ano sem ponto (`pct` null): sem linha no tooltip (senão "0,0%").
                    payload={p.payload?.filter(e => e.value != null)}
                    labelFormatter={l => tooltipPorRotulo.get(String(l)) ?? String(l)}
                    formatter={v => [fmtAv(v), 'da Receita Bruta']}
                  />
                )}
                cursor={{ fill: 'var(--surface-soft)' }}
              />
              <Bar dataKey="pct" name="da Receita Bruta" radius={barRadius.top} maxBarSize={64} isAnimationActive={false}>
                {dados.map(d => <Cell key={d.rotulo} fill={d.cor} />)}
                {/* `content` CUSTOM (não `formatter`): o LabelList padrão quebra o texto na largura
                    da barra. O texto fica logo além da PONTA LIVRE: abaixo da barra que desce (o
                    caso normal), acima da que sobe. `y`/`height` são assinados (barRadius.top) —
                    por isso as duas pontas saem de min/max, sem supor qual é qual. Ano sem ponto
                    (`value` null) não desenha nada: o "—" mora no rótulo do eixo. */}
                <LabelList
                  dataKey="pct"
                  content={p => {
                    const { x, y, width, height, value } = p as {
                      x?: number | string; y?: number | string; width?: number | string
                      height?: number | string; value?: number | string | null
                    }
                    if (value == null || x == null || y == null || width == null || height == null) return <g />
                    const v = Number(value)
                    const a = Number(y)
                    const b = Number(y) + Number(height)
                    const yTexto = v < 0 ? Math.max(a, b) + 13 : Math.min(a, b) - 6
                    return (
                      <text
                        x={Number(x) + Number(width) / 2}
                        y={yTexto}
                        textAnchor="middle"
                        style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmtAv(v)}
                      </text>
                    )
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {anosFalha.length > 0 && (
        <ErroCarregamento
          mensagem={`Não foi possível carregar a proporção de ${rotuloAnos(anosFalha)}${barras.length > 0 ? '; fora do gráfico' : ''}.`}
          className={barras.length > 0 ? 'mt-2 justify-center' : ''}
        />
      )}
    </Card>
  )
}
