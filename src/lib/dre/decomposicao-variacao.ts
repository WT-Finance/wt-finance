// ── Do fechamento do ano anterior até aqui (v5.8.1 · reformulado na v5.9.2) ────
// Cascata âncora-a-âncora: **resultado do ano anterior FECHADO → um degrau por folha →
// resultado acumulado até hoje**. Responde "desde que fechamos o ano passado, o que
// aconteceu?".
//
// ── Por que ACUMULAÇÃO e não diferença (a mudança da v5.9.2) ─────────────────
// Até a v5.8.1 esta cascata comparava YTD com YTD: cada degrau era `grupo_atual −
// grupo_anterior`, na mesma janela de meses dos dois lados. O Yan pediu que a figura
// passasse a partir do FECHAMENTO do ano anterior — e o caminho óbvio (trocar a âncora e
// manter a subtração) foi MEDIDO contra a base viva antes de ser implementado:
//
//   · 8 dos 15 degraus INVERTEM DE SINAL, porque um lado tem 12 meses e o outro 8.
//   · RH apareceria em barra VERDE com +814.691,75 — estando pior (38,9% da receita
//     contra 35,4%). A barra é verde porque faltam quatro folhas de pagamento.
//   · Receita de Vendas apareceria em VERMELHO com −3,52 Mi, em pleno crescimento.
//
// Uma cascata cujos degraus dizem o oposto da realidade em metade dos casos não é uma
// leitura ruim, é uma leitura invertida. A saída mantém as âncoras que o Yan quer e troca
// a OPERAÇÃO do degrau: cada barra passa a ser **o que aquele grupo fez no período**, sem
// comparação nenhuma. Nada é distorcido pelo calendário, e a variação que o card existe
// para mostrar é a SOMA dos degraus.
//
// ── Aditividade ─────────────────────────────────────────────────────────────
// `REX_fechado + Σ degraus ≡ acumulado`, ao centavo, porque o REX é a soma das folhas
// (ver `folhas.ts`) e cada folha vira exatamente um degrau. A identidade é consequência
// da partição, não de um residual que ajusta — o residual aqui só recolhe os degraus
// abaixo do piso de exibição.
//
// ⚠️ A soma EXIBIDA pode divergir da soma dos degraus arredondados. Como na AV da
// v5.7.0, isso não se maquia: o que o leitor confere é cada degrau contra a conta dele.

import type { DreMensalLike, DreLinha } from './schemas'
import { toCentavos } from '@/lib/carga/coercao'
import { chaveDeLinha } from './identidade'
import { rotuloBloco, semCaixaAlta } from './rotulo-bloco'
import { folhasPorGrupo, totalFolhas } from './folhas'
import { agruparPequenos, montarCascata, type Cascata, type Degrau } from './cascata'

/** A única folha com narrativa fixa: distribuição de lucros não tem "maior conta", tem
 *  uma decisão. Explicá-la pelo maior lançamento seria descrever a mecânica e perder a
 *  causa. */
const CHAVE_DISTRIBUICAO = 'DL'
const NARRATIVA_DISTRIBUICAO = 'decisão societária'

/** Rótulos de exibição das folhas, colhidos das linhas de bloco do payload — nunca
 *  hardcoded (a estrutura é editável, e o rótulo é dado). O prefixo contábil sai pelo
 *  `rotuloBloco` canônico: numa cascata o sinal já vem da cor e da direção da barra.
 *
 *  E a CAIXA é normalizada por `semCaixaAlta`: a árvore grava `blocoH` em caixa alta e
 *  `sub` em capitalização normal, o que na tabela distingue cabeçalho de subgrupo — mas
 *  aqui os dois viram degraus IRMÃOS, e uma linha gritando entre quinze normais é ruído
 *  (era o caso de "IMPOSTOS E DEDUÇÕES DA RECEITA BRUTA"). A função preserva siglas e é
 *  idempotente, então os rótulos já capitalizados passam intocados. */
function rotulosDeFolha(...payloads: DreMensalLike[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of payloads) {
    for (const l of p.linhas) {
      if (l.t === 'cat' || !l.chave) continue
      if (!out.has(l.chave)) out.set(l.chave, semCaixaAlta(rotuloBloco(l.rotulo)))
    }
  }
  return out
}

