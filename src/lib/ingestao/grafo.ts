// Grafo de dependência de carga do contrato de ingestão v1
// (`docs/contratos/ingestao-v1.md` §2.3 passo 3, §5) — anexo v6.0.0/M7a §1.
//
// Módulo PURO por desenho: nenhum I/O, nenhum `server-only`, nenhum import além de `bases.ts`.
// As arestas são DADO (`ARESTAS_GRAFO_INGESTAO`) e a regra de bloqueio
// (`avaliarDependenciaDeCarga`) é uma função testável sem rede — recebe o que já foi lido por
// fora (a última carga aplicada de cada pré-requisito BLOQUEANTE) e decide. Quem lê o banco
// (`log.ts#lerUltimaCargaAplicada`) e monta o `ErroCarga` 409 é `carga.ts`.

import type { BaseIngestao } from './bases'

/**
 * Uma aresta do §5 — `de` carrega (é pré-requisito de) `para`. `bloqueante: true` é
 * ENFORCEMENT no servidor; o contrato marca **só uma** aresta assim (Aberto → Operação). As
 * demais são ORDEM DECLARADA — a RPA a segue, mas o servidor não impede a ordem inversa:
 * inventar bloqueio nelas seria mudar o contrato (anexo §1).
 *
 * ```
 * vendas-produto ─┬─► lancamentos-movimentacao ─┬─► lancamentos-operacao
 *                 └─► lancamentos-aberto ───────┘        (só esta aresta é bloqueante)
 * demonstrativo-competencia  (independente — nenhuma aresta a toca)
 * ```
 */
export interface ArestaGrafo {
  readonly de: BaseIngestao
  readonly para: BaseIngestao
  readonly bloqueante: boolean
}

export const ARESTAS_GRAFO_INGESTAO: readonly ArestaGrafo[] = [
  { de: 'vendas-produto', para: 'lancamentos-movimentacao', bloqueante: false },
  { de: 'vendas-produto', para: 'lancamentos-aberto', bloqueante: false },
  { de: 'lancamentos-movimentacao', para: 'lancamentos-operacao', bloqueante: false },
  { de: 'lancamentos-aberto', para: 'lancamentos-operacao', bloqueante: true },
]

/**
 * Pré-requisitos BLOQUEANTES de `base` — hoje só `lancamentos-operacao` tem algum
 * (`['lancamentos-aberto']`); as outras quatro (inclusive `demonstrativo-competencia`, que não
 * tem nenhuma aresta) sempre devolvem `[]`.
 */
export function preRequisitosBloqueantes(base: BaseIngestao): readonly BaseIngestao[] {
  return ARESTAS_GRAFO_INGESTAO.filter((a) => a.para === base && a.bloqueante).map((a) => a.de)
}

/** Um pré-requisito bloqueante que NÃO tem carga aplicada hoje — `ultimaAplicadaEm` é o
 *  `concluido_em` (ISO) da última carga aplicada dele, se houver (para a mensagem dizer QUANDO
 *  foi a última vez), ou `null` se nunca houve nenhuma. */
export interface PreRequisitoFaltando {
  readonly base: BaseIngestao
  readonly ultimaAplicadaEm: string | null
}

export type ResultadoDependencia =
  | { readonly ok: true }
  | { readonly ok: false; readonly faltando: readonly PreRequisitoFaltando[] }

/**
 * `iso` é `concluido_em` (timestamptz ISO, em UTC) — devolve a DATA em fuso America/Sao_Paulo
 * (`'YYYY-MM-DD'`), a mesma convenção de `hojeSP()` (`@/lib/fmt.ts`). NUNCA comparar por
 * `split('T')`/fatiar a string ISO: um `concluido_em` de madrugada em UTC já pode ser "o dia
 * seguinte" em UTC e ainda ser "hoje" em SP (fuso −03:00), e vice-versa perto da virada — a
 * mesma armadilha que a skill `ui-design-system` documenta para exibição de timestamptz.
 */
export function dataEmSP(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))
}

/**
 * Regra de bloqueio do §5 — FUNÇÃO PURA (sem rede), testável isolada.
 *
 * `ultimaAplicadaPorPreRequisito` traz, para CADA pré-requisito BLOQUEANTE de `base` (e só
 * eles — os não-bloqueantes nunca precisam entrar aqui), o `concluido_em` da última carga
 * `aplicada` daquela base, ou `null` se nunca houve nenhuma. `hoje` é `hojeSP()`
 * (`'YYYY-MM-DD'`) — passado por quem chama; esta função nunca lê o relógio.
 *
 * Base sem pré-requisito bloqueante (as outras quatro, inclusive Demonstrativo) sempre devolve
 * `{ok:true}` sem olhar o mapa.
 */
export function avaliarDependenciaDeCarga(
  base: BaseIngestao,
  ultimaAplicadaPorPreRequisito: ReadonlyMap<BaseIngestao, string | null>,
  hoje: string,
): ResultadoDependencia {
  const preRequisitos = preRequisitosBloqueantes(base)
  if (preRequisitos.length === 0) return { ok: true }

  const faltando: PreRequisitoFaltando[] = []
  for (const pr of preRequisitos) {
    const concluidoEm = ultimaAplicadaPorPreRequisito.get(pr) ?? null
    const aplicadaHoje = concluidoEm !== null && dataEmSP(concluidoEm) === hoje
    if (!aplicadaHoje) faltando.push({ base: pr, ultimaAplicadaEm: concluidoEm })
  }
  return faltando.length === 0 ? { ok: true } : { ok: false, faltando }
}
