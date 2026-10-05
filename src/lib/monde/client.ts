import 'server-only'
import type { z } from 'zod'
import {
  zPaginaVendas, zVendaDetalhe, zPessoa, zProdutoCatalogoDetalhe, zPaginaCatalogo, zCamposPersonalizados,
  type PaginaVendas, type VendaDetalhe, type Pessoa,
} from './schemas'

// Cliente HTTP da API OFICIAL do Monde, versão 3 (v6.2.0). SERVER-ONLY: a chave nunca pode chegar ao
// bundle do cliente (`import 'server-only'` falha o build se vazar). Até a v6.1.x o Janus lia a
// `monde-data`, uma intermediária do TTARS desligada em 02/10/2026 (HTTP 410 em toda chamada).
//
// Regras da v3 que moram AQUI (manual https://ttars.vercel.app/api-do-monde.html + sonda de 05/10):
//   • Auth: `Authorization: Basic <MONDE_V3_API_KEY>` — o segredo JÁ vem em base64; recodificar quebra.
//     `Content-Type: application/json` é obrigatório (sem ele o Monde recusa).
//   • Ritmo: no máximo UMA chamada a cada 1,3 s. Rajadas de 2–4/s levaram 429 nos testes do manual;
//     a 1,3 s, 80 chamadas seguidas em 05/10 não levaram nenhum. 429 ⇒ espera e repete.
//   • Lista: `size` até 50, paginação por CURSOR (`next_cursor` → `?cursor=`; medido: keyset, imune a
//     venda nova entrando no topo durante a varredura). Venda cancelada só vem pedindo os três status.
//
// O cliente também carrega o ORÇAMENTO de tempo da invocação: a rota tem `maxDuration=300` e, a uma
// chamada por 1,3 s, cabem ~180 chamadas. Antes de cada chamada o orçamento é checado; esgotado,
// lança `OrcamentoEsgotado`, que o chamador trata como "parar aqui e continuar no próximo tick" —
// nunca como falha.

export const BASE_URL_V3 = 'https://web.monde.com.br/api/v3'
/** Intervalo mínimo entre duas chamadas (ms). */
export const INTERVALO_MS = 1300
/** Tamanho de página máximo da v3 (pedir mais devolve 50 sem avisar). */
export const TAMANHO_PAGINA = 50
/**
 * Status pedidos na lista. ⚠️ Invariante de segurança da CURA: sem `canceled` a venda cancelada some
 * da lista, sai de `espelhaveis_ids` e a cura a REMOVE do espelho (havia 23 no espelho em 05/10).
 */
export const STATUS_LISTA = 'opened,closed,canceled'

const TIMEOUT_MS = 20_000
const MAX_TENTATIVAS_429 = 4
const ESPERA_429_MS = 5_000
const MAX_TENTATIVAS_REDE = 3

/** Orçamento esgotado: o chamador para de pedir e deixa o resto para a próxima invocação. */
export class OrcamentoEsgotado extends Error {
  constructor() {
    super('orçamento de tempo da invocação esgotado')
    this.name = 'OrcamentoEsgotado'
  }
}

/** Erro HTTP da API, com o status para o chamador decidir (404 de pessoa vira "sem nome"). */
export class ErroMonde extends Error {
  constructor(readonly status: number, contexto: string, mensagem?: string) {
    super(mensagem ?? `[monde:${contexto}] HTTP ${status} ao chamar a API Monde v3.`)
    this.name = 'ErroMonde'
  }
}

/**
 * Falha de INFRAESTRUTURA depois das repetições (429 persistente, 5xx, rede/timeout; `status` 0 = rede).
 * Não diz nada sobre a venda: o chamador para o tick em vez de marcar a venda como `erro` — marcar
 * zeraria o `lido_hash` de vendas corretas e bloquearia a cura por causa de um soluço da API
 * (MÉDIO do revisor, v6.2.0).
 */
export class ErroTransitorio extends ErroMonde {
  constructor(status: number, contexto: string, mensagem?: string) {
    super(status, contexto, mensagem)
    this.name = 'ErroTransitorio'
  }
}

export interface OpcoesCliente {
  /** Instante (epoch ms) a partir do qual nenhuma chamada nova começa. Default: sem limite. */
  prazo?: number
  intervaloMs?: number
  /** Injeção para teste. Default: `fetch` global. */
  fetchImpl?: typeof fetch
  /** Injeção para teste. Default: relógio real. */
  agora?: () => number
  dormir?: (ms: number) => Promise<void>
}

export interface ClienteMonde {
  listarVendas(cursor: string | null): Promise<PaginaVendas>
  detalheVenda(id: string): Promise<{ detalhe: VendaDetalhe; raw: unknown }>
  /** `null` quando o Monde não tem a pessoa (404). */
  pessoa(id: string): Promise<Pessoa | null>
  /** Nome do produto do catálogo; `null` em 404. */
  produto(id: string): Promise<{ id: string; nome: string | null; kind: string | null } | null>
  listarCatalogo(cursor: string | null): Promise<z.infer<typeof zPaginaCatalogo>>
  camposPersonalizados(): Promise<z.infer<typeof zCamposPersonalizados>>
  /** Chamadas HTTP feitas (inclui repetições por 429) e quantos 429 vieram. */
  readonly metricas: { chamadas: number; c429: number }
  /** Milissegundos que ainda restam no orçamento (Infinity sem prazo). */
  restaMs(): number
}

/** Chave da API. Ausência é erro de OPERAÇÃO (config faltando), não de dado — lança cedo. */
function chaveV3(): string {
  const key = process.env.MONDE_V3_API_KEY?.trim()
  if (!key) throw new Error('MONDE_V3_API_KEY ausente — configure o ambiente da integração Monde (.env / Vercel).')
  return key
}

