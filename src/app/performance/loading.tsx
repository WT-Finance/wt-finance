import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'

// Cobre /performance, /performance/trips, /performance/corporativo e /performance/weddings
// (todas usam o mesmo container px-6 e a silhueta dashboard). App Router mostra este
// skeleton IMEDIATAMENTE ao navegar para o segmento, enquanto o RSC da página resolve.
// `header={false}` (v5.1.9): o título real "Performance dos Setores" vive no LAYOUT do
// segmento (persistente entre navegações) — com o header do skeleton haveria um título
// fantasma duplicado abaixo do real durante cada troca de aba.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonDashboard kpis={4} header={false} />
    </SkeletonPagina>
  )
}
