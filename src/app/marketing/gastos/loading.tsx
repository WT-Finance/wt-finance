import {
  SkeletonPagina, SkeletonHeader, SkeletonFiltros, SkeletonKpis, SkeletonGrafico, SkeletonTabela,
} from '@/components/shared/skeletons'

// Marketing · Despesas de Marketing: header + pills de ano + 3 indicadores + gráfico mensal +
// tabela por categoria + ranking por fornecedor + lançamentos. Alturas fixas (sem CLS).
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <SkeletonFiltros n={3} />
      <SkeletonKpis n={3} />
      <div className="mb-6"><SkeletonGrafico /></div>
      <div className="mb-6"><SkeletonTabela linhas={6} /></div>
      <div className="mb-6"><SkeletonTabela linhas={6} /></div>
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
