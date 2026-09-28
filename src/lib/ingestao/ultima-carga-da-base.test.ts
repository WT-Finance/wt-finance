import { describe, it, expect, vi, beforeEach } from 'vitest'

// `ultima-carga-da-base.ts` (e o `log.ts` que ele envelopa) são `server-only` — neutralizado no
// vitest (mesmo molde de `log.test.ts`). Mocka `getAdminClient`, não `./log`: exercita a cadeia
// REAL até `ultimaCargaAplicada` (log.ts não é tocado por esta missão — outro agente está nele),
// o que também prova que este helper não regride se `log.ts` mudar de forma compatível.
vi.mock('server-only', () => ({}))

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    void alcance
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))

import { buscarUltimaCargaDaBase } from './ultima-carga-da-base'

const LINHA_APLICADA = {
  existente: undefined,
  carga_id: 'c1', base: 'vendas-produto', origem: 'rpa-pad', chave_id: 7, usuario_id: 'u1',
  idempotencia: null, extraido_em: null, recebido_em: '2026-09-22T00:00:00Z',
  concluido_em: '2026-09-22T10:00:00Z',
  arquivos: [{ nome: 'a.xlsx' }], linhas: 100, somas: null, checksums_conferidos: 5,
  checksums_falhos: 0, rejeitadas_por_data: 0, pares_novos: 0, diff: null, status: 'aplicada',
  erro: null, duracao_ms: 1234, resposta: null, observacao: null,
}

beforeEach(() => {
  rpcMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('buscarUltimaCargaDaBase', () => {
  it('devolve SÓ o concluido_em quando há carga aplicada', async () => {
    rpcMock.mockResolvedValueOnce({ data: LINHA_APLICADA, error: null })
    const r = await buscarUltimaCargaDaBase('vendas-produto')
    expect(r).toBe('2026-09-22T10:00:00Z')
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_ultima', { p_base: 'vendas-produto' })
  })

  it('devolve null quando a base nunca teve carga aplicada (RPC devolve null)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    expect(await buscarUltimaCargaDaBase('lancamentos-aberto')).toBeNull()
  })

  it('devolve null (nunca lança) quando a RPC falha', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    expect(await buscarUltimaCargaDaBase('lancamentos-movimentacao')).toBeNull()
  })

  it('devolve null quando a linha vem em formato inesperado (sem carga_id/status)', async () => {
    rpcMock.mockResolvedValueOnce({ data: { algumaCoisa: 1 }, error: null })
    expect(await buscarUltimaCargaDaBase('vendas-produto')).toBeNull()
  })

  it('devolve null quando concluido_em vem em formato inesperado (não-string)', async () => {
    rpcMock.mockResolvedValueOnce({ data: { ...LINHA_APLICADA, concluido_em: 12345 }, error: null })
    expect(await buscarUltimaCargaDaBase('vendas-produto')).toBeNull()
  })
})