/** Soma de uma linha na janela, em centavos. */
function ytdCentavos(l: DreLinha, ateMes: number): number {
  let s = 0
  for (const v of l.meses.slice(0, ateMes)) s += toCentavos(v) ?? 0
  return s
}

interface CategoriaValor { rotulo: string; valor: number }

/** Valor por CATEGORIA dentro de cada folha, no período — a matéria-prima da narrativa.
 *
 *  Casa por `chaveDeLinha` (identidade estável), não por rótulo nem por posição: uma
 *  categoria renomeada continua sendo a mesma conta. */
function categoriasPorFolha(p: DreMensalLike, ateMes: number): Map<string, CategoriaValor[]> {
  const acc = new Map<string, Map<string, CategoriaValor>>()

  for (const l of p.linhas) {
    if (l.t !== 'cat' || !l.g) continue
    const id = chaveDeLinha(l)
    if (!id) continue

    let doGrupo = acc.get(l.g)
    if (!doGrupo) { doGrupo = new Map(); acc.set(l.g, doGrupo) }

    const atual = doGrupo.get(id) ?? { rotulo: l.rotulo, valor: 0 }
    atual.valor += ytdCentavos(l, ateMes)
    atual.rotulo = l.rotulo
    doGrupo.set(id, atual)
  }

  const out = new Map<string, CategoriaValor[]>()
  for (const [g, cats] of acc) out.set(g, [...cats.values()])
  return out
}

const nfBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "maior conta: Comissão (−124.500,00)" — a categoria de maior peso no grupo.
 *
 *  Na v5.8.1 a frase era "puxado por X (Δ)", porque o degrau era uma VARIAÇÃO. Agora o
 *  degrau é um VALOR do período, e "puxado por" prometeria uma comparação que não existe
 *  mais — o rótulo acompanha a mudança de operação em vez de sobreviver a ela.
 *
 *  Vazio quando o grupo não tem categoria com movimento: nesse caso o degrau fala por si,
 *  e apontar uma conta de R$ 0,00 seria pior que silêncio. */
export function narrativaContribuicao(chaveFolha: string, cats: readonly CategoriaValor[]): string {
  if (chaveFolha === CHAVE_DISTRIBUICAO) return NARRATIVA_DISTRIBUICAO

  let maior: CategoriaValor | null = null
  for (const c of cats) {
    if (c.valor === 0) continue
    if (!maior || Math.abs(c.valor) > Math.abs(maior.valor)) maior = c
  }
  if (!maior) return ''

  const sinal = maior.valor < 0 ? '−' : '+'
  return `maior conta: ${maior.rotulo} (${sinal}${nfBRL.format(Math.abs(maior.valor) / 100)})`
}

/**
 * Monta a cascata do fechamento do ano anterior até o acumulado de hoje.
 *
 * `anterior` entra INTEIRO (12 meses — é um exercício encerrado); de `atual` conta-se a
 * janela `ateMes`, que é a cobertura real da base. Os degraus saem ordenados por |valor|
 * decrescente: numa leitura de "o que aconteceu", o que pesou mais vem primeiro. O
 * residual fica sempre por último.
 */
export function montarAcumulacao(
  atual: DreMensalLike,
  anterior: DreMensalLike,
  ateMes: number,
  rotuloInicial: string,
  rotuloFinal: string,
): Cascata {
  const fAtual = folhasPorGrupo(atual, ateMes)
  const rotulos = rotulosDeFolha(atual, anterior)
  const porCat = categoriasPorFolha(atual, ateMes)

  // A âncora inicial é o exercício ANTERIOR FECHADO — 12 meses, sempre. Usar `ateMes` aqui
  // seria voltar à comparação YTD×YTD que esta versão substituiu.
  const inicial = totalFolhas(folhasPorGrupo(anterior, 12))

  const degraus: Degrau[] = [...fAtual.entries()]
    .map(([k, valor]) => ({
      rotulo:    rotulos.get(k) ?? k,
      delta:     valor,
      narrativa: narrativaContribuicao(k, porCat.get(k) ?? []),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return montarCascata(
    { rotulo: rotuloInicial, valor: inicial },
    agruparPequenos(degraus, 0),
    { rotulo: rotuloFinal,   valor: inicial + totalFolhas(fAtual) },
  )
}
