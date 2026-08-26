// ── Linhas-chave da competência (v5.8.1) — módulo PURO ────────────────────────
// O sumário executivo da seção de competência: as oito linhas de manchete da árvore,
// com os anos fechados, os dois YTD comparáveis, a variação e a Análise Vertical.
//
// É o irmão do `ResumoExecutivo` do regime de caixa, e de propósito NÃO é o mesmo
// componente: as colunas são outras (lá são N anos selecionáveis por pills; aqui são
// anos cheios + o par de YTD + Δ% + duas colunas de AV), e forçar um só componente a
// servir os dois desenhos custaria mais do que a duplicação de uma tabela pequena.
// O que NÃO se duplica é a aritmética: a AV sai de `av.ts`, o YTD sai de `folhas.ts`.
//
// ── As oito chaves são ESTÁTICAS, e isso é deliberado ────────────────────────
// Mesma decisão do `ResumoExecutivo` (v5.7.0): derivar a lista de `t === 'tot'` seria
// frágil porque o TIPO de um bloco é dado editável — a `RB_H` já migrou de `blocoH`
// para `tot`. Uma lista de CHAVES sobrevive a isso; um filtro por tipo mudaria de
// conteúdo sozinho. Os RÓTULOS, esses sim, vêm sempre do payload vivo.
//
// ── Duas colunas de AV, um só denominador ────────────────────────────────────
// A AV de cada recorte usa a `RB_H` DAQUELE recorte (o YTD 25 sobre a Receita Bruta do
// YTD 25, o YTD 26 sobre a do YTD 26) — comparar composições exige que cada uma esteja
// certa dentro do próprio período. E a base é a mesma da página inteira
// (`CHAVE_BASE_AV`), nunca uma segunda régua: dois denominadores na mesma tela é o
// defeito que a v5.7.2 corrigiu.
//
// A chave `RB_H` existe nas DUAS árvores (no caixa vale `REPASSE + RV`; na competência,
// `RV + REEMB`), então o módulo de AV atravessa os regimes sem adaptação.

import type { DreMensalLike, DreLinha } from './schemas'
import { toCentavos } from '@/lib/carga/coercao'
import { avPercentual, baseAv, CHAVE_BASE_AV } from './av'

/** As oito linhas de manchete, na ordem de leitura do demonstrativo. */
export const CHAVES_LINHAS_CHAVE = [
  'RB_H', 'ROL', 'LB', 'LOP', 'LL', 'RAIR', 'REX', 'REXG',
] as const

export interface AnoLinhasChave {
  ano: number
  payload: DreMensalLike
  /** `relacao === 'fechado'`: só ano encerrado ganha coluna de ano cheio. Um "2026"
   *  cujo dado vai até agosto, exibido sob o rótulo do ano, é um número que ninguém
   *  consegue ler direito. */
  fechado: boolean
}

export interface ColunaYtd {
  ano: number
  /** Reais. `null` quando o ano não carregou. */
  valor: number | null
  /** Percentual da Receita Bruta do MESMO recorte. `null` = travessão. */
  av: number | null
}

export interface LinhaChave {
  chave: string
  /** Rótulo VIVO do payload, com o prefixo contábil preservado — a tabela é contábil,
   *  e o `(=)` faz parte da gramática dela (diferente da cascata, onde o sinal já vem
   *  da direção da barra e o prefixo vira ruído). */
  rotulo: string
  /** Anos fechados, ascendente. Valor em reais; `null` = ano ausente. */
  cheios: { ano: number; valor: number | null }[]
  /** Os YTD comparados, ascendente (tipicamente [anterior, atual]). */
  ytd: ColunaYtd[]
  /** Variação do último YTD contra o primeiro, em percentual. `null` = travessão. */
  deltaPct: number | null
  /** Totalizador — peso forte na exibição. Vem do payload, não de lista fixa. */
  destaque: boolean
}

/** Soma da linha na janela, em centavos inteiros. */
function ytdCentavos(l: DreLinha, ateMes: number): number {
  let s = 0
  for (const v of l.meses.slice(0, ateMes)) s += toCentavos(v) ?? 0
  return s
}

function acharLinha(p: DreMensalLike, chave: string): DreLinha | undefined {
  return p.linhas.find(l => l.t !== 'cat' && l.chave === chave)
}

/**
 * Variação entre dois YTD, em percentual.
 *
 * `null` quando a base é zero — em centavos inteiros "base zero" é exatamente `0`, o
 * que já implementa o `|YTD25| < 0,005` do briefing (meio centavo é menos que a menor
 * unidade representável aqui). Dividir por zero produziria `Infinity`, e uma variação
 * de "∞%" contra uma base inexistente não informa nada: o travessão é a leitura certa.
 *
 * ⚠️ Com base NEGATIVA o sinal do resultado se inverte em relação à intuição: sair de
 * −100 para −50 é uma MELHORA de 50%, mas a razão dá −0,5. O módulo devolve a razão
 * algébrica crua e deixa a leitura para quem exibe — é a mesma escolha da AV (v5.7.0),
 * e maquiar o sinal aqui esconderia que a base mudou de lado.
 */
export function deltaPercentual(anterior: number, atual: number): number | null {
  if (anterior === 0) return null
  return (atual / anterior - 1) * 100
}

/**
 * Monta as linhas-chave. `anos` deve vir ASCENDENTE; os YTD comparados são os dos
 * anos NÃO fechados mais os fechados recentes — na prática, todos os anos recebidos.
 */
export function montarLinhasChave(anos: readonly AnoLinhasChave[], ateMes: number): LinhaChave[] {
  // Base da AV por ano, uma vez só — é o mesmo denominador para as oito linhas.
  const basePorAno = new Map<number, number | null>()
  for (const a of anos) {
    const l = acharLinha(a.payload, CHAVE_BASE_AV)
    basePorAno.set(a.ano, l ? baseAv(ytdCentavos(l, ateMes) / 100) : null)
  }

  return CHAVES_LINHAS_CHAVE.map(chave => {
    const encontradas = anos
      .map(a => ({ a, l: acharLinha(a.payload, chave) }))
      .filter((x): x is { a: AnoLinhasChave; l: DreLinha } => x.l !== undefined)

    const rotulo   = encontradas.at(-1)?.l.rotulo ?? chave
    const destaque = encontradas.at(-1)?.l.t === 'tot'

    const cheios = anos
      .filter(a => a.fechado)
      .map(a => {
        const l = acharLinha(a.payload, chave)
        return { ano: a.ano, valor: l ? toCentavos(l.total) ?? 0 : null }
      })
      .map(c => ({ ano: c.ano, valor: c.valor === null ? null : c.valor / 100 }))

    const ytd: ColunaYtd[] = anos.map(a => {
      const l = acharLinha(a.payload, chave)
      if (!l) return { ano: a.ano, valor: null, av: null }
      const reais = ytdCentavos(l, ateMes) / 100
      return { ano: a.ano, valor: reais, av: avPercentual(reais, basePorAno.get(a.ano) ?? null) }
    })

    const comValor = ytd.filter(y => y.valor !== null)
    const primeiro = comValor.at(0)
    const ultimo   = comValor.at(-1)
    const deltaPct =
      primeiro && ultimo && primeiro !== ultimo
        ? deltaPercentual(Math.round(primeiro.valor! * 100), Math.round(ultimo.valor! * 100))
        : null

    return { chave, rotulo, cheios, ytd, deltaPct, destaque }
  })
}
