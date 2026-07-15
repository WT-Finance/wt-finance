'use client'

import Link from 'next/link'
import { Clock, Monitor } from 'lucide-react'
import MetasPeriodoPills from '@/components/metas/metas-periodo-pills'
import MetaCard from '@/components/metas/meta-card'
import RitmoChart from '@/components/metas/ritmo-chart'
import TopSection from '@/components/shared/top-section'
import MetasAutoRefresh from '@/components/metas/metas-auto-refresh'
import { fmtDataHoraLongoSP } from '@/lib/fmt'
import type { AcompanhamentoData } from '@/components/metas/tipos'

// Página montada do Acompanhamento de Metas (v5.0.0): título/subtítulo fixos e, abaixo
// de uma barra recolhível "Visão geral" (TopSection), as pills de período, a nota de
// última atualização, o card Group (grande) + 3 cards setoriais e o gráfico "Ritmo do
// período". Puramente de apresentação — todo o dado já chega calculado em `data`.

interface Props {
  data: AcompanhamentoData
}

export default function AcompanhamentoContent({ data }: Props) {
  const [group, ...setoresResto] = data.setores

  return (
    <div>
      {/* Auto-refresh (v5.1.6): a tela converge ao dado do banco (cron ~15min) sem reload — 5min. */}
      <MetasAutoRefresh intervaloMs={300_000} />
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Acompanhamento das Metas</h1>
          <p className="mt-0.5 text-sm text-zinc-400">
            Acompanhe o progresso do faturamento e receita em relação às metas
          </p>
        </div>
        {/* Modo TV (v5.1.0): AÇÃO sobre a tela vista (não item de sidebar) → abre a pele
            /metas/tv em tela cheia, mantendo o período corrente. Tokens neutros de plataforma. */}
        <Link
          href={`/metas/tv?periodo=${data.preset}`}
          className="foco-neutro inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
          title="Abrir em tela cheia para a TV da sala"
        >
          <Monitor size={16} className="text-zinc-400" />
          Modo de Exibição
        </Link>
      </div>

      <TopSection titulo="Visão geral">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <MetasPeriodoPills />
          {data.ultimaAtualizacao && (
            <p className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <Clock size={13} className="text-zinc-400" />
              Última atualização em {fmtDataHoraLongoSP(data.ultimaAtualizacao)}
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
      </TopSection>
    </div>
  )
}
