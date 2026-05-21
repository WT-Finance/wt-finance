'use client'

import { useEffect, useState } from 'react'
import { usePeriodoFilter } from '@/components/layout/period-filter-provider'
import { fetchWeddingsKpis } from '@/app/performance/weddings/actions'
import KpiCard, { KpiCardSkeleton } from '@/components/shared/kpi-card'
import KpiDrawerTrigger from '@/components/shared/kpi-drawer-trigger'
import MargemDrawerTrigger from '@/components/weddings/margem-drawer-trigger'
import type { ExecutivaKpis, TendenciaMargem, SumarioSubsetor } from '@/types/api'
import type { Benchmarks } from '@/lib/config'

interface Props {
  benchmarks: Benchmarks
}

export default function WeddingsKpisSection({ benchmarks }: Props) {
  const { from, to, antFrom, antTo, yoyFrom, yoyTo, eParcial } = usePeriodoFilter()

  const [kpis, setKpis]           = useState<ExecutivaKpis | null>(null)
  const [tendencia, setTendencia] = useState<TendenciaMargem | null>(null)
  const [sumario, setSumario]     = useState<SumarioSubsetor | null>(null)
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchWeddingsKpis(from, to, antFrom, antTo, yoyFrom, yoyTo).then(data => {
      if (cancelled) return
      setKpis(data.kpis)
      setTendencia(data.tendencia)
      setSumario(data.sumario)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [from, to, antFrom, antTo, yoyFrom, yoyTo])

  const SETOR = 'Weddings'

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {loading || !kpis ? (
          Array.from({ length: 6 }).map((_, i) => <KpiCardSkeleton key={i} />)
        ) : (
          <>
            <KpiDrawerTrigger metrica="faturamento" rotulo="Faturamento" setor={SETOR}>
              <KpiCard
                rotulo="Faturamento"
                formula="Soma do valor total das vendas"
                metrica={kpis.faturamento} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
              />
            </KpiDrawerTrigger>

            <KpiDrawerTrigger metrica="receita" rotulo="Receita Bruta" setor={SETOR}>
              <KpiCard
                rotulo="Receita Bruta"
                formula="Faturamento − pagamento ao fornecedor (hotel, cia. aérea). No turismo de agenciamento, a receita real é o que sobra após o repasse ao fornecedor. (ADR-0026)"
                metrica={kpis.receita} formato="brl"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                isPeriodoProporcional={eParcial}
              />
            </KpiDrawerTrigger>

            <MargemDrawerTrigger
              tendencia={tendencia}
              sumario={sumario}
              margemOk={benchmarks.margemAlvo}
              margemAlerta={benchmarks.margemAtencao}
            >
              <KpiCard
                rotulo="Margem %"
                formula="Receita Bruta ÷ Faturamento × 100"
                metrica={kpis.margem_pct} formato="pct"
                periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
                benchmarkAlvo={benchmarks.margemAlvo} benchmarkAtencao={benchmarks.margemAtencao}
                isPeriodoProporcional={eParcial}
              />
            </MargemDrawerTrigger>

            <KpiCard
              rotulo="Ticket Médio"
              formula="Faturamento ÷ Casamentos"
              metrica={kpis.ticket_medio} formato="brl"
              periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
            />

            <KpiCard
              rotulo="Receita Média"
              formula="Receita Bruta ÷ Casamentos"
              metrica={kpis.receita_media} formato="brl"
              periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
            />

            <KpiCard
              rotulo="Casamentos Entregues"
              formula="Operações com Contrato de Casamento realizadas no período"
              metrica={kpis.vendas} formato="numero"
              periodoAtual={kpis.periodo} periodoAnterior={kpis.periodo_anterior} periodoYoY={kpis.periodo_yoy}
              isPeriodoProporcional={eParcial}
            />
          </>
        )}
      </div>
    </div>
  )
}
