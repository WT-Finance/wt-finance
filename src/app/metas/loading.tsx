import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Acompanhamento é um dashboard (filtros + cards + gráfico) → SkeletonDashboard,
// no MESMO container da página (px-6) para não saltar na troca. (v4.39.0)
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonDashboard kpis={4} />
    </SkeletonPagina>
  )
}
