import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonKpis, SkeletonTabela } from '@/components/shared/skeletons'

// Gestão de Pessoas · Inventário: header + 3 pills de aba + faixa de contagens + tabela.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={3} />
      <SkeletonKpis n={4} />
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
