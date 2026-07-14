import { SkeletonPagina, SkeletonHeader, SkeletonTabela } from '@/components/shared/skeletons'

// Cadastro = header + grade anual → compõe header + tabela no MESMO container da
// página (px-6), padrão do Acervo para layout fora dos templates. (v4.39.0)
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonTabela linhas={12} />
    </SkeletonPagina>
  )
}
