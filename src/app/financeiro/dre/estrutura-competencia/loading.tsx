import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Editor da estrutura de COMPETÊNCIA (v5.8.0/M5): mesma silhueta da irmã do caixa —
// cabeçalho H1+subtítulo, botão "Voltar" (pill), card do editor com blocos empilhados e
// painel de histórico curto.
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
