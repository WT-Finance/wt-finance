import { describe, it, expect, vi, beforeEach } from 'vitest'

// Errata 4(b) e (g) do contrato de ingestão v1 (v6.1.0/M2-B), provadas na CAMADA DA ROTA: a
// origem amarrada à credencial e `puladas` só em Operação. Autenticação e `processarCarga` são
// mockados — o que se afirma é o que a rota DECIDE (422, o que loga, e o que entrega a
// `processarCarga`), com os validadores REAIS de `carga.ts`.
vi.mock('server-only', () => ({}))

const { autenticarIngestaoMock, processarCargaMock, registrarChamadaMock } = vi.hoisted(() => ({
  autenticarIngestaoMock: vi.fn(),
  processarCargaMock: vi.fn(),
  registrarChamadaMock: vi.fn(),
}))

vi.mock('@/lib/api-externa/http', () => ({ autenticarChamada: vi.fn(), registrarChamada: registrarChamadaMock }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaApi: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({}) }))
vi.mock('@/lib/ingestao/carga', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/ingestao/carga')>()),
  autenticarIngestao: autenticarIngestaoMock,
  processarCarga: processarCargaMock,
}))

import { POST } from './route'

const CARGA_ID = '3f6c1a2b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const SHA = 'a'.repeat(64)

const AUTH_CHAVE = { ok: true, via: 'chave', chave: { id: 7, plataforma: 'rpa-pad', robo_user_id: 'u', escopo_bases: ['lancamentos-operacao', 'vendas-produto'] } }
const AUTH_SESSAO = { ok: true, via: 'sessao', sessao: { userId: 'uid-1' } }

function corpo(extra: Record<string, unknown> = {}) {
  return {
    carga_id: CARGA_ID,
    arquivos: [{ path: `x/${CARGA_ID}-1-a.csv`, nome: 'a.csv', sha256: SHA }],
    ...extra,
  }
}

function req(base: string, origem: string | null, body: unknown): [Request, { params: Promise<{ base: string }> }] {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (origem !== null) headers['x-ingestao-origem'] = origem
  return [
    new Request(`http://localhost/api/ingestao/${base}`, { method: 'POST', headers, body: JSON.stringify(body) }),
    { params: Promise.resolve({ base }) },
  ]
}

async function chamar(base: string, origem: string | null, body: unknown) {
  const [r, ctx] = req(base, origem, body)
  const resp = await POST(r, ctx)
  return { resp, json: (await resp.json()) as { ok?: boolean; erro?: { codigo: string; mensagem: string } } }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  processarCargaMock.mockResolvedValue({ ok: true, status: 'conferida' })
})

