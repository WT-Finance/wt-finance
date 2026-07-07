import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Faturamento Corporativo: header + abas (Emissão | Cadastro) + card denso (upload/tabela).
// Container max-w-7xl px-4 (largura única nas duas abas — v4.33.2).
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-7xl mx-auto px-4">
      <SkeletonHeader />
      <SkeletonFiltros n={2} />
      <SkeletonTabela linhas={6} />
    </SkeletonPagina>
  )
}
