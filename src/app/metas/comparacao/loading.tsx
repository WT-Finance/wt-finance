import { SkeletonPagina } from '@/components/shared/skeletons'

// Skeleton da Comparação Upload × Monde (v5.1.2/M6): header + pills de setor +
// tabela densa, tom neutro (zinc), sem CLS. Mesmo container (px vem do <main>).
export default function Loading() {
  return (
    <SkeletonPagina>
      <div className="mb-6 space-y-2">
        <div className="h-6 w-80 max-w-full animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-4 w-[28rem] max-w-full animate-pulse rounded-lg bg-zinc-100" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-zinc-100" />
        ))}
      </div>
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="space-y-2.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-8 w-full animate-pulse rounded-lg bg-zinc-100" />
          ))}
        </div>
      </div>
    </SkeletonPagina>
  )
}
