import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Acompanhamento é um dashboard (filtros + cards + gráfico) → SkeletonDashboard,
// no MESMO container da página (max-w-7xl px-6) para não saltar na troca. (v4.39.0)
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-7xl mx-auto px-6">
      <SkeletonDashboard kpis={4} />
    </SkeletonPagina>
  )
}
