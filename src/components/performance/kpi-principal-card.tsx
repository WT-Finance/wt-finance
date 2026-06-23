'use client'

import { useState } from 'react'
import KpiColuna from '@/components/shared/kpi-coluna'
import KpiPrincipalDrawer from '@/components/weddings/kpi-principal-drawer'
import type { ExecutivaKpis } from '@/types/api'

interface Props {
  kpis:  ExecutivaKpis
  setor: string
}

// Card KPI principal genérico (Trips/Corp/Geral) — mesmo visual do card de topo
// de Weddings (weddings-kpis-section): 3 colunas Faturamento | Receita Bruta |
// Margem, clicável, abrindo o drawer rico parametrizado por setor (v4.10.1).
// Os dados (ExecutivaKpis) vêm do server (PerformanceContent), então não depende
// do provider de período usado em Weddings.
export default function KpiPrincipalCard({ kpis, setor }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <>
      <div
        className="card-clicavel bg-white rounded-xl shadow-sm px-5 pt-4 pb-2 cursor-pointer"
        onClick={() => setDrawerOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setDrawerOpen(true)}
        aria-label="Abrir análise detalhada de KPIs"
      >
        <div className="grid grid-cols-3 gap-4 divide-x divide-zinc-100">
          <KpiColuna rotulo="Faturamento"   metrica={kpis.faturamento} formato="brl" />
          <KpiColuna rotulo="Receita Bruta" metrica={kpis.receita}     formato="brl" padded />
          <KpiColuna rotulo="Margem"        metrica={kpis.margem_pct}  formato="pct" padded />
        </div>
        <div className="flex justify-end mt-2">
          <span className="card-clicavel-cta text-2xs text-[var(--brand)] font-medium">Ver mais ›</span>
        </div>
      </div>

      {drawerOpen && (
        <KpiPrincipalDrawer setor={setor} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  )
}
