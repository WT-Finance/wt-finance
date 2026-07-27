import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Editor da estrutura da DRE (v5.3.0/M5): silhueta = cabeçalho H1+subtítulo (a barra
// recolhível do TopSection saiu no refino pós-checkpoint) + botão "Voltar" (pill) + card do
// editor com blocos empilhados (listas de categorias) + painel de histórico curto.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={1} />
      <SkeletonTabela linhas={6} />
      <SkeletonTabela linhas={4} />
      <SkeletonFiltros n={2} />
    </SkeletonPagina>
  )
}
