import {
  SkeletonPagina, SkeletonHeader, SkeletonGrafico, SkeletonTabela,
} from '@/components/shared/skeletons'

// Marketing · Despesas de Marketing: header + card do total (1/3 da largura) e o da proporção sobre a
// Receita Bruta (2/3, como na página real; sem subtítulo, então mais baixo) + gráfico "Despesas
// Mensais" (com o painel "Total" ao lado) + tabela por categoria + ranking por fornecedor. Sem
// pills de ano (a página é fixa nos 3 anos). Alturas fixas (sem CLS).
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      {/* A mesma grade de 3 colunas da página: o card do total (1/3) e o da proporção (2/3). A altura
          vem do card da proporção (a do total estica junto, como na página real). */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-h-[120px] animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-[270px] animate-pulse rounded-xl bg-zinc-100 sm:col-span-2" />
      </div>
      <div className="mb-6"><SkeletonGrafico altura="h-[260px]" /></div>
      <div className="mb-6"><SkeletonTabela linhas={6} /></div>
      <SkeletonTabela linhas={8} />
    </SkeletonPagina>
  )
}
