import { SkeletonPagina, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Editor da estrutura da DRE (v5.3.0/M5): silhueta = botão "Voltar" (pill) + card do
// editor com blocos empilhados (listas de categorias) + painel de histórico curto.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonFiltros n={1} />
      <SkeletonTabela linhas={6} />
      <SkeletonTabela linhas={4} />
      <SkeletonFiltros n={2} />
    </SkeletonPagina>
  )
}
