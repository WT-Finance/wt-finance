import { SkeletonPagina, SkeletonHeader, SkeletonGrafico, SkeletonTabela } from '@/components/shared/skeletons'

// Fluxo de Caixa Gerencial: header + projeção (gráfico) + tabela densa (saldos/lançamentos).
export default function Loading() {
  return (
    <SkeletonPagina container="px-6">
      <SkeletonHeader />
      <div className="mb-4"><SkeletonGrafico altura="h-56" /></div>
      <SkeletonTabela linhas={10} />
    </SkeletonPagina>
  )
}
