import { SkeletonPagina, SkeletonPaginaTabela } from '@/components/shared/skeletons'

// Solicitações (caixa de entrada — tabela densa). Container px-4.
export default function Loading() {
  return (
    <SkeletonPagina container="px-4">
      <SkeletonPaginaTabela linhas={8} />
    </SkeletonPagina>
  )
}
