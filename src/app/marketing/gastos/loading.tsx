import {
  SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonGrafico, SkeletonTabela,
} from '@/components/shared/skeletons'

// Marketing · Despesas de Marketing: header + pills de ano + card do total (1/3 da largura, como
// na página real) + gráfico "Despesas mensais" (com o painel "Total" ao lado) + tabela por
// categoria + ranking por fornecedor. Alturas fixas (sem CLS).
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={3} />
      {/* Um card de indicador, na mesma grade de 3 colunas da página (o 2º é o slot da proporção). */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-[120px] animate-pulse rounded-xl bg-zinc-100" />
      </div>
      <div className="mb-6"><SkeletonGrafico altura="h-[260px]" /></div>
      <div className="mb-6"><SkeletonTabela linhas={6} /></div>
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
