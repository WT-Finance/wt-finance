import { SkeletonPagina, SkeletonDashboard } from '@/components/shared/skeletons'
import CabecalhoPerformance from '@/components/performance/cabecalho-performance'

// Cobre /performance, /performance/trips, /performance/corporativo e /performance/weddings
// (todas usam o mesmo container px-6 e a silhueta dashboard). App Router mostra este
// skeleton IMEDIATAMENTE ao navegar para o segmento, enquanto o RSC da página resolve.
// v6.1.1/M2: o título "Performance dos Setores" deixou o LAYOUT (para ficar na mesma linha do
// selo de carga, que vive no conteúdo) e passou a ser o `CabecalhoPerformance`, renderizado
// aqui SEM selos (o dado ainda não chegou) — mesma marcação do conteúdo real, então o título
// não pisca nem salta na troca. Fica FORA do `SkeletonPagina` (que é `aria-hidden`): o título
// é conteúdo real, não silhueta. `header={false}` segue: o do skeleton seria um título
// fantasma duplicado abaixo deste.
export default function Loading() {
  return (
    <>
      <CabecalhoPerformance />
      <SkeletonPagina>
        <SkeletonDashboard kpis={4} header={false} />
      </SkeletonPagina>
    </>
  )
}
