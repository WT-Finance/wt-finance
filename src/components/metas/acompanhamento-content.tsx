'use client'

import PeriodoFilterPillsUrl from '@/components/shared/periodo-filter-pills-url'
import MetaCard from '@/components/metas/meta-card'
import RitmoChart from '@/components/metas/ritmo-chart'
import type { AcompanhamentoData } from '@/components/metas/tipos'

// Página montada do Acompanhamento de Metas (v5.0.0): pills de período, aviso de
// parcialidade, card Group (grande) + 3 cards setoriais (Trips/Weddings/Corporativo)
// e o gráfico "Ritmo do período". Puramente de apresentação — todo o dado (real +
// ritmo/meta) já chega calculado em `data` (ver src/app/metas/page.tsx).

/** 'yyyy-MM-dd' → 'DD/MM' (data pura, sem fuso — não é timestamptz). */
function fmtDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}

interface Props {
  data: AcompanhamentoData
}

export default function AcompanhamentoContent({ data }: Props) {
  const [group, ...setoresResto] = data.setores

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Metas — Acompanhamento</h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          Ritmo do faturamento e da receita contra a meta cadastrada, por setor
        </p>
      </div>

      <div className="mb-4">
        <PeriodoFilterPillsUrl defaultPreset="este-ano" />
      </div>

      {data.eParcial && (
        <p className="mb-4 text-xs text-[var(--text-muted)]">
          Comparações proporcionais{data.ultimaVenda ? ` até ${fmtDiaMes(data.ultimaVenda)}` : ''} · YoY no
          mesmo intervalo do ano anterior.
        </p>
      )}

      {group && (
        <div className="mb-6">
          <MetaCard painel={group} tamanho="grande" />
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {setoresResto.map(setor => (
          <MetaCard key={setor.key} painel={setor} tamanho="setor" />
        ))}
      </div>

      <RitmoChart setores={data.setores} />
    </div>
  )
}
