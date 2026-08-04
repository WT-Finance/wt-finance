'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

// ── Cortina — primitivo de expandir/recolher (v5.4.4) ────────────────────────
//
// A mecânica da cortina já existia em DOIS lugares — `shared/top-section.tsx`
// (a referência canônica, aprovada em mockup pelo Yan na v5.1.9) e, copiada
// inline, no drill da Decomposição (`financeiro/decomposicao-lancamentos.tsx`).
// A v5.4.4 precisou dela em DOIS níveis aninhados no card de Weddings das
// Metas, o que tornaria a terceira e a quarta cópia. Este arquivo extrai só a
// MECÂNICA; nenhum visual. O call-site continua dono do layout, do cabeçalho e
// de onde põe o chevron — é por isso que aqui não há título, cor nem borda.
//
// Não substitui o `TopSection`: aquele é uma barra full-bleed de SEÇÃO de
// página, com trilho colorido, título em caixa alta e linha-cortina presa ao pé
// do clip. Este é o mínimo para "isto abre e fecha".
//
// TRÊS REGRAS que não são óbvias e já custaram achado de revisor:
//
//  1. A curva é UMA só: 450ms `cubic-bezier(.32,.72,0,1)` animando
//     `grid-template-rows` de `0fr` a `1fr`, filho em `min-h-0 overflow-hidden`.
//     Não recriar a curva (`motion-reduce:transition-none` faz parte dela).
//
//  2. O conteúdo fica MONTADO nos dois estados, com `inert` no fechado. `inert`
//     (React 19) é o que o tira do tab-order e do leitor de tela — achado ALTO
//     do revisor na v5.1.9. Desmontar com `{aberta && ...}` parece equivalente e
//     NÃO é: no fechamento o conteúdo some no mesmo render em que a altura
//     começa a animar, a cortina colapsa uma caixa vazia e o resultado abre
//     bonito e PISCA ao fechar (v5.4.1, Decomposição da DRE). Conteúdo caro se
//     memoiza; não se desmonta.
//     ⚠️ `src/components/financeiro/collapsible-section.tsx` ainda usa o padrão
//     errado (desmonta). Não é referência — não copiar de lá.
//
//  3. NADA de `position:absolute` que precise VAZAR do clip. O `overflow-hidden`
//     corta popover, menu e tooltip do DS (risco registrado na v5.1.9). Caso
//     vivo e concreto: o tooltip de `shared/meta-progress-bar.tsx` é
//     `absolute bottom-full` e seria decapitado aqui dentro — barra dentro de
//     cortina vai com `mostrarTooltip={false}`, e a informação que o balão daria
//     vira texto no próprio conteúdo. Dica curta é atributo `title` nativo, que
//     não vive no DOM.

/** Estado + id compartilhados pelo par gatilho↔conteúdo. O `aria-controls` sai de graça. */
export function useCortina(defaultAberta = false) {
  const [aberta, setAberta] = useState(defaultAberta)
  const idConteudo = useId()
  return {
    aberta,
    idConteudo,
    alternar: () => setAberta(a => !a),
  }
}

interface CortinaProps {
  aberta: boolean
  /** Mesmo id do `controla` do <BotaoCortina>. Vem do `useCortina`. */
  id: string
  /**
   * Estende o clip 16px para cada lado e re-padroniza o conteúdo de volta, para
   * a SOMBRA de cards encostados nas bordas respirar dentro do `overflow-hidden`
   * (o hover de `.card-clicavel` sangra ~10px). Idioma da v5.1.10. Ligar quando
   * o conteúdo tem cards com sombra; deixar desligado dentro de um card estreito,
   * onde a margem negativa passaria por cima do padding do pai.
   */
  folgaSombra?: boolean
  /** Classes do conteúdo revelado (respiro próprio: o primitivo não opina). */
  className?: string
  children: ReactNode
}

/** A janela de revelação. Anima a ALTURA — o conteúdo não desliza. */
export function Cortina({ aberta, id, folgaSombra = false, className, children }: CortinaProps) {
  return (
    <div
      id={id}
      inert={!aberta}
      className="grid transition-[grid-template-rows] duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{ gridTemplateRows: aberta ? '1fr' : '0fr' }}
    >
      <div className={`min-h-0 overflow-hidden ${folgaSombra ? '-mx-4 px-4' : ''}`}>
        <div className={className}>{children}</div>
      </div>
    </div>
  )
}

interface BotaoCortinaProps {
  aberta: boolean
  onAlternar: () => void
  /** Id do conteúdo (`idConteudo` do `useCortina`) — vira `aria-controls`. */
  controla: string
  /**
   * Rótulo acessível da AÇÃO, não do conteúdo (ex.: "Ver subsetores de Weddings").
   * Obrigatório porque o botão é só um ícone: sem isto o leitor de tela anuncia
   * um botão sem nome.
   */
  rotulo: string
  /** px do ícone. 13 nas listas densas, 16 em cabeçalho de card. Default 14. */
  tamanho?: number
  className?: string
}

/**
 * Gatilho só-ícone: chevron que gira 90° ao abrir. Use quando o cabeçalho tem
 * conteúdo próprio (valores, pills) que não deve virar área clicável. Quando o
 * cabeçalho INTEIRO é o gatilho, não use este componente — ponha `aria-expanded`
 * e `aria-controls` no próprio <button> do cabeçalho e só reaproveite a <Cortina>.
 *
 * O ícone tem o tamanho VISUAL de `tamanho` (13–16px), mas o botão carrega
 * `min-h-6 min-w-6` (24px) para cumprir o alvo de toque mínimo da
 * `web-design-guidelines` — só com o padding o chevron ficava em ~17–20px, e este é
 * o gatilho mais usado da tela nova (achado ALTO do revisor na v5.4.4).
 */
export function BotaoCortina({
  aberta, onAlternar, controla, rotulo, tamanho = 14, className,
}: BotaoCortinaProps) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={aberta}
      aria-controls={controla}
      aria-label={rotulo}
      className={`foco-neutro inline-flex min-h-6 min-w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] ${className ?? ''}`}
    >
      <ChevronRight
        size={tamanho}
        aria-hidden="true"
        className={`transition-transform duration-[450ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${aberta ? 'rotate-90' : ''}`}
      />
    </button>
  )
}
