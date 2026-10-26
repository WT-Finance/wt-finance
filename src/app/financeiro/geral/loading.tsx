import {
  SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonGrafico, SkeletonTabela,
} from '@/components/shared/skeletons'

// Financeiro · Geral (v6.5.0): header + pills de ano + faixa de 3 indicadores + as 5 seções na ordem da página
// real (Vendas · Recebíveis e inadimplência · Perdas e prejuízos · Antecipações · Cartões de crédito): barra de
// TopSection seguida do conteúdo aproximado (linha de metadados, tiles, tabelas, gráfico). Vendas e Cartões são
// cascas "Em construção" (um card pequeno). Alturas fixas (sem CLS); tom neutro (zinc + animate-pulse), sem
// sidebar (só o <main> é substituído). ADR-0144.

const BLOCO = 'animate-pulse rounded-xl bg-zinc-100'

/** Barra da TopSection (a altura é a da barra real). */
function Barra() {
  return <div className={`mb-3 h-[58px] ${BLOCO}`} />
}

/** Linha de metadados da seção (regime · recorte · carimbo · "?"). */
function Meta() {
  return <div className={`mb-4 h-6 w-80 max-w-full ${BLOCO}`} />
}

/** Tile de indicador (rótulo + valor + apoio). */
function TileSkeleton() {
  return <div className={`h-[112px] ${BLOCO}`} />
}

/** Casca "Em construção": um card pequeno. */
function Casca() {
  return <div className={`h-[64px] ${BLOCO}`} />
}

export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={3} />

      {/* Faixa do topo: 3 tiles */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <TileSkeleton key={i} />)}
      </div>

      {/* Vendas (casca) */}
      <div className="mb-8">
        <Barra />
        <Casca />
      </div>

      {/* Recebíveis e inadimplência: 3 cards · 2 tabelas · 1 gráfico */}
      <div className="mb-8">
        <Barra />
        <Meta />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <TileSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2"><SkeletonTabela linhas={6} /></div>
            <div className="xl:col-span-3"><SkeletonTabela linhas={6} /></div>
          </div>
          <SkeletonGrafico altura="h-[220px]" />
        </div>
      </div>

      {/* Perdas e prejuízos: tabela + card pequeno · 1 gráfico */}
      <div className="mb-8">
        <Barra />
        <Meta />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SkeletonTabela linhas={5} />
            <Casca />
          </div>
          <SkeletonGrafico altura="h-[220px]" />
        </div>
      </div>

      {/* Antecipações: 3 cards · 1 gráfico · 2 tabelas */}
      <div className="mb-8">
        <Barra />
        <Meta />
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <TileSkeleton key={i} />)}
          </div>
          <SkeletonGrafico altura="h-[220px]" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <div className="xl:col-span-2"><SkeletonTabela linhas={4} /></div>
            <div className="xl:col-span-3"><SkeletonTabela linhas={4} /></div>
          </div>
        </div>
      </div>

      {/* Cartões de crédito (casca) */}
      <div className="mb-8">
        <Barra />
        <Casca />
      </div>
    </SkeletonPagina>
  )
}
