import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// v6.1.0/M2-C — a API externa de Solicitações (`/api/externo/*`) recusa chave de INGESTÃO
// (errata 4(g) do contrato de ingestão v1): chave com `escopo_bases` NÃO vazio (0274) ⇒
// `403 ESCOPO_INSUFICIENTE`; chave com escopo vazio (a chave de integrador da v5.4.0) segue como
// sempre. E o outro lado da moeda: as rotas de INGESTÃO não mudaram — `autenticarChamada` continua
// sem olhar o escopo, e `autenticarIngestao` (que a usa) continua aceitando a chave de ingestão.
//
// Sem rede e sem banco: a única fronteira mockada é o cliente admin (`api_chave_resolver`,
// `api_chamada_registrar` e as RPCs de negócio viram `rpcMock`) + a sessão (`requireAreaApi`).
// `http.ts` e `carga.ts` são os REAIS — é a cadeia inteira que este arquivo prova, ao contrário de
// `carga.test.ts`, que mocka `autenticarChamada`.
vi.mock('server-only', () => ({}))

const { rpcMock, requireAreaApiMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  requireAreaApiMock: vi.fn(),
}))

vi.mock('@/lib/auth/sessao', () => ({ requireAreaApi: requireAreaApiMock }))

/** `rpc` é método de PROTÓTIPO (não arrow property): `chamarRpcExterna` faz `.bind(admin)`, e um
 *  `vi.fn()` solto passaria mesmo com o `this` perdido (skill `contrato-rpc-front` §1). */
class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    void this.rest
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))

import { autenticarChamada, autenticarChamadaSolicitacoes } from './http'
import { autenticarIngestao } from '@/lib/ingestao/carga'
import { GET as getTipos } from '@/app/api/externo/tipos/route'
import { GET as getSolicitacao } from '@/app/api/externo/solicitacoes/[id]/route'

const CHAVE_INGESTAO = { id: 42, plataforma: 'rpa-pad', robo_user_id: 'user-rpa', escopo_bases: ['lancamentos-operacao'] }
const CHAVE_SOLICITACOES = { id: 7, plataforma: 'integrador', robo_user_id: 'user-int', escopo_bases: [] }

/** Faz o `api_chave_resolver` devolver `chave`; as demais RPCs devolvem `respostas[fn]` (ou `null`). */
function simularRpcs(chave: unknown, respostas: Record<string, unknown> = {}): void {
  rpcMock.mockImplementation(async (fn: string) => {
    if (fn === 'api_chave_resolver') return { data: chave, error: null }
    if (fn === 'api_chamada_registrar') return { data: null, error: null }
    return { data: respostas[fn] ?? null, error: null }
  })
}

function req(chave: string | null): Request {
  return new Request('http://localhost/api/externo/x', chave === null ? {} : { headers: { 'x-api-key': chave } })
}

