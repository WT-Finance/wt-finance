// Matemática PURA da barra de rolagem flutuante (v5.0.0) — geometria do thumb e
// conversão arraste→scroll. Extraída para ser testável; o componente
// (<ScrollAutoHide>) e a sidebar só fazem a cola imperativa com o DOM. Vale para
// os dois eixos (passa scrollSize/clientSize/scrollPos do eixo em questão).

export const THUMB_MIN = 28

export interface ThumbGeom {
  visivel: boolean
  /** tamanho do thumb (px) ao longo do eixo. */
  tamanho: number
  /** deslocamento do thumb (px) a partir do início do trilho. */
  pos: number
}

/** Geometria do thumb a partir do estado de scroll de um eixo. */
export function thumbGeom(scrollSize: number, clientSize: number, scrollPos: number): ThumbGeom {
  if (scrollSize <= clientSize + 1) return { visivel: false, tamanho: 0, pos: 0 }
  const tamanho = Math.max(THUMB_MIN, Math.round((clientSize / scrollSize) * clientSize))
  const livre = clientSize - tamanho // trilho livre p/ o thumb percorrer
  const maxScroll = scrollSize - clientSize
  const pos = maxScroll > 0 ? Math.round((scrollPos / maxScroll) * livre) : 0
  return { visivel: true, tamanho, pos }
}

/** Novo scrollPos ao arrastar o thumb `deltaThumb` px ao longo do trilho, a partir
 *  de `scrollInicial`. Converte o deslocamento do thumb no deslocamento de conteúdo
 *  proporcional (razão maxScroll / trilho-livre) e prende em [0, maxScroll]. */
export function scrollAoArrastar(
  deltaThumb: number,
  scrollInicial: number,
  scrollSize: number,
  clientSize: number,
): number {
  const tamanho = Math.max(THUMB_MIN, Math.round((clientSize / scrollSize) * clientSize))
  const livre = clientSize - tamanho
  const maxScroll = scrollSize - clientSize
  if (livre <= 0 || maxScroll <= 0) return 0
  const novo = scrollInicial + (deltaThumb / livre) * maxScroll
  return Math.min(Math.max(novo, 0), maxScroll)
}
