import { SkeletonPagina, SkeletonPaginaTabela } from '@/components/shared/skeletons'

// Admin · Chaves de API: header + linha de ação + tabela (mesma silhueta de
// Admin · Acessos / Solicitações). O respiro (px/py) vem do <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonPaginaTabela linhas={6} />
    </SkeletonPagina>
  )
}
