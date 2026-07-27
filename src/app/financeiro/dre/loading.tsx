import { SkeletonPagina, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// DRE (v5.3.0/M4): o conteúdo primário é a TABELA densa do demonstrativo (toolbar de
// pills/busca + ~160 linhas × 13 colunas) — a silhueta reflete isso; a Composição
// (TopSection colapsado) fica como bloco secundário curto.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonFiltros n={6} />
      <SkeletonTabela linhas={14} />
      <SkeletonFiltros n={2} />
    </SkeletonPagina>
  )
}