/** Query string da lista. Montada à mão para a vírgula dos status ir literal (como o manual mostra). */
export function queryListaVendas(cursor: string | null): string {
  const base = `size=${TAMANHO_PAGINA}&status=${STATUS_LISTA}`
  return cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : `${base}&page=1`
}

export function criarClienteMonde(opcoes: OpcoesCliente = {}): ClienteMonde {
  const key = chaveV3()
  const intervalo = opcoes.intervaloMs ?? INTERVALO_MS
  const fetchImpl = opcoes.fetchImpl ?? fetch
  const agora = opcoes.agora ?? (() => Date.now())
  const dormir = opcoes.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const prazo = opcoes.prazo ?? Number.POSITIVE_INFINITY
  const metricas = { chamadas: 0, c429: 0 }
  let ultima = Number.NEGATIVE_INFINITY

  async function aguardarVez(): Promise<void> {
    const espera = ultima + intervalo - agora()
    if (espera > 0) await dormir(espera)
    if (agora() >= prazo) throw new OrcamentoEsgotado()
    ultima = agora()
  }

  /**
   * Espera de repetição (429/5xx/rede) que NUNCA passa do prazo: um `Retry-After` longo, somado às
   * repetições, mataria a função no `maxDuration` sem rodar o `finally` — lock preso por 900 s e
   * execução eternamente "running" (MÉDIO do revisor). Não cabe ⇒ `OrcamentoEsgotado`.
   */
  async function esperarRepeticao(ms: number): Promise<void> {
    if (agora() + ms >= prazo) throw new OrcamentoEsgotado()
    await dormir(ms)
  }

  /** GET com ritmo, 429 com espera e retry de rede/5xx. Devolve o JSON ou `null` em 404. */
  async function get(caminho: string, contexto: string): Promise<unknown | null> {
    let tentativas429 = 0
    let tentativasRede = 0
    for (;;) {
      await aguardarVez()
      metricas.chamadas++
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
      let resp: Response
      try {
        resp = await fetchImpl(`${BASE_URL_V3}${caminho}`, {
          method: 'GET',
          headers: { Authorization: `Basic ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          signal: ctrl.signal,
          cache: 'no-store',
        })
      } catch (e) {
        clearTimeout(timer)
        tentativasRede++
        if (tentativasRede >= MAX_TENTATIVAS_REDE) {
          const abortado = e instanceof Error && e.name === 'AbortError'
          throw new ErroTransitorio(0, contexto,
            `[monde:${contexto}] ${abortado ? `tempo de resposta excedido (${TIMEOUT_MS}ms)` : 'falha de rede'} ao chamar a API Monde v3.`)
        }
        await esperarRepeticao(500 * tentativasRede)
        continue
      }
      clearTimeout(timer)

      if (resp.status === 429) {
        metricas.c429++
        tentativas429++
        if (tentativas429 > MAX_TENTATIVAS_429) throw new ErroTransitorio(429, contexto)
        const retryAfter = Number(resp.headers.get('retry-after'))
        await esperarRepeticao(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : ESPERA_429_MS)
        continue
      }
      if (resp.status >= 500) {
        tentativasRede++
        if (tentativasRede >= MAX_TENTATIVAS_REDE) throw new ErroTransitorio(resp.status, contexto)
        await esperarRepeticao(500 * tentativasRede)
        continue
      }
      if (resp.status === 404) return null
      if (!resp.ok) throw new ErroMonde(resp.status, contexto) // 400/401/403: repetir não ajuda
      return (await resp.json()) as unknown
    }
  }

  function validar<T>(schema: z.ZodType<T>, json: unknown, contexto: string): T {
    const r = schema.safeParse(json)
    if (!r.success) throw new Error(`[monde:${contexto}] formato inesperado na resposta: ${r.error.message}`)
    return r.data
  }

  return {
    metricas,
    restaMs: () => prazo - agora(),

    async listarVendas(cursor) {
      const json = await get(`/sales?${queryListaVendas(cursor)}`, 'sales')
      if (json === null) throw new ErroMonde(404, 'sales')
      return validar(zPaginaVendas, json, 'sales')
    },

    async detalheVenda(id) {
      const json = await get(`/sales/${encodeURIComponent(id)}`, 'sale')
      if (json === null) throw new ErroMonde(404, 'sale')
      return { detalhe: validar(zVendaDetalhe, json, `sale ${id}`), raw: json }
    },

    async pessoa(id) {
      const json = await get(`/people/${encodeURIComponent(id)}`, 'people')
      return json === null ? null : validar(zPessoa, json, 'people')
    },

    async produto(id) {
      const json = await get(`/products/${encodeURIComponent(id)}`, 'products')
      if (json === null) return null
      const p = validar(zProdutoCatalogoDetalhe, json, 'products')
      return { id: p.id, nome: p.name ?? null, kind: p.kind ?? null }
    },

    async listarCatalogo(cursor) {
      const q = cursor ? `size=${TAMANHO_PAGINA}&cursor=${encodeURIComponent(cursor)}` : `size=${TAMANHO_PAGINA}&page=1`
      const json = await get(`/products?${q}`, 'products')
      if (json === null) throw new ErroMonde(404, 'products')
      return validar(zPaginaCatalogo, json, 'products')
    },

    async camposPersonalizados() {
      const json = await get('/custom_fields?resource=sales', 'custom_fields')
      if (json === null) throw new ErroMonde(404, 'custom_fields')
      return validar(zCamposPersonalizados, json, 'custom_fields')
    },
  }
}
