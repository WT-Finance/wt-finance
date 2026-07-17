'use client'

import {
  ResponsiveContainer, ComposedChart, Bar, Line, Tooltip,
} from 'recharts'
import {
  ChartGrid, ChartZeroLine, ChartXAxisCategoria, ChartYAxisBRL,
  CustomTooltip, ChartLegend, fluxoColors, barRadius, barSizes,
} from '@/components/charts'
import { fmtMi, fmtBRL } from '@/lib/fmt'
import type { HorizonteBloco } from '@/lib/fluxo/rpc-fluxo'

// Horizonte Previsto (v5.2.0/Onda 1) — mapa de compromissos JÁ LANÇADOS por bloco
// temporal ("Resto de <ano> (lançado)", anos seguintes). É um retrato do que já foi
// lançado no sistema, NÃO uma previsão/projeção de negócio — daí o aviso. O bloco
// "Pós-2028 · isolado do horizonte" fica fora do eixo contínuo (separado por um
// divisor visual): tende a ter poucos lançamentos e distorceria a escala dos demais.

interface Props {
  blocos: HorizonteBloco[]
}

const MARCA_ISOLADO = 'isolado'

export default function HorizontePrevisto({ blocos }: Props) {
  if (!blocos.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white p-5">
        <h3 className="text-base font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Horizonte Previsto</h3>
        <div className="h-40 flex items-center justify-center text-sm text-zinc-400">Sem dados</div>
      </div>
    )
  }

  const principais = blocos.filter(b => !b.l.toLowerCase().includes(MARCA_ISOLADO))
  const isolado    = blocos.find(b => b.l.toLowerCase().includes(MARCA_ISOLADO)) ?? null

  const chartData = principais.map(b => ({
    l:      b.l,
    e:      b.e,
    sVal:   -b.s,
    liq:    b.liq,
    n:      b.n,
  }))

  return (
    <div className="rounded-xl shadow-sm bg-white p-5">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Horizonte Previsto</h3>
      </div>
      <p className="text-2xs mb-3" style={{ color: 'var(--text-muted)' }}>
        Mapa de compromissos já lançados por período — não é previsão de negócio.
      </p>

      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barGap={4}>
          {ChartGrid()}
          {ChartXAxisCategoria('l', { interval: 0 })}
          {ChartYAxisBRL()}
          {ChartZeroLine()}
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                formatter={(value: number, name: string) => {
                  if (name === 'e')    return [fmtBRL(value), 'Entradas lançadas']
                  if (name === 'sVal') return [fmtBRL(Math.abs(value)), 'Saídas lançadas']
                  return [fmtBRL(value), 'Líquido']
                }}
              />
            )}
          />
          <Bar dataKey="e"    name="e"    fill={fluxoColors.entrada} radius={barRadius.top}    barSize={barSizes.column} />
          <Bar dataKey="sVal" name="sVal" fill={fluxoColors.saida}   radius={barRadius.bottom} barSize={barSizes.column} />
          <Line
            dataKey="liq"
            name="liq"
            stroke={fluxoColors.resultado}
            strokeWidth={2}
            dot={{ r: 4, fill: fluxoColors.resultado, strokeWidth: 0 }}
            type="monotone"
          />
        </ComposedChart>
      </ResponsiveContainer>

      <ChartLegend
        items={[
          { label: 'Entradas lançadas', color: fluxoColors.entrada,   type: 'rect' },
          { label: 'Saídas lançadas',   color: fluxoColors.saida,     type: 'rect' },
          { label: 'Líquido do bloco',  color: fluxoColors.resultado, type: 'line' },
        ]}
      />

      {/* Resumo por bloco (inclui o nº de lançamentos, que o gráfico não mostra) — o bloco
          isolado vem separado por um divisor vertical, já que fica fora do eixo contínuo. */}
      <div className="flex items-stretch gap-3 mt-4 flex-wrap">
        {principais.map(b => (
          <BlocoChip key={b.l} bloco={b} />
        ))}
        {isolado && (
          <>
            <div className="w-px self-stretch bg-zinc-200" aria-hidden />
            <BlocoChip bloco={isolado} isolado />
          </>
        )}
      </div>
    </div>
  )
}

function BlocoChip({ bloco, isolado = false }: { bloco: HorizonteBloco; isolado?: boolean }) {
  const cor = bloco.liq >= 0 ? 'var(--positive-deep)' : 'var(--negative-deep)'
  return (
    <div
      className={[
        'rounded-lg px-3 py-2 min-w-[140px]',
        isolado ? 'bg-zinc-50 border border-dashed border-zinc-200' : 'bg-zinc-50',
      ].join(' ')}
    >
      <p className="text-2xs font-medium truncate" style={{ color: 'var(--text-muted)' }}>{bloco.l}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: cor }}>{fmtMi(bloco.liq)}</p>
      <p className="text-3xs mt-0.5" style={{ color: 'var(--text-subtle)' }}>{bloco.n} lançamento{bloco.n === 1 ? '' : 's'}</p>
    </div>
  )
}
