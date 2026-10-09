'use client'

import { useMemo } from 'react'
import { ChartColumn } from 'lucide-react'
import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip } from 'recharts'
import {
  ChartGrid, ChartLegend, ChartXAxisCategoria, ChartYAxisBRL, ChartZeroLine, CustomTooltip,
  barRadius, dashArrays, strokeWidths, chartMargins,
} from '@/components/charts'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { Card } from '@/components/ui/card'
import { fmtBRL2 } from '@/lib/fmt'
import { serieMensal, totalNoRecorte } from '@/lib/marketing/agregacao'
import { escalaSerie } from '@/lib/marketing/escala'
import { MESES_ABREV, rotuloRecorteAno, type Recorte } from '@/lib/marketing/periodo'
import CabecalhoCard from './cabecalho-card'
import type { ResumoMarketing } from '@/lib/marketing/tipos'

// Componente C — série mensal: barras do ano selecionado × linha TRACEJADA do ano anterior.
//
// Convenção de traço da plataforma: sólido = real/efetivo, tracejado = referência (ano anterior).
// Cores: o ano selecionado em `--action-soft-border` (o Cool Gray institucional, o mesmo das
// barras do inventário — esta é uma tela de plataforma, sem `--brand`); a referência em
// `--text-secondary`. Não é `--negative`: a página inteira é despesa, e pintar tudo de
// terracota transformaria a cor em ruído.
//
// VALORES NEGATIVOS — a armadilha que não dá erro: o domínio default do Recharts ancora em zero
// e CORTA os negativos. O domínio e os ticks saem de `escalaSerie` (passo redondo), o zero é
// desenhado por `ChartZeroLine`, e o eixo mostra o sinal (`abs: false`) — a mesma grandeza não
// pode aparecer com dois sinais em telas vizinhas.

const COR_ANO = 'var(--action-soft-border)'
const COR_REFERENCIA = 'var(--text-secondary)'

interface Props {
  ano: number
  recorte: Recorte
  /** Último mês alcançado do ano selecionado (depois dele o valor é `null`, não zero). */
  limiteMes: number
  /** `null` = o resumo do ano selecionado não carregou. */
  resumo: ResumoMarketing | null
  /** `null` = o resumo do ano anterior não carregou (a linha some, as barras ficam). */
  anterior: ResumoMarketing | null
  /** O ano anterior não consta em `anosDisponiveis` (a base começa em 2024): não há o que
   *  comparar. A linha de referência e a legenda somem em silêncio — sem zero inventado e sem o
   *  aviso de erro, porque não houve falha. */
  anteriorSemHistorico: boolean
}

export default function SerieMensal({ ano, recorte, limiteMes, resumo, anterior, anteriorSemHistorico }: Props) {
  // Cubo da referência; `null` = sem linha (leitura falhou OU ano sem histórico).
  const referencia = anterior && !anteriorSemHistorico ? anterior.porMesCategoria : null

  const pontos = useMemo(() => {
    if (!resumo) return []
    return serieMensal(resumo.porMesCategoria, referencia, recorte, limiteMes)
      .map(p => ({ label: MESES_ABREV[p.mes - 1], atual: p.atual, anterior: p.anterior }))
  }, [resumo, referencia, recorte, limiteMes])

  const escala = useMemo(
    () => escalaSerie(pontos.flatMap(p => [p.atual, p.anterior])),
    [pontos],
  )

  const subtitulo = `${rotuloRecorteAno(recorte, ano)} · barras: ${ano}${referencia ? ` · linha tracejada: ${ano - 1}` : ''}`

  if (!resumo) {
    return (
      <Card>
        <CabecalhoCard titulo="Despesa mensal" />
        <ErroCarregamento mensagem="Não foi possível carregar a série mensal." />
      </Card>
    )
  }

  const vazio = totalNoRecorte(resumo.porMesCategoria, recorte).qtd === 0
  if (vazio) {
    return (
      <Card>
        <CabecalhoCard titulo="Despesa mensal" subtitulo={subtitulo} />
        <EmptyState icon={ChartColumn} message={`Sem lançamentos pagos em ${rotuloRecorteAno(recorte, ano)}.`} />
      </Card>
    )
  }

  return (
    <Card>
      <CabecalhoCard titulo="Despesa mensal" subtitulo={subtitulo} />

      {/* `height` fixo no pai — `min-height` faz o ResponsiveContainer medir 0 e o gráfico some. */}
      <div role="img" aria-label={`Despesa mensal de marketing em ${rotuloRecorteAno(recorte, ano)}${referencia ? `, comparado a ${ano - 1}` : ''}`}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={pontos} margin={chartMargins.default} barCategoryGap="22%">
            {ChartGrid()}
            {ChartXAxisCategoria('label', { interval: 0 })}
            {ChartYAxisBRL({ abs: false, width: 76, domain: escala.domain, ticks: escala.ticks })}
            {ChartZeroLine()}
            <Tooltip
              content={p => (
                <CustomTooltip {...p} showColorDot formatter={(v, name) => [fmtBRL2(v), name]} />
              )}
              cursor={{ fill: 'var(--surface-soft)' }}
            />
            <Bar
              dataKey="atual"
              name={String(ano)}
              fill={COR_ANO}
              radius={barRadius.top}
              maxBarSize={34}
              isAnimationActive={false}
            />
            {referencia && (
              <Line
                dataKey="anterior"
                name={String(ano - 1)}
                type="monotone"
                stroke={COR_REFERENCIA}
                strokeWidth={strokeWidths.lineDashed}
                strokeDasharray={dashArrays.reference}
                dot={{ r: 2.5, fill: COR_REFERENCIA, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            {/* Legenda nativa escondida — a `ChartLegend` fica fora do container, abaixo. */}
            <Legend content={() => null} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartLegend
        items={[
          { label: String(ano), color: COR_ANO, type: 'rect' },
          ...(referencia ? [{ label: String(ano - 1), color: COR_REFERENCIA, type: 'line' as const, dashed: true }] : []),
        ]}
      />
      {!anterior && !anteriorSemHistorico && (
        <ErroCarregamento mensagem={`Não foi possível carregar ${ano - 1}; sem a linha de referência.`} className="mt-2 justify-center" />
      )}
    </Card>
  )
}
