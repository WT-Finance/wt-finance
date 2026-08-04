'use client'

import Link from 'next/link'
import { Monitor, GitCompare } from 'lucide-react'
import MetasPeriodoPills from '@/components/metas/metas-periodo-pills'
import MetaCard from '@/components/metas/meta-card'
import SubsetorCard from '@/components/metas/subsetor-card'
import NaoClassificados from '@/components/metas/nao-classificados'
import ReconciliacaoSubsetores from '@/components/metas/reconciliacao-subsetores'
import RitmoChart from '@/components/metas/ritmo-chart'
import TopSection from '@/components/shared/top-section'
import { useCortina, Cortina, BotaoCortina } from '@/components/shared/cortina'
import MetasAutoRefresh from '@/components/metas/metas-auto-refresh'
import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'
import type { AcompanhamentoData } from '@/components/metas/tipos'

// Página montada do Acompanhamento de Metas (v5.0.0): título/subtítulo fixos e, abaixo
// de uma barra recolhível "Visão geral" (TopSection), as pills de período, a nota de
// última atualização, o card Group (grande), Trips|Corporativo em duas colunas, a
// faixa full-width de Weddings (com chevron para os 5 subsetores + "Não Classificados",
// v5.4.4) e o gráfico "Ritmo do período". Puramente de apresentação — todo o dado já
// chega calculado em `data`.

// Texto do "?" da expansão de subsetores — native `title` (não o <Tooltip> do DS: ele é
// `position:absolute` e seria decapitado pelo `overflow-hidden` da cortina, regra da
// skill ui-design-system §2.1 / header de shared/cortina.tsx).
const AJUDA_SUBSETORES = [
  'Subsetor é agrupamento de PRODUTO — a meta cadastrada aqui é de mix de produto.',
  'O realizado dos subsetores vem do upload manual; o do setor Weddings vem do Monde. ' +
    'As duas fontes não fecham fora do mês corrente (medido em 2026: 0,0% de diferença ' +
    'em agosto, 19,1% em julho, 5,1% no ano).',
  'Em Comercial, a meta de CONTRATOS mede 1 produto ("Contrato de Casamento"); a meta em ' +
    'R$ do mesmo subsetor cobre 3 produtos.',
].join('\n\n')

interface Props {
  data: AcompanhamentoData
  /** Usuário tem a área 'metas' (Cadastro) → mostra o botão "Modo de Comparação". v5.1.9. */
  podeComparar?: boolean
}

export default function AcompanhamentoContent({ data, podeComparar }: Props) {
  const [group, ...setoresResto] = data.setores
  const weddings = setoresResto.find(s => s.key === 'Weddings')
  const setoresPrincipais = setoresResto.filter(s => s.key !== 'Weddings')

  // Cortina dos subsetores de Weddings — estado LOCAL, nasce FECHADA, sem URL/persistência
  // (igual ao TopSection e ao drill da DRE). Chamada incondicional (regra dos hooks); só
  // é oferecida (chevron/expansão) quando `data.subsetores` existe.
  const cortinaSubsetores = useCortina(false)

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
        {/* Ações sobre a tela vista (v5.1.9): "Modo de Comparação" (âmbar de gestão, só quem
            tem a área 'metas'/Cadastro) à ESQUERDA + "Modo de Exibição" (TV, neutro). */}
        <div className="flex shrink-0 items-center gap-2">
          {podeComparar && (
            <Link
              href="/metas/comparacao"
              className="foco-neutro inline-flex items-center gap-1.5 rounded-lg border border-gestao bg-gestao-soft px-3 py-1.5 text-sm font-medium text-gestao-fg transition-opacity hover:opacity-90"
              title="Comparar as vendas do Monde com o upload manual"
            >
              <GitCompare size={16} />
              Modo de Comparação
            </Link>
          )}
          <Link
            href={`/metas/tv?periodo=${data.preset}`}
            className="foco-neutro inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
            title="Abrir em tela cheia para a TV da sala"
          >
            <Monitor size={16} className="text-zinc-400" />
            Modo de Exibição
          </Link>
        </div>
      </div>

      <TopSection titulo="Visão geral">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <MetasPeriodoPills />
          <UltimaAtualizacao iso={data.ultimaAtualizacao} className="text-xs" />
        </div>

        {group && (
          <div className="mb-4">
            <MetaCard painel={group} tamanho="grande" />
          </div>
        )}

        <div className="mb-4 grid gap-4 md:grid-cols-2">
          {setoresPrincipais.map(setor => (
            <MetaCard key={setor.key} painel={setor} tamanho="setor" />
          ))}
        </div>

        {weddings && (
          <div className="mb-4">
            <MetaCard
              painel={weddings}
              tamanho="setor"
              acaoCabecalho={data.subsetores && (
                <BotaoCortina
                  aberta={cortinaSubsetores.aberta}
                  onAlternar={cortinaSubsetores.alternar}
                  controla={cortinaSubsetores.idConteudo}
                  rotulo={cortinaSubsetores.aberta ? 'Recolher subsetores de Weddings' : 'Ver subsetores de Weddings'}
                  tamanho={16}
                />
              )}
            />

            {data.subsetores && (
              <Cortina aberta={cortinaSubsetores.aberta} id={cortinaSubsetores.idConteudo} folgaSombra className="pt-4">
                <div className="mb-3 flex items-center gap-1.5">
                  <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Subsetores
                  </h3>
                  <button
                    type="button"
                    title={AJUDA_SUBSETORES}
                    aria-label={`Subsetores: ${AJUDA_SUBSETORES}`}
                    className="foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
                  >
                    ?
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {data.subsetores.map(sub => (
                    <SubsetorCard key={sub.key} subsetor={sub} />
                  ))}
                </div>

                {data.naoClassificado && (
                  <div className="mt-3">
                    <NaoClassificados data={data.naoClassificado} />
                  </div>
                )}

                {/* Fecha a conta: só aparece quando os cards NÃO somam o card do setor
                    (upload defasado em relação ao Monde). Ver o header do componente. */}
                <ReconciliacaoSubsetores
                  faturamentoSetor={weddings.faturamento}
                  subsetores={data.subsetores}
                  naoClassificado={data.naoClassificado}
                />
              </Cortina>
            )}
          </div>
        )}

        <RitmoChart setores={data.setores} />
      </TopSection>
    </div>
  )
}
