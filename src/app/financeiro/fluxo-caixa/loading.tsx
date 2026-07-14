import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Fluxo de Caixa (dashboard: pills de período + KPIs + gráficos). Container px-6.
export default function Loading() {
  return (
    <SkeletonPagina container="px-6">
      <SkeletonDashboard kpis={4} />
    </SkeletonPagina>
  )
}
