import { SkeletonPagina, SkeletonFiltros, SkeletonGrafico } from '@/components/shared/skeletons'

// DRE (pills de período + card largo da composição) — silhueta real da página.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonFiltros n={6} />
      <SkeletonGrafico altura="h-96" />
    </SkeletonPagina>
  )
}
