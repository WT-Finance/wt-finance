import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Cobre /performance, /performance/trips, /performance/corporativo e /performance/weddings
// (todas usam o mesmo container px-6 e a silhueta dashboard). App Router mostra este
// skeleton IMEDIATAMENTE ao navegar para o segmento, enquanto o RSC da página resolve.
export default function Loading() {
  return (
    <SkeletonPagina container="px-6">
      <SkeletonDashboard kpis={4} />
    </SkeletonPagina>
  )
}
