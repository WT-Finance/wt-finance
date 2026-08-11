'use client'

/**
 * Anel de destaque — WT Finance Design System (v5.6.1).
 *
 * Primitivo GENÉRICO (sem semântica de metas): um círculo de contorno, sem
 * preenchimento/track de fundo (não é indicador de progresso — não recebe %),
 * com um valor centrado e um rótulo abaixo. SVG puro (não é série de dados,
 * então não passa pelos primitivos de eixo/grid de Recharts).
 *
 * O texto é HTML sobreposto (não `<text>` do SVG) — fica selecionável/copiável
 * e não duplica para leitor de tela: o wrapper leva `role="img"` com
 * `aria-label` combinando rótulo+valor (o SVG em si é `aria-hidden`).
 */

interface Props {
  /** Valor já formatado pelo chamador (ex.: fmtMi/fmtBRL). */
  valor: string
  /** Rótulo exibido abaixo do anel (ex.: "Meta Agosto"). */
  rotulo: string
  /** Cor do traço do anel — token CSS (ex.: 'var(--marca-lazer)'). */
  cor: string
  /** Diâmetro do anel em px. Default 168. */
  tamanho?: number
}

export function AnelKpi({ valor, rotulo, cor, tamanho = 168 }: Props) {
  const raio = tamanho / 2
  const espessura = raio * 0.1
  const raioTraco = raio - espessura / 2
  const fontSizeValor = Math.round(tamanho / 7)

  return (
    <div
      className="flex flex-col items-center gap-4"
      role="img"
      aria-label={`${rotulo}: ${valor}`}
    >
      <div className="relative" style={{ width: tamanho, height: tamanho }}>
        <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} aria-hidden="true">
          <circle cx={raio} cy={raio} r={raioTraco} fill="none" stroke={cor} strokeWidth={espessura} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center px-2">
          <span
            className="font-bold tabular-nums leading-none text-text-primary"
            style={{ fontSize: fontSizeValor }}
          >
            {valor}
          </span>
        </div>
      </div>
      {/* Selo do rótulo: caixa preenchida como a referência do Yan, porém arredondada e
          na cor recebida (ajuste 11/08). Texto branco — as cores de marca têm contraste. */}
      <span
        className="rounded-full px-4 py-1.5 text-sm font-semibold text-white"
        style={{ background: cor }}
      >
        {rotulo}
      </span>
    </div>
  )
}
