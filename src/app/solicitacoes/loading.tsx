import { SkeletonPagina, SkeletonPaginaTabela } from '@/components/shared/skeletons'

// Solicitações (caixa de entrada — tabela densa). Container max-w-5xl px-4.
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-5xl mx-auto px-4">
      <SkeletonPaginaTabela linhas={8} />
    </SkeletonPagina>
  )
}
