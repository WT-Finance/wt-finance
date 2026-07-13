import { fmtMi } from '@/lib/fmt'

// ── <MetaProgressBar> — barra de progresso de meta (v5.0.0) ──────────────────
// Elemento central dos cards do Acompanhamento de Metas. Trilha neutra +
// preenchimento = % da meta (na COR DE IDENTIDADE do painel; Group = neutro),
// tick MUDO na posição do "esperado até hoje", e um tooltip ESCURO no hover que
// SAI DA LINHA DO ESPERADO (seta para baixo apontando o tick), com decorrido/
// esperado/realizado e a conclusão colorida. O esperado é LINEAR (meta × fração
// do período decorrida), então o tick fica em `pctEsperado` = `pctDecorrido`.
//
// Componente PURO (tooltip CSS-only via group-hover). A régua de status colore só
// a conclusão do tooltip — a barra em si é sempre a cor de identidade.

export interface MetaProgressBarProps {
  /** Preenchimento: % da meta (realizado/meta). null → barra vazia. Largura clampa em 100. */
  pctMeta: number | null
  /** Posição do tick "esperado": esperado/meta × 100 (0..100) = % do período decorrido. */
  pctEsperado: number
  /** Cor do preenchimento — identidade (var(--marca-*)) ou neutro (Group). NUNCA hex. */
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
    <div className="group/bar relative pb-1 pt-2">
      {/* Trilha + preenchimento */}
      <div className="relative w-full overflow-hidden rounded-full bg-zinc-100" style={{ height: altura }}>
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fill}%`, backgroundColor: cor }}
        />
      </div>

      {/* SETA do esperado — marcador estático apontando para baixo, exatamente como a
          seta de onde o balão "nasce" (mesmo tom escuro). O balão abre a partir dela. */}
      <span
        aria-hidden="true"
        className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-zinc-800"
        style={{ left: `${tick}%` }}
      />

      {/* Tooltip escuro no hover — nasce DA SETA do esperado, com animação fluída de
          abrir/fechar (fade + deslize; via opacity/transform, funciona nos dois sentidos).
          A CAIXA abre para o lado com espaço (esquerda se o tick passou da metade, direita
          senão) → nunca vaza para fora perto das extremidades. Seta do balão ancorada a
          1,25rem da borda, posicionada para cair exatamente sobre a seta estática. */}
      <div
        role="tooltip"
        style={tick >= 50
          ? { right: `calc((100% - ${tick}%) - 1.25rem)` }
          : { left: `calc(${tick}% - 1.25rem)` }}
        className="pointer-events-none absolute bottom-full z-20 mb-2 w-max min-w-[13rem] max-w-[15rem] translate-y-1 rounded-lg bg-zinc-800 px-3 py-2.5 text-white opacity-0 shadow-lg transition-[opacity,transform] duration-200 ease-out group-hover/bar:translate-y-0 group-hover/bar:opacity-100 motion-reduce:transition-none"
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
        {/* Seta p/ baixo (o tick), a 1,25rem da borda ancorada. */}
        <span
          aria-hidden="true"
          className={`absolute top-full h-2 w-2 -translate-y-1/2 rotate-45 bg-zinc-800 ${tick >= 50 ? 'right-5' : 'left-5'}`}
        />
      </div>
    </div>
  )
}
