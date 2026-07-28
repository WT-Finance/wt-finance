import { SkeletonPagina, SkeletonFiltros, SkeletonTabela } from '@/components/shared/skeletons'

// DRE: o conteúdo primário é a TABELA densa do demonstrativo (toolbar de pills + ~160
// linhas × 13 colunas). Silhueta atualizada na v5.3.1, que fundiu tudo numa seção só
// ("Regime de Caixa", sempre aberta): tabela → Resumo Executivo (6 linhas × 7 colunas,
// dentro do MESMO card) → card da Decomposição (pills próprias + barras nos dois lados).
// Não há mais TopSection colapsada de Composição para representar.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonFiltros n={6} />
      <SkeletonTabela linhas={14} />
      {/* Resumo Executivo — bloco curto no rodapé do mesmo card da tabela. */}
      <SkeletonTabela linhas={6} />
      {/* Decomposição — pills do período + as duas colunas de barras. */}
      <SkeletonFiltros n={6} />
      <SkeletonTabela linhas={7} />
    </SkeletonPagina>
  )
}
