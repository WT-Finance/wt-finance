import { SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// Gestão de Pessoas · Estante Welcome: header + 2 abas (Acervo/Histórico) + tabela. Sem KPI —
// a tela não tem faixa de contagens (não copiar do inventario/loading.tsx, que tem).
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={2} />
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