/** Chamadas ao log de auditoria, na ordem em que ocorreram. */
function chamadasDeLog(): Array<Record<string, unknown>> {
  return rpcMock.mock.calls.filter(([fn]) => fn === 'api_chamada_registrar').map(([, args]) => args as Record<string, unknown>)
}
function chamouRpc(nome: string): boolean {
  return rpcMock.mock.calls.some(([fn]) => fn === nome)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('autenticarChamadaSolicitacoes — o ponto único da API de Solicitações', () => {
  it('chave de INGESTÃO (escopo_bases não vazio) ⇒ 403 ESCOPO_INSUFICIENTE, com o id da chave', async () => {
    simularRpcs(CHAVE_INGESTAO)
    const r = await autenticarChamadaSolicitacoes(req('segredo-rpa'))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
    expect(r.chaveId).toBe(42)
    const corpo = await r.resposta.json()
    expect(corpo.ok).toBe(false)
    expect(corpo.erro.codigo).toBe('ESCOPO_INSUFICIENTE')
    expect(corpo.erro.mensagem).toBe('Chave de ingestão não tem acesso à API de Solicitações.')
  })

  // Achado BAIXO do `revisor`: o filtro `ehBaseIngestao` de `comoChaveResolvida` descarta uma base
  // que existe só no CHECK do banco — a chave só com ela ficaria com `escopo_bases: []` e abriria a
  // porta. A recusa mede o array BRUTO.
  it.each([
    ['base que o TS ainda não conhece (só no CHECK do banco)', ['base-nova-so-no-check']],
    ['mistura de base conhecida e desconhecida', ['lancamentos-operacao', 'base-nova-so-no-check']],
    ['escopo malformado (string, não array)', 'lancamentos-operacao'],
  ])('escopo bruto NÃO vazio — %s ⇒ 403 ESCOPO_INSUFICIENTE, com o id da chave', async (_nome, escopo) => {
    simularRpcs({ id: 43, plataforma: 'rpa-futura', robo_user_id: 'user-x', escopo_bases: escopo })
    const r = await autenticarChamadaSolicitacoes(req('segredo-x'))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
    expect(r.chaveId).toBe(43)
    expect((await r.resposta.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
  })

  it('escopo_bases ausente ou null (chave de integrador) segue passando', async () => {
    for (const chave of [
      { id: 7, plataforma: 'integrador', robo_user_id: 'u' },
      { id: 7, plataforma: 'integrador', robo_user_id: 'u', escopo_bases: null },
    ]) {
      simularRpcs(chave)
      expect((await autenticarChamadaSolicitacoes(req('segredo-integrador'))).ok).toBe(true)
    }
  })

  it('chave de SOLICITAÇÕES (escopo vazio) ⇒ passa, com a mesma chave que autenticarChamada devolve', async () => {
    simularRpcs(CHAVE_SOLICITACOES)
    const r = await autenticarChamadaSolicitacoes(req('segredo-integrador'))
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.chave).toEqual(CHAVE_SOLICITACOES)
  })

  it('sem x-api-key ⇒ 401 AUTH_AUSENTE, sem chave para vincular ao log', async () => {
    const r = await autenticarChamadaSolicitacoes(req(null))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(401)
    expect(r.chaveId).toBeNull()
    expect((await r.resposta.json()).erro.codigo).toBe('AUTH_AUSENTE')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('chave inexistente/revogada (o resolver devolve nada) ⇒ 401 AUTH_INVALIDA, chaveId null', async () => {
    simularRpcs(null)
    const r = await autenticarChamadaSolicitacoes(req('segredo-errado'))
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(401)
    expect(r.chaveId).toBeNull()
    expect((await r.resposta.json()).erro.codigo).toBe('AUTH_INVALIDA')
  })
})

describe('rotas /api/externo/* — a recusa chega ao integrador e ao log de auditoria', () => {
  it('GET /tipos com chave de INGESTÃO ⇒ 403, RPC de negócio NUNCA chamada, chamada negada registrada com a chave', async () => {
    simularRpcs(CHAVE_INGESTAO, { solic_tipos_api: [] })
    const res = await getTipos(req('segredo-rpa'))
    expect(res.status).toBe(403)
    expect((await res.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
    expect(chamouRpc('solic_tipos_api')).toBe(false)
    const log = chamadasDeLog()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ p_chave_id: 42, p_rota: '/api/externo/tipos', p_status: 403 })
    expect(String(log[0].p_detalhe)).toMatch(/^escopo_insuficiente/)
  })

  it('GET /tipos com chave de SOLICITAÇÕES ⇒ 200, RPC de negócio chamada com o id da chave', async () => {
    simularRpcs(CHAVE_SOLICITACOES, { solic_tipos_api: [{ slug: 'reembolso' }] })
    const res = await getTipos(req('segredo-integrador'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, tipos: [{ slug: 'reembolso' }] })
    expect(rpcMock).toHaveBeenCalledWith('solic_tipos_api', { p_chave_id: 7 })
    expect(chamadasDeLog()[0]).toMatchObject({ p_chave_id: 7, p_status: 200 })
  })

  it('GET /solicitacoes/{id} com chave de INGESTÃO ⇒ 403 antes de consultar qualquer solicitação', async () => {
    simularRpcs(CHAVE_INGESTAO)
    const res = await getSolicitacao(req('segredo-rpa'), { params: Promise.resolve({ id: '5' }) })
    expect(res.status).toBe(403)
    expect((await res.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
    expect(chamouRpc('consultar_solicitacoes_externas')).toBe(false)
    expect(chamadasDeLog()[0]).toMatchObject({ p_chave_id: 42, p_rota: '/api/externo/solicitacoes/[id]', p_status: 403 })
  })

  it('GET /solicitacoes/{id} com chave de SOLICITAÇÕES ⇒ passa da autenticação e consulta (404 = não existe, não 403)', async () => {
    simularRpcs(CHAVE_SOLICITACOES, { consultar_solicitacoes_externas: [] })
    const res = await getSolicitacao(req('segredo-integrador'), { params: Promise.resolve({ id: '5' }) })
    expect(res.status).toBe(404)
    expect(chamouRpc('consultar_solicitacoes_externas')).toBe(true)
  })
})

describe('as rotas de INGESTÃO não mudaram — autenticarChamada segue sem olhar o escopo', () => {
  it('autenticarChamada (o helper compartilhado) ainda devolve ok para a chave de ingestão', async () => {
    simularRpcs(CHAVE_INGESTAO)
    const r = await autenticarChamada(req('segredo-rpa'))
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.chave).toEqual(CHAVE_INGESTAO)
  })

  it('autenticarIngestao (real, sobre o http.ts real) aceita a chave de ingestão na base do escopo', async () => {
    simularRpcs(CHAVE_INGESTAO)
    const r = await autenticarIngestao(req('segredo-rpa'), 'lancamentos-operacao')
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.via).toBe('chave')
    expect(requireAreaApiMock).not.toHaveBeenCalled()
  })

  it('autenticarIngestao segue recusando por BASE (chave de Operação pedindo Vendas ⇒ 403 ESCOPO_INSUFICIENTE)', async () => {
    simularRpcs(CHAVE_INGESTAO)
    const r = await autenticarIngestao(req('segredo-rpa'), 'vendas-produto')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
    expect(r.chaveId).toBe(42)
    expect((await r.resposta.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
  })

  it('a chave de SOLICITAÇÕES continua sem acesso à ingestão (escopo vazio não cobre base nenhuma)', async () => {
    simularRpcs(CHAVE_SOLICITACOES)
    const r = await autenticarIngestao(req('segredo-integrador'), 'lancamentos-operacao')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
  })
})

// ── Varredura: toda rota sob /api/externo/ autentica pelo ponto único ────────────────────────────
// O teste de comportamento acima cobre duas rotas; ESTE cobre todas — inclusive a que alguém criar
// amanhã chamando `autenticarChamada` direto (a brecha voltaria calada: tsc, lint e os casos acima
// passariam). Molde das sondas de inventário (`sonda-skipif-silencioso.test.ts`): a lista é o disco.
const RAIZ_REPO = fileURLToPath(new URL('../../../', import.meta.url))
const DIR_EXTERNO = join(RAIZ_REPO, 'src/app/api/externo')

function rotasDe(dir: string): string[] {
  const achadas: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) achadas.push(...rotasDe(caminho))
    else if (e.isFile() && /^route\.(ts|tsx|js)$/.test(e.name)) achadas.push(caminho)
  }
  return achadas.sort()
}

describe('varredura — nenhuma rota de /api/externo/ autentica fora do ponto único', () => {
  const rotas = rotasDe(DIR_EXTERNO).map(abs => ({
    arquivo: relative(RAIZ_REPO, abs).replace(/\\/g, '/'),
    texto: readFileSync(abs, 'utf8'),
  }))

  it('a varredura enxerga as rotas conhecidas (senão não vale nada)', () => {
    expect(rotas.map(r => r.arquivo)).toEqual([
      'src/app/api/externo/solicitacoes/[id]/cancelar/route.ts',
      'src/app/api/externo/solicitacoes/[id]/route.ts',
      'src/app/api/externo/solicitacoes/route.ts',
      'src/app/api/externo/tipos/route.ts',
    ])
  })

  it('cada handler exportado chama autenticarChamadaSolicitacoes e nenhum chama autenticarChamada direto', () => {
    const problemas: string[] = []
    for (const { arquivo, texto } of rotas) {
      const handlers = (texto.match(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g) ?? []).length
      const portas = (texto.match(/\bautenticarChamadaSolicitacoes\(req\)/g) ?? []).length
      if (handlers === 0) problemas.push(`${arquivo}: nenhum handler exportado (a varredura não entende a rota)`)
      if (portas !== handlers) problemas.push(`${arquivo}: ${handlers} handler(s) e ${portas} chamada(s) a autenticarChamadaSolicitacoes(req)`)
      if (/\bautenticarChamada\(/.test(texto)) problemas.push(`${arquivo}: chama autenticarChamada direto — a chave de ingestão passaria`)
    }
    expect(problemas, problemas.join('\n')).toEqual([])
  })
})
