import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Fluxo de Caixa (dashboard: pills de período + KPIs + gráficos). Container max-w-7xl px-6.
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-7xl mx-auto px-6">
      <SkeletonDashboard kpis={4} />
    </SkeletonPagina>
  )
}