describe('POST /api/ingestao/{base} — origem amarrada à credencial (errata 4(g))', () => {
  it('chave + "manual" ⇒ 422 FORMATO_INVALIDO, logado como origem_incompativel; nada é processado', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    const { resp, json } = await chamar('lancamentos-operacao', 'manual', corpo())
    expect(resp.status).toBe(422)
    expect(json.erro?.codigo).toBe('FORMATO_INVALIDO')
    expect(json.erro?.mensagem).toContain('"manual"')
    expect(json.erro?.mensagem).toContain('rpa-pad')
    expect(registrarChamadaMock).toHaveBeenCalledWith(7, '/api/ingestao/lancamentos-operacao', 422, 'origem_incompativel')
    expect(processarCargaMock).not.toHaveBeenCalled()
  })

  it('chave + "reprocesso" ⇒ 422 (reprocesso é da sessão)', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    const { resp } = await chamar('vendas-produto', 'reprocesso', corpo())
    expect(resp.status).toBe(422)
    expect(processarCargaMock).not.toHaveBeenCalled()
  })

  it('sessão + "rpa-pad" ⇒ 422 FORMATO_INVALIDO; sessão não vai para api_chamada_log', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_SESSAO)
    const { resp, json } = await chamar('lancamentos-operacao', 'rpa-pad', corpo())
    expect(resp.status).toBe(422)
    expect(json.erro?.codigo).toBe('FORMATO_INVALIDO')
    expect(registrarChamadaMock).not.toHaveBeenCalled()
    expect(processarCargaMock).not.toHaveBeenCalled()
  })

  it('sessão + "rpa-cloud" ⇒ 422', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_SESSAO)
    expect((await chamar('vendas-produto', 'rpa-cloud', corpo())).resp.status).toBe(422)
  })

  it.each([
    ['chave', AUTH_CHAVE, 'rpa-pad'],
    ['chave', AUTH_CHAVE, 'rpa-cloud'],
    ['sessão', AUTH_SESSAO, 'manual'],
    ['sessão', AUTH_SESSAO, 'reprocesso'],
  ])('%s + "%s" é um par válido e chega a processarCarga com a origem', async (_via, auth, origem) => {
    autenticarIngestaoMock.mockResolvedValue(auth)
    const { resp } = await chamar('lancamentos-operacao', origem, corpo())
    expect(resp.status).toBe(200)
    expect(processarCargaMock).toHaveBeenCalledTimes(1)
    expect(processarCargaMock.mock.calls[0][0]).toMatchObject({ origem })
  })

  it('o header segue OBRIGATÓRIO e validado contra o enum (ausente ou fora do enum ⇒ 422 origem_invalida)', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    expect((await chamar('lancamentos-operacao', null, corpo())).resp.status).toBe(422)
    expect((await chamar('lancamentos-operacao', 'rpa_pad', corpo())).resp.status).toBe(422)
    expect(registrarChamadaMock).toHaveBeenCalledWith(7, '/api/ingestao/lancamentos-operacao', 422, 'origem_invalida')
    expect(processarCargaMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/ingestao/{base} — `puladas` só em lancamentos-operacao (errata 4(b))', () => {
  const PULADAS = [{ operacao: 'W - Delta', ids: ['id-1'], motivo: 'nome ambíguo no dropdown' }]

  it.each(['vendas-produto', 'demonstrativo-competencia', 'lancamentos-movimentacao', 'lancamentos-aberto'])(
    '%s com "puladas" (mesmo []) ⇒ 422 FORMATO_INVALIDO, logado; nada é processado', async (base) => {
      autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
      for (const puladas of [PULADAS, []]) {
        const { resp, json } = await chamar(base, 'rpa-pad', corpo({ puladas }))
        expect(resp.status).toBe(422)
        expect(json.erro?.codigo).toBe('FORMATO_INVALIDO')
        expect(json.erro?.mensagem).toContain('puladas')
      }
      expect(registrarChamadaMock).toHaveBeenCalledWith(7, `/api/ingestao/${base}`, 422, 'puladas_fora_de_operacao')
      expect(processarCargaMock).not.toHaveBeenCalled()
    },
  )

  it('lancamentos-operacao com "puladas" ⇒ chega a processarCarga como veio', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    const { resp } = await chamar('lancamentos-operacao', 'rpa-pad', corpo({ puladas: PULADAS }))
    expect(resp.status).toBe(200)
    expect(processarCargaMock.mock.calls[0][0]).toMatchObject({ puladas: PULADAS })
  })

  it('sem "puladas" o campo NÃO existe na entrada (o seed e as bases antigas seguem como estavam)', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    await chamar('lancamentos-operacao', 'rpa-pad', corpo())
    expect(processarCargaMock.mock.calls[0][0]).not.toHaveProperty('puladas')
  })

  it('operação de nome vazio, ids ausentes ou motivo ausente ⇒ 422 body_invalido', async () => {
    autenticarIngestaoMock.mockResolvedValue(AUTH_CHAVE)
    for (const puladas of [
      [{ operacao: '   ', ids: [], motivo: 'x' }],
      [{ operacao: 'W - X', motivo: 'x' }],
      [{ operacao: 'W - X', ids: [] }],
    ]) {
      const { resp } = await chamar('lancamentos-operacao', 'rpa-pad', corpo({ puladas }))
      expect(resp.status).toBe(422)
    }
    expect(registrarChamadaMock).toHaveBeenCalledWith(7, '/api/ingestao/lancamentos-operacao', 422, 'body_invalido')
    expect(processarCargaMock).not.toHaveBeenCalled()
  })
})
