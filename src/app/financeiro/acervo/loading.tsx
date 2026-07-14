import { SkeletonHeader } from '@/components/shared/skeletons'

// Acervo de Documentos: o container é `h-full flex flex-col` (título+busca fixos, lista rola —
// v4.38.0). O skeleton replica ESSA estrutura para não quebrar o layout na troca. Só a "lista"
// rola por dentro (flex-1). Tom neutro, sem CLS.
export default function Loading() {
  return (
    <div className="px-4 h-full flex flex-col" aria-hidden="true">
      <SkeletonHeader />
      {/* Busca fixa */}
      <div className="mb-6 shrink-0"><div className="animate-pulse rounded-lg bg-zinc-100 h-10 w-72 max-w-full" /></div>
      {/* Lista (rola por dentro) */}
      <div className="flex-1 min-h-0 space-y-3">
        <div className="animate-pulse rounded bg-zinc-200 h-8 w-10" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-lg bg-zinc-100 h-14 w-full" />
        ))}
      </div>
    </div>
  )
}
