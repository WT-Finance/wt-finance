'use client'

import type { ReactNode } from 'react'
import Tooltip from './tooltip'

// ── <GatilhoAjuda> — afordância "?" de ajuda acessível (v5.9.4) ────────────────
// Dono único da receita do "?" que explica um rótulo/cabeçalho. Existe porque a
// receita foi copiada em 10 lugares (7 em `<span>`, inacessíveis por teclado; só
// 3 em `<button>` correto) e o `<span>` **voltou duas vezes** depois de já estar
// escrito na skill `ui-design-system` — convenção em prosa não segura sozinha.
// A sonda `gatilho-ajuda.test.ts` reprova qualquer `>?</span>` e qualquer
// `>?</button>` fora deste arquivo em `src/`.
//
// Quatro detalhes que já custaram achado de revisor (ALTO, v5.4.2) e que o
// primitivo resolve por construção — nenhum call-site precisa lembrar:
//  1. O gatilho é `<button type="button">`, NUNCA `<span>`: span não entra no
//     tab-order nem é nomeável por leitor de tela, e o `Tooltip` abre no hover
//     **e no foco** — sem gatilho focável essa metade não serve para nada.
//  2. `!whitespace-normal` no balão (com o `!`): o `Tooltip` traz
//     `whitespace-nowrap` na base; sem forçar o wrap um texto longo vira uma
//     linha invisível gigante que transborda em barra de rolagem horizontal.
//  3. Perto da borda direita da tela/tabela, o balão precisa ancorar à direita
//     (`!left-auto right-0`) — plano `absolute left-0` abriria para fora.
//     Ative com a prop `ancoraDireita`.
//  4. Dentro de `<th>` clicável (tabela ordenável), o clique no "?" não pode
//     reordenar a tabela — `pararPropagacao` aplica o `stopPropagation`.
//
// `'use client'`: o botão pode receber `onClick` (via `pararPropagacao`), e
// anexar handler de evento exige que o componente que o define seja Client —
// não dá para deduzir caso a caso se quem importa é RSC ou client component.

interface GatilhoAjudaProps {
  rotulo:            string        // o que o "?" explica (entra no aria-label)
  texto:             string        // a explicação (entra no aria-label; default do balão)
  conteudo?:         ReactNode     // conteúdo rico do balão — default = `texto`
  posicao?:          'baixo' | 'cima'
  classNameBalao?:   string
  ancoraDireita?:    boolean       // última coluna/borda direita — `!left-auto right-0`
  pararPropagacao?:  boolean       // dentro de <th> ordenável — clique não reordena
  className?:        string       // classes extras no botão (ex.: `ml-1`)
}

const BALAO_DEFAULT = 'z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal leading-snug'

export default function GatilhoAjuda({
  rotulo,
  texto,
  conteudo,
  posicao = 'baixo',
  classNameBalao = BALAO_DEFAULT,
  ancoraDireita = false,
  pararPropagacao = false,
  className = '',
}: GatilhoAjudaProps) {
  const balao = ancoraDireita ? `${classNameBalao} !left-auto right-0` : classNameBalao
  return (
    <Tooltip conteudo={conteudo ?? texto} posicao={posicao} className={balao}>
      <button
        type="button"
        onClick={pararPropagacao ? (e) => e.stopPropagation() : undefined}
        aria-label={`${rotulo}: ${texto}`}
        className={`foco-neutro inline-flex h-3 w-3 items-center justify-center rounded-full border border-wt-border-strong text-[8px] font-semibold leading-none text-text-subtle ${className}`}
      >
        ?
      </button>
    </Tooltip>
  )
}
