import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · Acessos: header + abas (Usuários/Roles/Áreas/Solicitações) + tabela. px-4.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={4} />
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
