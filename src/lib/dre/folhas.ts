// ── Folhas do demonstrativo (v5.8.1) — módulo PURO ────────────────────────────
// A unidade de agregação das duas cascatas novas: quanto cada **folha** da árvore
// (o bloco que recebe categorias) somou numa janela de meses.
//
// ── Por que "folha" e não `tipo` ─────────────────────────────────────────────
// O briefing pede "um degrau por SUB da árvore", mas `tipo` é DADO EDITÁVEL: a `RB_H`
// já migrou de `blocoH` para `tot` na v5.7.1, e a `IMP_H` é `blocoH` sendo folha de
// fato. Filtrar por `t === 'sub'` produziria uma lista que muda sozinha quando alguém
// mexe no editor da estrutura.
//
// ── Por que somar as CATEGORIAS e não as linhas de bloco ─────────────────────
// O payload não carrega `formula`, então não há como saber por ele quem é agregador —
// somar linhas de bloco arriscaria contar o mesmo dinheiro duas vezes (o valor de
// `ADM` está dentro de `DESP_H`, que está dentro de `LOP`…). Já cada linha `t==='cat'`
// traz `g` = a chave do bloco pai, e o conjunto dos `g` distintos É, por definição, o
// conjunto das folhas VIVAS. Agrupar as categorias por `g` dá a árvore viva de graça:
// sem chamada nova, sem lista estática, e acompanhando o editor da estrutura.
//
// ── A identidade que isto compra (MEDIDA, não presumida) ─────────────────────
// Nos dois regimes o resultado do exercício é a soma de todas as folhas — verificado
// em álgebra sobre as árvores vivas e MEDIDO contra a base de produção na abertura da
// v5.8.1 (competência e caixa, 2025 e 2026, quatro payloads, fecha ao centavo):
//
//   caixa: REX = REPASSE + RV + IMP_H + CUSTO + ADM + COM + FIN + MKT + ESTR + RH
//                + RHB + RNOP + DNOP + INV + IMOB + DIST_LUCROS
//   comp:  REX = RV + REEMB + IMP_H + CUSTO + ADM + COM + MKT + ESTR + RH + RHB
//                + FIN + RNOP + DNOP + INV + DL
//
// É essa identidade que faz as duas cascatas fecharem por CONSTRUÇÃO, e não por um
// residual que absorve erro: se toda folha vai a exatamente um degrau, a soma dos
// degraus é exatamente a diferença entre as âncoras.
//
// ⚠️ A BANDEJA FICA DE FORA, de propósito. As "não classificadas" são órfãs do de-para:
// não pertencem a bloco nenhum e **não compõem o REX**. Jogá-las no residual (a leitura
// literal de "toda folha dos dois payloads") quebraria justamente a identidade que o
// briefing manda travar em teste. O mesmo vale para as categorias `excluida`, que a RPC
// nem emite. Hoje as duas bandejas estão zeradas em produção; o desenho não depende
// disso — depende de nunca somá-las aqui.
//
// ── Centavos inteiros ────────────────────────────────────────────────────────
// Toda a aritmética é feita em CENTAVOS INTEIROS, via o `toCentavos` canônico de
// `@/lib/carga/coercao` (que converte pela representação decimal, e não pelo
// `Math.round(v * 100)` que erra em valores como 1.005). Somar reais em ponto
// flutuante e conferir "ao centavo" no fim é como se perde a identidade por 0,01 —
// a lição de dinheiro JS × Postgres que a v5.8.0 registrou. A conversão de volta
// acontece só na borda de exibição.

import { toCentavos } from '@/lib/carga/coercao'
import type { DreMensalLike } from './schemas'

/** Soma por folha, em CENTAVOS INTEIROS, na janela `jan..ateMes`.
 *
 *  `ateMes` fora de [1,12] é tratado por `slice`: 0 ou negativo devolve tudo zerado
 *  (nenhum mês na janela), acima de 12 é o ano inteiro — sem caso especial. */
export function folhasPorGrupo(p: DreMensalLike, ateMes: number): Map<string, number> {
  const m = Math.min(Math.max(Math.trunc(ateMes) || 0, 0), 12)
  const out = new Map<string, number>()

  for (const l of p.linhas) {
    if (l.t !== 'cat') continue
    // Categoria sem bloco pai não existe no contrato (o de-para é quem cria a linha),
    // mas um payload torto não deve derrubar a cascata inteira — ignora e segue.
    if (!l.g) continue

    let soma = 0
    for (const v of l.meses.slice(0, m)) soma += toCentavos(v) ?? 0

    out.set(l.g, (out.get(l.g) ?? 0) + soma)
  }

  return out
}

/** Soma das folhas indicadas, em centavos. Chave ausente vale 0 — é o que permite um
 *  pareamento nomear uma folha que aquele regime não tem (`REEMB` só existe na
 *  competência, `IMOB` só no caixa) sem ramificar no chamador. */
export function somarGrupos(folhas: Map<string, number>, chaves: readonly string[]): number {
  let s = 0
  for (const k of chaves) s += folhas.get(k) ?? 0
  return s
}

/** Total de todas as folhas — o `REX` do regime na janela, em centavos. */
export function totalFolhas(folhas: Map<string, number>): number {
  let s = 0
  for (const v of folhas.values()) s += v
  return s
}
