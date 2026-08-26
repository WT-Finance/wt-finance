// ── Decomposição da variação (v5.8.1) — módulo PURO ───────────────────────────
// Cascata âncora-a-âncora: **REX do YTD anterior → um degrau por folha → REX do YTD
// atual**. Responde "o que moveu o resultado de um ano para o outro", na MESMA janela
// de meses dos dois lados.
//
// ── O nome ──────────────────────────────────────────────────────────────────
// O modelo da gerente chama isto de "Decomposição do desvio · previsto (= 2025 YTD)".
// Aqui é "Decomposição da variação · YTD 26 × YTD 25": "desvio" e "previsto" sugerem um
// ORÇAMENTO, e a plataforma não tem base orçamentária — o ano anterior não é uma
// previsão, é história. O conteúdo é idêntico ao dela; o rótulo é que deixa de prometer
// o que não existe. (Fronteira registrada: orçado de verdade segue fora.)
//
// ── Aditividade ─────────────────────────────────────────────────────────────
// `REX_ytd_anterior + Σ degraus ≡ REX_ytd_atual`, ao centavo, porque o REX é a soma das
// folhas nos dois anos (ver `folhas.ts`) e cada folha vira exatamente um degrau. Não há
// pareamento entre árvores aqui — as duas pontas são o MESMO regime —, então o residual
// só recolhe os degraus abaixo do piso de exibição.
//
// ⚠️ A soma EXIBIDA pode divergir da soma dos degraus arredondados. Como na AV da
// v5.7.0, isso não se maquia: o que o leitor confere é cada degrau contra a conta dele.

import type { DreMensalLike, DreLinha } from './schemas'
import { toCentavos } from '@/lib/carga/coercao'
import { chaveDeLinha } from './identidade'
import { rotuloBloco } from './rotulo-bloco'
import { folhasPorGrupo, totalFolhas } from './folhas'
import { agruparPequenos, montarCascata, type Cascata, type Degrau } from './cascata'

/** A única folha com narrativa fixa: distribuição de lucros não tem "categoria que
 *  puxou", tem uma decisão. Explicá-la pelo maior lançamento seria descrever a
 *  mecânica e perder a causa. */
const CHAVE_DISTRIBUICAO = 'DL'
const NARRATIVA_DISTRIBUICAO = 'decisão societária'

/** Rótulos de exibição das folhas, colhidos das linhas de bloco do payload — nunca
 *  hardcoded (a estrutura é editável, e o rótulo é dado). O prefixo contábil sai pelo
 *  `rotuloBloco` canônico: numa cascata o sinal já vem da cor e da direção da barra. */
function rotulosDeFolha(...payloads: DreMensalLike[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const p of payloads) {
    for (const l of p.linhas) {
      if (l.t === 'cat' || !l.chave) continue
      if (!out.has(l.chave)) out.set(l.chave, rotuloBloco(l.rotulo))
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

interface CategoriaDelta { rotulo: string; delta: number }

/** Δ por CATEGORIA dentro de cada folha — a matéria-prima da narrativa.
 *
 *  Casa as categorias entre os dois anos por `chaveDeLinha` (identidade estável), e não
 *  por rótulo nem por posição: uma categoria renomeada continua sendo a mesma conta, e
 *  uma categoria que só existe num dos anos entra com o outro lado valendo zero — que é
 *  exatamente o que ela é, uma conta que nasceu ou morreu no período. */
function deltasPorCategoria(
  atual: DreMensalLike,
  anterior: DreMensalLike,
  ateMes: number,
): Map<string, CategoriaDelta[]> {
  const acc = new Map<string, Map<string, CategoriaDelta>>()

  const acumular = (p: DreMensalLike, sinal: 1 | -1) => {
    for (const l of p.linhas) {
      if (l.t !== 'cat' || !l.g) continue
      const id = chaveDeLinha(l)
      if (!id) continue

      let doGrupo = acc.get(l.g)
      if (!doGrupo) { doGrupo = new Map(); acc.set(l.g, doGrupo) }

      const atualCat = doGrupo.get(id) ?? { rotulo: l.rotulo, delta: 0 }
      atualCat.delta += sinal * ytdCentavos(l, ateMes)
      // O rótulo do ano ATUAL vence (é o nome vigente da conta); o do anterior só
      // preenche quando a conta não existe mais.
      if (sinal === 1) atualCat.rotulo = l.rotulo
      doGrupo.set(id, atualCat)
    }
  }

  acumular(anterior, -1)
  acumular(atual, 1)

  const out = new Map<string, CategoriaDelta[]>()
  for (const [g, cats] of acc) out.set(g, [...cats.values()])
  return out
}

const nfBRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "puxado por Comissão (−124.500,00)" — a categoria de maior |Δ| do grupo.
 *
 *  Vazio quando o grupo não tem categoria com movimento: nesse caso o degrau fala por
 *  si, e uma narrativa apontando uma conta de R$ 0,00 seria pior que silêncio. */
export function narrativaVariacao(chaveFolha: string, cats: readonly CategoriaDelta[]): string {
  if (chaveFolha === CHAVE_DISTRIBUICAO) return NARRATIVA_DISTRIBUICAO

  let maior: CategoriaDelta | null = null
  for (const c of cats) {
    if (c.delta === 0) continue
    if (!maior || Math.abs(c.delta) > Math.abs(maior.delta)) maior = c
  }
  if (!maior) return ''

  const sinal = maior.delta < 0 ? '−' : '+'
  return `puxado por ${maior.rotulo} (${sinal}${nfBRL.format(Math.abs(maior.delta) / 100)})`
}

/**
 * Monta a cascata da variação entre dois anos do MESMO regime, na janela `jan..ateMes`.
 *
 * Os degraus saem ordenados por |Δ| decrescente — numa leitura de "o que explica a
 * variação", o que pesou mais vem primeiro. O residual fica sempre por último.
 */
export function montarDecomposicao(
  atual: DreMensalLike,
  anterior: DreMensalLike,
  ateMes: number,
  rotuloInicial: string,
  rotuloFinal: string,
): Cascata {
  const fAtual    = folhasPorGrupo(atual, ateMes)
  const fAnterior = folhasPorGrupo(anterior, ateMes)
  const rotulos   = rotulosDeFolha(atual, anterior)
  const porCat    = deltasPorCategoria(atual, anterior, ateMes)

  // União das folhas dos dois anos: uma folha criada no ano atual (ou extinta no
  // anterior) tem de aparecer, com o outro lado valendo zero.
  const chaves = new Set<string>([...fAtual.keys(), ...fAnterior.keys()])

  const degraus: Degrau[] = [...chaves]
    .map(k => ({
      rotulo:    rotulos.get(k) ?? k,
      delta:     (fAtual.get(k) ?? 0) - (fAnterior.get(k) ?? 0),
      narrativa: narrativaVariacao(k, porCat.get(k) ?? []),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return montarCascata(
    { rotulo: rotuloInicial, valor: totalFolhas(fAnterior) },
    agruparPequenos(degraus, 0),
    { rotulo: rotuloFinal,   valor: totalFolhas(fAtual) },
  )
}
