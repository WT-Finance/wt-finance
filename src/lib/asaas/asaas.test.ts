import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// server-only lança fora de contexto de servidor; em vitest (node) é no-op.
vi.mock('server-only', () => ({}))

import { asaasReq, asaasAmbiente, asaasConfigurado, onlyDigits, emailValido } from './client'
import { ensureCustomer } from './customers'
import { findPaymentByExternalRef, criarBoleto, descricaoBoleto } from './boletos'

// Mock de fetch: cada teste empilha as respostas na ordem das chamadas.
type Resp = { ok: boolean; status: number; body: unknown }
let fila: Resp[] = []
let chamadas: Array<{ url: string; method: string; body: unknown }> = []

function mockFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(init.body as string) : undefined })
    const r = fila.shift() ?? { ok: true, status: 200, body: {} }
    return { ok: r.ok, status: r.status, text: async () => JSON.stringify(r.body) } as unknown as Response
  })
}

beforeEach(() => {
  fila = []; chamadas = []
  process.env.ASAAS_API_KEY = '$aact_hmlg_teste'
  process.env.ASAAS_BASE_URL = 'https://sandbox.asaas.com/api/v3'
  vi.stubGlobal('fetch', mockFetch())
})
afterEach(() => { vi.unstubAllGlobals() })

describe('client — ambiente, config, helpers, erro estruturado', () => {
  it('asaasAmbiente: sandbox por default/URL; producao caso contrário', () => {
    expect(asaasAmbiente()).toBe('sandbox')
    process.env.ASAAS_BASE_URL = 'https://api.asaas.com/v3'
    expect(asaasAmbiente()).toBe('producao')
  })
  it('sem ASAAS_API_KEY → erro estruturado, NÃO lança, e nem chama fetch', async () => {
    delete process.env.ASAAS_API_KEY
    const r = await asaasReq('GET', '/customers')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('ASAAS_API_KEY ausente')
    expect(chamadas).toHaveLength(0)
  })
  it('header access_token (não Authorization) é enviado', async () => {
    fila = [{ ok: true, status: 200, body: { data: [] } }]
    await asaasReq('GET', '/customers')
    const f = vi.mocked(fetch).mock.calls[0][1] as RequestInit
    expect((f.headers as Record<string, string>).access_token).toBe('$aact_hmlg_teste')
    expect((f.headers as Record<string, string>).Authorization).toBeUndefined()
  })
  it('erro do Asaas {errors:[{description}]} → extrai a description', async () => {
    fila = [{ ok: false, status: 400, body: { errors: [{ code: 'invalid_name', description: 'O parametro name deve ser informado' }] } }]
    const r = await asaasReq('POST', '/customers', { body: {} })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('O parametro name deve ser informado')
  })
  it('onlyDigits / emailValido', () => {
    expect(onlyDigits('00.111.222/0001-33')).toBe('00111222000133')
    expect(onlyDigits('')).toBeNull()
    expect(emailValido('a@b.com')).toBe(true)
    expect(emailValido('nao-email')).toBe(false)
  })
})

describe('ensureCustomer — fiel ao script legado', () => {
  const dados = { nome: 'Acme Ltda', cpfCnpj: '00111222000133', email: 'a@b.com', endereco: 'Rua X', numero: '10', cep: '66035-145', bairro: 'Centro' }

  it('achado por cpfCnpj → usa, sem update (1 chamada)', async () => {
    fila = [{ ok: true, status: 200, body: { data: [{ id: 'cus_1', cpfCnpj: '00111222000133' }] } }]
    const r = await ensureCustomer(dados)
    expect(r.ok && r.data).toEqual({ customerId: 'cus_1', created: false, updated: false })
    expect(chamadas).toHaveLength(1)
  })
  it('achado por nome SEM cpfCnpj → PUT completa o documento (updated)', async () => {
    fila = [
      { ok: true, status: 200, body: { data: [] } },                       // por cpfCnpj: nada
      { ok: true, status: 200, body: { data: [{ id: 'cus_2', cpfCnpj: null }] } }, // por nome: existe sem doc
      { ok: true, status: 200, body: { id: 'cus_2', cpfCnpj: '00111222000133' } }, // PUT
    ]
    const r = await ensureCustomer(dados)
    expect(r.ok && r.data.updated).toBe(true)
    expect(chamadas[2].method).toBe('PUT')
    expect(chamadas[2].body).toMatchObject({ cpfCnpj: '00111222000133' })
  })
  it('não existe → POST cria com name+cpfCnpj+email+endereço (province=bairro, postalCode só dígitos)', async () => {
    fila = [
      { ok: true, status: 200, body: { data: [] } }, // cpfCnpj: nada
      { ok: true, status: 200, body: { data: [] } }, // nome: nada
      { ok: true, status: 200, body: { id: 'cus_new' } }, // POST
    ]
    const r = await ensureCustomer(dados)
    expect(r.ok && r.data.created).toBe(true)
    expect(chamadas[2].method).toBe('POST')
    expect(chamadas[2].body).toMatchObject({
      name: 'Acme Ltda', cpfCnpj: '00111222000133', email: 'a@b.com',
      address: 'Rua X', addressNumber: '10', province: 'Centro', postalCode: '66035145',
    })
  })
  it('erro de rede/Asaas no meio → propaga estruturado (não lança)', async () => {
    fila = [{ ok: false, status: 500, body: { errors: [{ description: 'Falha interna' }] } }]
    const r = await ensureCustomer(dados)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('Falha interna')
  })
})

describe('boletos — idempotência + criação', () => {
  it('findPaymentByExternalRef: existente → retorna; ausente → null', async () => {
    fila = [{ ok: true, status: 200, body: { data: [{ id: 'pay_1', status: 'PENDING', bankSlipUrl: 'http://x' }] } }]
    const a = await findPaymentByExternalRef('FC-1')
    expect(a.ok && a.data?.id).toBe('pay_1')

    fila = [{ ok: true, status: 200, body: { data: [] } }]
    const b = await findPaymentByExternalRef('FC-2')
    expect(b.ok && b.data).toBeNull()
  })
  it('criarBoleto: payload BOLETO + fine/interest 2% + description padrão', async () => {
    fila = [{ ok: true, status: 200, body: { id: 'pay_9', status: 'PENDING' } }]
    const r = await criarBoleto({ customer: 'cus_1', value: 100.5, dueDate: '2026-06-30', externalReference: 'FC-9' })
    expect(r.ok && r.data.id).toBe('pay_9')
    expect(chamadas[0].body).toMatchObject({
      customer: 'cus_1', billingType: 'BOLETO', value: 100.5, dueDate: '2026-06-30',
      externalReference: 'FC-9', description: descricaoBoleto('FC-9'),
      fine: { value: 2 }, interest: { value: 2 },
    })
  })
  it('asaasConfigurado reflete a presença da chave', () => {
    expect(asaasConfigurado()).toBe(true)
    delete process.env.ASAAS_API_KEY
    expect(asaasConfigurado()).toBe(false)
  })
})
