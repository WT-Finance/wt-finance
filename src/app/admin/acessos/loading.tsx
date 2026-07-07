import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Admin · Acessos: header + abas (Usuários/Roles/Áreas/Solicitações) + tabela. max-w-5xl px-4.
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-5xl mx-auto px-4">
      <SkeletonHeader />
      <SkeletonFiltros n={4} />
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
