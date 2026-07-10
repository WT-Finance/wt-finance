import { fmtMi } from '@/lib/fmt'

// ── <MetaProgressBar> — barra de progresso de meta (v5.0.0) ──────────────────
// Elemento central dos cards do Acompanhamento de Metas (substitui o Gauge).
// Trilha neutra + preenchimento = % da meta (na COR DE IDENTIDADE do painel;
// Group = neutro), tick MUDO na posição do "esperado até hoje", e um tooltip
// ESCURO no hover (padrão do provisório) com decorrido/esperado/realizado e a
// conclusão colorida (adiantado = success · abaixo = danger).
//
// Componente PURO (sem 'use client'): o tooltip é CSS-only (group-hover), então
// funciona sem JS. A régua de status colore SÓ a conclusão do tooltip — a barra
// em si é sempre a cor de identidade.

export interface MetaProgressBarProps {
  /** Preenchimento: % da meta (realizado/meta). null → barra vazia. Largura clampa em 100. */
  pctMeta: number | null
  /** Posição do tick "esperado": esperado/meta × 100 (0..100). */
  pctEsperado: number
  /** Cor do preenchimento — identidade (var(--setor-*)) ou neutro (Group). NUNCA hex. */
  cor: string
  /** Espessura da barra em px (12 no Group, 10 nos setoriais). Default 10. */
  altura?: number
  /** % do período decorrido em dias (título do tooltip). */
  pctDecorrido: number
  /** Esperado até hoje (R$) — linha do tooltip. */
  esperado: number
  /** Realizado (R$) — linha do tooltip. */
  realizado: number
}

export default function MetaProgressBar({
  pctMeta, pctEsperado, cor, altura = 10, pctDecorrido, esperado, realizado,
}: MetaProgressBarProps) {
  const fill = Math.min(Math.max(pctMeta ?? 0, 0), 100)
  const tick = Math.min(Math.max(pctEsperado, 0), 100)

  const adiantado = realizado >= esperado
  const gap = Math.abs(realizado - esperado)

  return (
    <div className="group/bar relative py-1.5">
      {/* Trilha + preenchimento */}
      <div className="relative w-full overflow-hidden rounded-full bg-zinc-100" style={{ height: altura }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fill}%`, backgroundColor: cor }}
        />
      </div>

      {/* Tick MUDO do esperado — atravessa a barra (poka para fora em cima/baixo). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-0.5 -bottom-0.5 w-0.5 -translate-x-1/2 rounded-full bg-zinc-500"
        style={{ left: `${tick}%` }}
      />

      {/* Tooltip escuro no hover (CSS-only). Ancorado acima-à-esquerda da barra. */}
      <div
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-20 mb-2 w-max min-w-[13rem] max-w-[16rem] rounded-lg bg-zinc-800 px-3 py-2.5 text-white shadow-lg group-hover/bar:visible"
      >
        <p className="mb-1.5 text-2xs font-medium text-zinc-300">
          {Math.round(pctDecorrido)}% do período decorrido
        </p>
        <div className="flex flex-col gap-1 text-xs tabular-nums">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-zinc-400">Esperado</span>
            <span>{fmtMi(esperado)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-zinc-400">Realizado</span>
            <span>{fmtMi(realizado)}</span>
          </div>
        </div>
        <div className="mt-2 border-t border-zinc-700 pt-1.5 text-xs font-medium">
          {adiantado
            ? <span className="text-success">+{fmtMi(gap)} adiantado</span>
            : <span className="text-danger">{fmtMi(gap)} abaixo do esperado</span>}
        </div>
      </div>
    </div>
  )
}
