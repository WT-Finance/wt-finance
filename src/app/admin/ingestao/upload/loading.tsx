import { SkeletonHeader, SkeletonPagina, SkeletonGrafico } from '@/components/shared/skeletons'

// Admin · Upload de Arquivos (v6.1.1). Segmento-filho de /admin/ingestao: SEM este arquivo o
// `loading.tsx` do pai (skeleton do LOG — tabelas de cargas/execuções) cobriria a navegação
// para o Upload e mostraria a silhueta errada. Silhueta aproximada da página real: header +
// uma pilha de cards de base (6 bases, altura fixa para não dar CLS). O respiro (px/py) vem
// do <main> do AppShell.
export default function Loading() {
  return (
    <SkeletonPagina>
      <SkeletonHeader />
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonGrafico key={i} altura="h-28" />
        ))}
      </div>
    </SkeletonPagina>
  )
}
