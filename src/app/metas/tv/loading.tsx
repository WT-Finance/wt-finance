// Skeleton do Modo TV — silhueta da tela cheia (header + faixa Group + 3 cards + legenda),
// tom neutro (zinc + animate-pulse), sem CLS. Renderiza sem chrome (o AppShell some em /metas/tv).
export default function Loading() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[var(--surface-soft)] px-12 py-8">
      <div className="flex items-center justify-between">
        <div className="h-10 w-72 animate-pulse rounded bg-zinc-200" />
        <div className="h-6 w-80 animate-pulse rounded bg-zinc-200" />
      </div>
      <div className="mt-8 h-44 animate-pulse rounded-2xl bg-zinc-100" />
      <div className="mt-6 grid flex-1 grid-cols-3 gap-6">
        {[0, 1, 2].map(i => <div key={i} className="animate-pulse rounded-2xl bg-zinc-100" />)}
      </div>
      <div className="mx-auto mt-6 h-6 w-1/2 animate-pulse rounded bg-zinc-200" />
    </div>
  )
}
