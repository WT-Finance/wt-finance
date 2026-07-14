import { SkeletonPagina, SkeletonPaginaTabela } from '@/components/shared/skeletons'

// Admin · Solicitações (e a subrota /movimentacoes, mesma silhueta de tabela). px-4.
export default function Loading() {
  return (
    <SkeletonPagina container="px-4">
      <SkeletonPaginaTabela linhas={8} />
    </SkeletonPagina>
  )
}
