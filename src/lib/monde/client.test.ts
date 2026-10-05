import { describe, it, expect, vi, beforeEach } from 'vitest'

// client.ts é `import 'server-only'`: fora do bundle Next o marker lança por design — mock vazio
// (mesmo padrão de ingest.test.ts).
vi.mock('server-only', () => ({}))

import {
  criarClienteMonde, queryListaVendas, OrcamentoEsgotado, ErroMonde, ErroTransitorio, STATUS_LISTA, INTERVALO_MS, BASE_URL_V3,
} from './client'

/** Relógio e `fetch` falsos: `dormir` avança o relógio, então o teste mede o RITMO sem esperar. */
function ambiente(respostas: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  let t = 1_000_000
  const chamadas: { url: string; em: number; headers: Record<string, string> }[] = []
  const fila = [...respostas]
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, em: t, headers: init?.headers as Record<string, string> })
    const r = fila.shift() ?? { status: 200, body: {} }
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers })
  }) as unknown as typeof fetch
  return {
    chamadas,
    agora: () => t,
    dormir: async (ms: number) => { t += ms },
    avancar: (ms: number) => { t += ms },
    fetchImpl,
  }
}

const PAGINA = { data: [], pagination: { has_next_page: false, next_cursor: null } }

beforeEach(() => {
  process.env.MONDE_V3_API_KEY = 'dXNlcjpzZW5oYQ==' // base64 sintético
})

describe('queryListaVendas', () => {
  // Invariante de segurança da CURA: sem `canceled` a venda cancelada some da lista, sai de
  // espelhaveis_ids e a cura a apaga do espelho.
  it('pede os TRÊS status, sempre — na 1ª página e com cursor', () => {
    expect(STATUS_LISTA).toBe('opened,closed,canceled')
    expect(queryListaVendas(null)).toContain('status=opened,closed,canceled')
    expect(queryListaVendas('abc')).toContain('status=opened,closed,canceled')
  })
  it('1ª página por page=1; depois por cursor codificado; size 50', () => {
    expect(queryListaVendas(null)).toBe('size=50&status=opened,closed,canceled&page=1')
    expect(queryListaVendas('eyJ--a=b')).toBe('size=50&status=opened,closed,canceled&cursor=eyJ--a%3Db')
  })
})

describe('criarClienteMonde', () => {
  it('manda a chave em Basic SEM recodificar e o Content-Type obrigatório', async () => {
    const amb = ambiente([{ status: 200, body: PAGINA }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await c.listarVendas(null)
    expect(amb.chamadas[0].url).toBe(`${BASE_URL_V3}/sales?size=50&status=opened,closed,canceled&page=1`)
    expect(amb.chamadas[0].headers.Authorization).toBe('Basic dXNlcjpzZW5oYQ==')
    expect(amb.chamadas[0].headers['Content-Type']).toBe('application/json')
  })

  it('ritmo: duas chamadas seguidas ficam a ≥1,3 s uma da outra', async () => {
    const amb = ambiente([{ status: 200, body: PAGINA }, { status: 200, body: PAGINA }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await c.listarVendas(null)
    await c.listarVendas('x')
    expect(amb.chamadas[1].em - amb.chamadas[0].em).toBeGreaterThanOrEqual(INTERVALO_MS)
  })

  it('429: espera (Retry-After) e repete; conta nas métricas', async () => {
    const amb = ambiente([{ status: 429, headers: { 'retry-after': '7' } }, { status: 200, body: PAGINA }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await c.listarVendas(null)
    expect(c.metricas).toEqual({ chamadas: 2, c429: 1 })
    expect(amb.chamadas[1].em - amb.chamadas[0].em).toBeGreaterThanOrEqual(7000)
  })

  it('429 persistente vira ErroMonde(429), não laço infinito', async () => {
    const amb = ambiente(Array.from({ length: 10 }, () => ({ status: 429 })))
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await expect(c.listarVendas(null)).rejects.toBeInstanceOf(ErroMonde)
  })

  // Um Retry-After longo, somado às repetições, mataria a função no maxDuration sem rodar o `finally`
  // (lock preso, execução "running"). A espera nunca passa do prazo.
  it('429 com Retry-After maior que o orçamento restante ⇒ OrcamentoEsgotado, sem dormir além do prazo', async () => {
    const amb = ambiente([{ status: 429, headers: { 'retry-after': '120' } }, { status: 200, body: PAGINA }])
    const prazo = amb.agora() + 60_000
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir, prazo })
    await expect(c.listarVendas(null)).rejects.toBeInstanceOf(OrcamentoEsgotado)
    expect(amb.agora()).toBeLessThan(prazo)
    expect(amb.chamadas).toHaveLength(1)
  })

  it('5xx persistente vira ErroTransitorio (é da API, não da venda)', async () => {
    const amb = ambiente([{ status: 502 }, { status: 503 }, { status: 500 }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await expect(c.detalheVenda('x')).rejects.toBeInstanceOf(ErroTransitorio)
  })

  it('orçamento esgotado: lança OrcamentoEsgotado SEM chamar a API', async () => {
    const amb = ambiente([{ status: 200, body: PAGINA }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir, prazo: amb.agora() - 1 })
    await expect(c.listarVendas(null)).rejects.toBeInstanceOf(OrcamentoEsgotado)
    expect(amb.chamadas).toHaveLength(0)
  })

  it('404 de pessoa é null (sem nome), 403 lança — repetir não ajuda', async () => {
    const amb = ambiente([{ status: 404 }, { status: 403 }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    expect(await c.pessoa('p1')).toBeNull()
    await expect(c.pessoa('p2')).rejects.toMatchObject({ status: 403 })
    expect(amb.chamadas).toHaveLength(2)
  })

  // A lista é ESTRITA: resposta malformada que virasse "página vazia sem próxima" encerraria a
  // varredura cedo e a cura apagaria o que não foi listado.
  it('lista malformada LANÇA em vez de virar página vazia', async () => {
    const amb = ambiente([{ status: 200, body: { data: 'oops' } }])
    const c = criarClienteMonde({ fetchImpl: amb.fetchImpl, agora: amb.agora, dormir: amb.dormir })
    await expect(c.listarVendas(null)).rejects.toThrow(/formato inesperado/)
  })

  it('sem MONDE_V3_API_KEY falha cedo, com mensagem de configuração', () => {
    delete process.env.MONDE_V3_API_KEY
    expect(() => criarClienteMonde()).toThrow(/MONDE_V3_API_KEY ausente/)
  })
})
