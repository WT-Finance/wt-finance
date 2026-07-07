import { SkeletonPagina, SkeletonHeader, SkeletonGrafico, SkeletonTabela } from '@/components/shared/skeletons'

// Fluxo de Caixa Gerencial: header + projeção (gráfico) + tabela densa (saldos/lançamentos).
export default function Loading() {
  return (
    <SkeletonPagina container="max-w-7xl mx-auto px-6">
      <SkeletonHeader />
      <div className="mb-4"><SkeletonGrafico altura="h-56" /></div>
      <SkeletonTabela linhas={10} />
    </SkeletonPagina>
  )
}
