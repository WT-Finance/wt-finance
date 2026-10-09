'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react'
import { totalPreso, type GrupoAno } from '@/lib/marketing/total-preso'

// Prende a coluna "Total" do ano EXPANDIDO sob a borda direita da área visível (matemática em
// `@/lib/marketing/total-preso`). TUDO imperativo, sem estado: a cada scroll escreve
// `transform`/`box-shadow` direto nas células de total (marcadas `data-total-ano`) — como o próprio
// `ScrollAutoHide` faz com o thumb —, então não há re-render por pixel. As posições são MEDIDAS no DOM
// (`offsetLeft`/`offsetWidth`, que ignoram transform), não recalculadas das constantes: com
// `table-fixed` + `w-full` a tabela pode esticar e as colunas deixam de ter a largura declarada.
//
// O viewport rolável é achado subindo a partir da <table> (o `ScrollAutoHide` não expõe ref): o
// 1º ancestral com `overflow-x` auto/scroll. Eventos de scroll chegam pelo `onScroll` que o
// `ScrollAutoHide` repassa ao viewport (`e.currentTarget` = o próprio viewport).

/** Sombra à esquerda + fio de 1px: indica que a coluna está "flutuando" sobre os meses. */
const SOMBRA_PRESA =
  '-6px 0 8px -6px color-mix(in srgb, var(--text-primary) 22%, transparent), inset 1px 0 0 0 var(--border-strong)'

interface GrupoMedido extends GrupoAno {
  celulas: HTMLElement[]
  /** Último deslocamento escrito nas células (NaN = nunca escrito → forçar a escrita). */
  aplicado: number
}

function acharViewport(tabela: HTMLElement): HTMLElement | null {
  for (let el = tabela.parentElement; el; el = el.parentElement) {
    const ox = getComputedStyle(el).overflowX
    if (ox === 'auto' || ox === 'scroll') return el
  }
  return null
}

function escrever(g: GrupoMedido, desloc: number) {
  if (g.aplicado === desloc) return
  g.aplicado = desloc
  for (const c of g.celulas) {
    c.style.transform = desloc === 0 ? '' : `translateX(${desloc}px)`
    c.style.boxShadow = desloc === 0 ? '' : SOMBRA_PRESA
  }
}

/**
 * @param tabelaRef  a <table> (as células de total levam `data-total-ano` e a 1ª coluna de mês de cada
 *                   ano expandido leva `data-grupo-ano`).
 * @param chave      muda sempre que a ESTRUTURA muda (anos abertos, linhas, tabela visível) — remede.
 * @param larguraEsquerda  largura da coluna "Categoria" (sticky à esquerda).
 * @returns `onScroll` para repassar ao `ScrollAutoHide`.
 */
export function useTotalPreso(
  tabelaRef: RefObject<HTMLTableElement | null>,
  chave: string,
  larguraEsquerda: number,
): (e: UIEvent<HTMLDivElement>) => void {
  const grupos = useRef<GrupoMedido[]>([])
  const viewport = useRef<HTMLElement | null>(null)

  const aplicar = useCallback(() => {
    const vp = viewport.current
    if (!vp) return
    const r = totalPreso({
      scrollLeft: vp.scrollLeft,
      larguraVisivel: vp.clientWidth,
      larguraEsquerda,
      grupos: grupos.current,
    })
    for (const g of grupos.current) escrever(g, r && r.ano === g.ano ? Math.round(r.deslocamento) : 0)
  }, [larguraEsquerda])

  const medir = useCallback(() => {
    const tabela = tabelaRef.current
    if (!tabela) { grupos.current = []; viewport.current = null; return }
    viewport.current = acharViewport(tabela)
    // Limpa o deslocamento de TODA célula que o tenha ANTES de remedir — não só das marcadas
    // `data-total-ano`. O React reaproveita células entre renders e não sabe do estilo escrito aqui: o
    // rótulo do ano no cabeçalho tem a MESMA key aberto e recolhido, mas só leva `data-total-ano` quando
    // aberto. Ao RECOLHER, o atributo sumia, a célula escapava de um seletor por atributo e ficava com o
    // translateX antigo — o ano "sumia" do cabeçalho (bug visto pelo Yan, duas vezes).
    for (const c of tabela.querySelectorAll<HTMLElement>('th, td')) {
      if (c.style.transform || c.style.boxShadow) {
        c.style.transform = ''
        c.style.boxShadow = ''
      }
    }
    const porAno = new Map<number, HTMLElement[]>()
    for (const c of tabela.querySelectorAll<HTMLElement>('[data-total-ano]')) {
      const ano = Number(c.dataset.totalAno)
      porAno.set(ano, [...(porAno.get(ano) ?? []), c])
    }
    const medidos: GrupoMedido[] = []
    for (const ini of tabela.querySelectorAll<HTMLElement>('[data-grupo-ano]')) {
      const ano = Number(ini.dataset.grupoAno)
      const total = tabela.querySelector<HTMLElement>(`th[data-total-ano="${ano}"][data-total-ref]`)
      if (!total) continue
      medidos.push({
        ano,
        inicio: ini.offsetLeft,
        fim: total.offsetLeft + total.offsetWidth,
        larguraTotal: total.offsetWidth,
        celulas: porAno.get(ano) ?? [],
        aplicado: Number.NaN,
      })
    }
    grupos.current = medidos
  }, [tabelaRef])

  // Remede e reaplica quando a estrutura muda (antes da pintura — sem 1 frame com a coluna solta).
  useLayoutEffect(() => {
    medir()
    aplicar()
  }, [chave, medir, aplicar])

  // Redimensionamento do viewport ou da tabela muda as posições medidas.
  useEffect(() => {
    const tabela = tabelaRef.current
    if (!tabela) return
    const vp = acharViewport(tabela)
    const ro = new ResizeObserver(() => { medir(); aplicar() })
    ro.observe(tabela)
    if (vp) ro.observe(vp)
    return () => ro.disconnect()
  }, [chave, tabelaRef, medir, aplicar])

  return useCallback(() => aplicar(), [aplicar])
}
