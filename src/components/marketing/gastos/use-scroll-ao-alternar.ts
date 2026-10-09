'use client'

import { useEffect, useRef, type RefObject } from 'react'
import { acharViewport } from './use-total-preso'

// Rolagem SUAVE ao expandir/recolher um ano da tabela "Por categoria" — o MESMO comportamento da DRE
// por fluxo de caixa. Origem: `useScrollAoAlternar` em `src/components/financeiro/dre/tabela-dre.tsx`
// (interno àquele arquivo, por isso replicado aqui).
//
// ⚠️ A DRE NÃO anima largura de coluna: as colunas entram/saem do DOM de uma vez (não há `transition`,
// `<col>` animado, `max-width` nem opacidade). O que o olho lê como "animação" é este scroll nativo
// (`behavior: 'smooth'`) — logo, não há duração nem curva próprias: valem as do navegador.
//
//  · ABRINDO um ano: rola até a 1ª coluna de mês dele (encostada na "Categoria" presa à esquerda —
//    `scrollIntoView` ignora a coluna sticky, por isso a conta é manual: `offsetLeft − larguraEsquerda`).
//  · FECHANDO: a DRE manda o scroll para o início/fim da tabela, o que não tem análogo numa tabela de
//    N anos; aqui o ano recolhido é trazido para a área visível só se estiver fora dela (como
//    `inline: 'nearest'`) — o olho fica onde estava.
//
// Compara contra os anos abertos ANTERIORES guardados numa ref (não um flag "já montou"): robusto ao
// duplo-invoke de efeitos do StrictMode e sem scroll no mount. Respeita `prefers-reduced-motion`.
// REDE contra o no-op silencioso do `smooth` (flag de scroll suave desligada no navegador: não rola
// nada e não cai para instantâneo): se ~150 ms depois nada se moveu, refaz em `auto`.
//
// A coluna de total presa (`useTotalPreso`) acompanha sozinha: as larguras mudam de uma vez, no commit
// (o `useLayoutEffect` dele remede antes da pintura), e cada passo do scroll suave dispara `onScroll`.
// Não há transição de largura, então não há `transitionend` a esperar.
//
// Efeito de DOM puro (nunca `setState` dentro do efeito).

export function useScrollAoAlternar(
  tabelaRef: RefObject<HTMLTableElement | null>,
  abertos: readonly number[],
  larguraEsquerda: number,
): void {
  const anterior = useRef<readonly number[]>(abertos)
  useEffect(() => {
    const antes = anterior.current
    anterior.current = abertos
    const abriu = abertos.filter(a => !antes.includes(a))
    const fechou = antes.filter(a => !abertos.includes(a))
    if (abriu.length + fechou.length !== 1) return // mount / re-render sem transição real

    const tabela = tabelaRef.current
    if (!tabela) return
    const viewport = acharViewport(tabela)
    if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return // cabe na tela: nada a rolar

    const atual = viewport.scrollLeft
    const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    let destino = atual

    if (abriu.length === 1) {
      const alvo = tabela.querySelector<HTMLElement>(`th[data-grupo-ano="${abriu[0]}"]`)
      if (!alvo) return
      destino = alvo.offsetLeft - larguraEsquerda
    } else {
      // Ano que saiu da seleção (poda) não tem coluna recolhida: sem alvo, sem scroll.
      const alvo = tabela.querySelector<HTMLElement>(`th[data-ano-recolhido="${fechou[0]}"]`)
      if (!alvo) return
      const esquerda = alvo.offsetLeft
      const direita = esquerda + alvo.offsetWidth
      if (esquerda < atual + larguraEsquerda) destino = esquerda - larguraEsquerda
      else if (direita > atual + viewport.clientWidth) destino = direita - viewport.clientWidth
    }

    destino = Math.min(max, Math.max(0, Math.round(destino)))
    if (Math.abs(destino - atual) < 1) return // já está lá

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      viewport.scrollLeft = destino
      return
    }
    viewport.scrollTo({ left: destino, behavior: 'smooth' })
    const t = window.setTimeout(() => {
      if (viewport.scrollLeft === atual) viewport.scrollLeft = destino
    }, 150)
    return () => window.clearTimeout(t)
  }, [abertos, tabelaRef, larguraEsquerda])
}
