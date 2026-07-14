// Skeletons de carregamento (v4.39.0/M1 · DS §skeleton). Silhueta APROXIMADA de cada tipo de
// página (header + filtros + cards + tabela/gráficos), em tom NEUTRO do DS (zinc + animate-pulse),
// SEM CLS (alturas/larguras fixas em px/rem → a troca skeleton→conteúdo não "pula"). Puros de
// markup (server components, zero JS). NUNCA incluem a sidebar — vivem só dentro do `<main>` via
// `loading.tsx`. O respiro horizontal (px) vem do `<main>` (fonte única, v5.1.1) — o skeleton
// só passa `container` para EXTRAS de layout da página (ex.: `h-full flex flex-col`), não px/max-w.
//
// Cor: `bg-zinc-100`/`bg-zinc-200` é cinza de UI neutro (permitido pelo lint `wt/no-cor-hardcoded`;
// não é cor semântica). Nada de token de marca no skeleton (tom neutro por decisão do briefing).

import type { ReactNode } from 'react'

/** Bloco base pulsante. Sempre com altura/largura fixas → sem CLS. */
function Bloco({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-zinc-100 ${className}`} />
}

/** Cabeçalho de página: título + subtítulo. */
export function SkeletonHeader({ className = '' }: { className?: string }) {
  return (
    <div className={`mb-6 space-y-2 ${className}`}>
      <Bloco className="h-6 w-56" />
      <Bloco className="h-4 w-80 max-w-full" />
    </div>
  )
}

/** Fileira de pills de filtro (período/setor). */
export function SkeletonFiltros({ n = 5 }: { n?: number }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {Array.from({ length: n }).map((_, i) => <Bloco key={i} className="h-8 w-24 rounded-full" />)}
    </div>
  )
}

/** Grade de KPI cards (silhueta do KpiCard: rótulo + valor). */
export function SkeletonKpis({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <Bloco className="mb-3 h-3 w-24" />
          <Bloco className="h-7 w-28" />
        </div>
      ))}
    </div>
  )
}

/** Card de gráfico (título + área do gráfico). */
export function SkeletonGrafico({ altura = 'h-64' }: { altura?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <Bloco className="mb-4 h-5 w-48" />
      <Bloco className={`w-full ${altura}`} />
    </div>
  )
}

/** Card de tabela (título opcional + N linhas). */
export function SkeletonTabela({ linhas = 8, titulo = true }: { linhas?: number; titulo?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      {titulo && <Bloco className="mb-4 h-5 w-48" />}
      <div className="space-y-2.5">
        {Array.from({ length: linhas }).map((_, i) => <Bloco key={i} className="h-8 w-full" />)}
      </div>
    </div>
  )
}

/** Envelope do skeleton. `container` só p/ EXTRAS de layout (ex.: `h-full flex flex-col`) — o
 *  respiro horizontal (px) e o vertical (py) vêm do `<main>` (fonte única, v5.1.1). */
export function SkeletonPagina({ container = '', children }: { container?: string; children: ReactNode }) {
  return <div className={container} aria-hidden="true">{children}</div>
}

// ── Templates de página ───────────────────────────────────────────────────────

/** Dashboard: header + filtros + KPIs + 2 gráficos (Performance/Fluxo de Caixa/Weddings). */
export function SkeletonDashboard({ kpis = 4 }: { kpis?: number }) {
  return (
    <>
      <SkeletonHeader />
      <SkeletonFiltros />
      <SkeletonKpis n={kpis} />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonGrafico />
        <SkeletonGrafico />
      </div>
    </>
  )
}

/** Página de tabela: header + linha de busca/ação + tabela densa (Solicitações/Acessos/Faturamento). */
export function SkeletonPaginaTabela({ linhas = 8 }: { linhas?: number }) {
  return (
    <>
      <SkeletonHeader />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Bloco className="h-9 w-72 max-w-full rounded-lg" />
        <Bloco className="h-9 w-28 rounded-lg" />
      </div>
      <SkeletonTabela linhas={linhas} />
    </>
  )
}
