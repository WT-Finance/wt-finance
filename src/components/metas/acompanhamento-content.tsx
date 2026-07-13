'use client'

import MetasPeriodoPills from '@/components/metas/metas-periodo-pills'
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
        <h1 className="text-xl font-semibold text-zinc-900">Acompanhamento das Metas</h1>
        <p className="mt-0.5 text-sm text-zinc-400">
          Acompanhe o progresso do faturamento e receita em relação às metas
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <MetasPeriodoPills />
        {data.eParcial && (
          <p className="text-xs text-[var(--text-muted)]">
            Dados{data.ultimaVenda ? ` até ${fmtDiaMes(data.ultimaVenda)}` : ''} · o esperado é a meta
            proporcional aos dias já corridos
          </p>
        )}
      </div>

      {group && (
        <div className="mb-4">
          <MetaCard painel={group} tamanho="grande" />
        </div>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-3">
        {setoresResto.map(setor => (
          <MetaCard key={setor.key} painel={setor} tamanho="setor" />
        ))}
      </div>

      <RitmoChart setores={data.setores} />
    </div>
  )
}
