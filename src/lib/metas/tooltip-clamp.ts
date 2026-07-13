// Posicionamento do balão da barra de meta (v5.0.0) — lógica PURA (testável) do
// clamp ao viewport. A caixa é centrada no tick (a linha do esperado) quando há
// espaço; perto das bordas, desliza para dentro da tela e a SETA (caret) desloca
// dentro da caixa para continuar apontando o tick. Assim nunca vaza para fora.

export interface ClampInput {
  /** x do tick (esperado) em coordenadas de viewport (px). */
  tickX: number
  /** largura do balão (px). */
  tipW: number
  /** largura da janela (window.innerWidth). */
  viewportW: number
  /** left do container (a barra) em viewport, p/ converter o resultado a coord. relativa. */
  containerLeft: number
  /** margem mínima até a borda da tela (px). */
  margin?: number
  /** distância mínima da seta às bordas do balão (px). */
  caretMin?: number
}

export interface ClampResult {
  /** left do balão RELATIVO ao container (px) — pronto p/ `style.left`. */
  left: number
  /** posição da seta DENTRO do balão (px do canto esquerdo) — `transform-origin` da animação. */
  caret: number
}

export function clampTooltip({
  tickX, tipW, viewportW, containerLeft, margin = 8, caretMin = 12,
}: ClampInput): ClampResult {
  // Faixa válida do canto esquerdo do balão para não passar das bordas da tela.
  const maxLeft = Math.max(margin, viewportW - tipW - margin)
  // Ideal: balão centrado no tick.
  const idealLeft = tickX - tipW / 2
  const leftVp = Math.max(margin, Math.min(idealLeft, maxLeft))
  // Seta aponta o tick (relativa ao balão), presa dentro do balão.
  const caretTeto = Math.max(caretMin, tipW - caretMin)
  const caret = Math.min(Math.max(tickX - leftVp, caretMin), caretTeto)
  return { left: leftVp - containerLeft, caret }
}
