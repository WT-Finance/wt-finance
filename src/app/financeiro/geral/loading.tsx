import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Financeiro · Geral: header + pills de ano + faixa de 5 indicadores + as 5 seções (barra de TopSection
// seguida do conteúdo aproximado). Alturas fixas (sem CLS); tom neutro (zinc + animate-pulse), sem sidebar
// (só o <main> é substituído). ADR-0144.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={3} />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
      {/* Recebíveis: barra + 3 tiles + 2 tabelas */}
      <div className="mb-3 h-[58px] animate-pulse rounded-xl bg-zinc-100" />
      <div className="mb-8 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-[112px] animate-pulse rounded-xl bg-zinc-100" />)}
        </div>
        <SkeletonTabela linhas={5} />
      </div>
      {/* Antecipações, Perdas, Custos, Prazos: barra + um bloco de tabela */}
      {[6, 4, 8, 4].map((linhas, i) => (
        <div key={i} className="mb-8">
          <div className="mb-3 h-[58px] animate-pulse rounded-xl bg-zinc-100" />
          <SkeletonTabela linhas={linhas} />
        </div>
      ))}
    </SkeletonPagina>
  )
}
