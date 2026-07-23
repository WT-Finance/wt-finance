// Matemática PURA da barra de rolagem flutuante (v5.0.0) — geometria do thumb e
// conversão arraste→scroll. Extraída para ser testável; o componente
// (<ScrollAutoHide>) e a sidebar só fazem a cola imperativa com o DOM. Vale para
// os dois eixos (passa scrollSize/clientSize/scrollPos do eixo em questão).

export const THUMB_MIN = 28

/** Respiro PADRÃO nas pontas do trilho (v5.2.0, DS §Barras de rolagem): o thumb não
 *  encosta nas bordas do container — o trilho útil é clientSize − 2×folga. Passar aos
 *  DOIS lados (thumbGeom E scrollAoArrastar) para a proporção do arraste bater. */
export const THUMB_FOLGA = 8

export interface ThumbGeom {
  visivel: boolean
  /** tamanho do thumb (px) ao longo do eixo. */
  tamanho: number
  /** deslocamento do thumb (px) a partir do início do CONTAINER (já inclui a folga). */
  pos: number
}

/** Trilho útil e tamanho do thumb — compartilhado pelas duas funções (proporção única). */
function geometriaBase(scrollSize: number, clientSize: number, folga: number) {
  const trilho  = Math.max(0, clientSize - 2 * folga)
  const tamanho = Math.max(THUMB_MIN, Math.round((clientSize / scrollSize) * trilho))
  const livre   = Math.max(0, trilho - tamanho) // trilho livre p/ o thumb percorrer
  return { tamanho, livre }
}

/** Geometria do thumb a partir do estado de scroll de um eixo. */
export function thumbGeom(scrollSize: number, clientSize: number, scrollPos: number, folga = 0): ThumbGeom {
  if (scrollSize <= clientSize + 1) return { visivel: false, tamanho: 0, pos: 0 }
  const { tamanho, livre } = geometriaBase(scrollSize, clientSize, folga)
  const maxScroll = scrollSize - clientSize
  const pos = folga + (maxScroll > 0 ? Math.round((scrollPos / maxScroll) * livre) : 0)
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
  folga = 0,
): number {
  const { livre } = geometriaBase(scrollSize, clientSize, folga)
  const maxScroll = scrollSize - clientSize
  if (livre <= 0 || maxScroll <= 0) return 0
  const novo = scrollInicial + (deltaThumb / livre) * maxScroll
  return Math.min(Math.max(novo, 0), maxScroll)
}
