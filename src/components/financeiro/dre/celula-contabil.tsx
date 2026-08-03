// ── Gramática contábil da DRE, compartilhada (v5.4.1) ─────────────────────────
// Extraído de `tabela-dre.tsx` sem alteração de comportamento quando o Resumo
// Executivo passou a usar a MESMA gramática visual da tabela (v5.4.1/M1). Os dois
// consumidores — a tabela e o Resumo — vivem no mesmo card e mostram as mesmas
// linhas; qualquer divergência entre eles é lida como erro de dado, não como
// escolha de estilo. Por isso o layout da célula e a régua de cor moram aqui, em
// UM lugar, e não em cópias que envelhecem em ritmos diferentes.

import { fmtContabil } from './fmt-contabil'
import type { DreLinha } from '@/lib/dre/schemas'

/** Tipo da linha no demonstrativo. Governa fundo, peso e — o que importa aqui — QUAL
 *  par de tons de cor tem contraste suficiente sobre o fundo daquela linha. */
export type TipoLinha = DreLinha['t']

/** Cor por SINAL, ciente da banda em que a linha está pousada. Não é preciosismo: as
 *  bandas cinza CLARAS (`blocoH` = --band, `sub` = --band-soft) derrubam os tons base
 *  para 3,88–4,31:1, que REPROVA AA — sobre elas vale `*-deep` (7–10:1). A banda ESCURA
 *  (`tot` = --action-primary) inverte a necessidade: ali os tons `*-soft` é que servem
 *  de tinta (6,5:1). Só a linha `cat`, sobre fundo de superfície, usa os tons base.
 *  Zero e ausência ficam neutros — nada a celebrar nem a lamentar. */
export function corPorSinal(tipo: TipoLinha, valor: number | null): string {
  const zero = valor === null || Math.abs(valor) < 0.005
  if (zero) return 'text-text-subtle'
  const negativo = valor < 0
  const escuro = tipo === 'tot'
  const bandaClara = tipo === 'blocoH' || tipo === 'sub'
  if (negativo) return escuro ? 'text-negative-soft' : bandaClara ? 'text-negative-deep' : 'text-negative'
  return escuro ? 'text-positive-soft' : bandaClara ? 'text-positive-deep' : 'text-positive'
}

/** Conteúdo em formato CONTÁBIL (Refino 1) — variante COM PARÊNTESES do padrão do DS
 *  (`@/components/shared/valor-contabil.tsx`, ADR-0124): "R$" mudo (`text-text-subtle`)
 *  ancorado à ESQUERDA, número tabular à DIREITA (`flex justify-between`). O componente
 *  `ValorContabil` do DS NÃO serve aqui: ele formata com `numBRL2` (sinal "−" simples),
 *  mas a DRE precisa do NEGATIVO ENTRE PARÊNTESES de `fmtContabil` (convenção contábil já
 *  em uso na tabela) — o que se replica é só o LAYOUT, não o componente. Zero vira
 *  travessão puro alinhado à direita, SEM "R$" (um prefixo em ~2 mil células vazias seria
 *  só ruído). A cor (sinal/neutro) fica no <td> pai, herdada — só o "R$" força o tom
 *  neutro sempre, qualquer que seja o sinal do valor. */
export function ConteudoContabil({ valor }: { valor: number | null }) {
  const zero = valor === null || Math.abs(valor) < 0.005
  if (zero) return <span className="block text-right">{fmtContabil(0)}</span>
  const negativo = valor < 0
  return (
    <span className="flex justify-between gap-2">
      <span className="text-text-subtle">R$</span>
      <span>
        {fmtContabil(valor)}
        {!negativo && <span className="invisible">)</span>}
      </span>
    </span>
  )
}
