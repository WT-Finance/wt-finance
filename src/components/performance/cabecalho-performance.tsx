import type { ReactNode } from 'react'

/**
 * Cabeçalho das páginas de Performance (Geral/Trips/Corporativo/Weddings) — v6.1.1/M2.
 *
 * Título e subtítulo à esquerda; o(s) selo(s) "Última atualização em" (`children`) à direita,
 * NA MESMA LINHA — o arranjo de `src/app/financeiro/dre/page.tsx`. Em tela estreita o bloco
 * de selos quebra para baixo do título (`flex-wrap`).
 *
 * Por que NÃO mora mais em `src/app/performance/layout.tsx`: o selo vive no conteúdo (a
 * carga vem de `buscarUltimaCargaDaBase` e Weddings tem 2 bases, Geral/Trips/Corp têm 1),
 * numa árvore diferente do layout — título no layout e selo no conteúdo nunca ficam na mesma
 * linha. Agora o cabeçalho é este componente, renderizado por quem conhece o conteúdo:
 *   - `PerformanceContent` / `WeddingsContent` — com os selos em `children`;
 *   - `src/app/performance/loading.tsx` — SEM selos (o dado ainda não chegou); mesma
 *     marcação do título, então não há salto ao trocar skeleton por conteúdo;
 *   - `src/app/performance/page.tsx` — no ramo "em construção" (sem `?preview=1`).
 * Qualquer estado novo da rota tem de renderizar este cabeçalho, ou o título some.
 *
 * Sem hooks, sem 'use client': renderiza no servidor (o `UltimaAtualizacao` filho é o client).
 * `UltimaAtualizacao` devolve `null` sozinho sem data, então cada selo some por conta própria.
 */
export default function CabecalhoPerformance({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div>
        <h1 className="text-xl font-semibold text-text-primary">Performance dos Setores</h1>
        <p className="mt-0.5 text-sm text-text-subtle">Painel de acompanhamento de indicadores de performance</p>
      </div>

      {children && (
        <div className="flex flex-col items-end gap-y-0.5 text-2xs">
          {children}
        </div>
      )}
    </div>
  )
}
