import { describe, it, expect, vi, beforeEach } from 'vitest'

// `execucao.ts` é `server-only` — neutralizado no vitest (molde de `log.test.ts`). Prova o
// INVARIANTE duro da delegação: as rotas do Monde/CDI são caminho vivo de produção, então
// `abrirExecucao`/`concluirExecucao` NUNCA podem lançar, mesmo com a RPC falhando ou lançando.
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

import { abrirExecucao, concluirExecucao } from './execucao'

beforeEach(() => {
  rpcMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('abrirExecucao', () => {
  it('chama ingestao_execucao_abrir(p_processo) e devolve o id', async () => {
    rpcMock.mockResolvedValueOnce({ data: 'exec-1', error: null })
    const id = await abrirExecucao('monde-incremental')
    expect(id).toBe('exec-1')
    expect(rpcMock).toHaveBeenCalledWith('ingestao_execucao_abrir', { p_processo: 'monde-incremental' })
  })

  it('erro de RPC devolve null, NUNCA lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const id = await abrirExecucao('cdi-mensal')
    expect(id).toBeNull()
  })

  it('formato inesperado (não-string) devolve null', async () => {
    rpcMock.mockResolvedValueOnce({ data: { algo: 1 }, error: null })
    const id = await abrirExecucao('ingestao-vigia')
    expect(id).toBeNull()
  })

  it('RPC que LANÇA (rede) devolve null, NUNCA propaga a exceção', async () => {
    rpcMock.mockRejectedValueOnce(new Error('rede fora'))
    const id = await abrirExecucao('monde-reconciliacao')
    expect(id).toBeNull()
  })
})

describe('concluirExecucao', () => {
  it('chama ingestao_execucao_concluir com os p_* corretos', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    await concluirExecucao('exec-1', 'ok', { janela: 'x' }, null)
    expect(rpcMock).toHaveBeenCalledWith('ingestao_execucao_concluir', {
      p_id: 'exec-1', p_status: 'ok', p_resultado: { janela: 'x' }, p_erro: undefined,
    })
    // "Sem erro" OMITE `p_erro` do corpo (o banco aplica o `DEFAULT NULL`) — `null` não tipa
    // contra o `database.ts` gerado, que declara `p_erro?: string`.
    expect(rpcMock.mock.calls[0][1]).toSatisfy((a: Record<string, unknown>) => a.p_erro === undefined)
  })

  it('com erro, p_erro leva a mensagem', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    await concluirExecucao('exec-1', 'erro', null, 'falhou feio')
    expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_status: 'erro', p_erro: 'falhou feio', p_resultado: null })
  })

  it('id null (abertura falhou/pulada) é NO-OP — nem chama a RPC', async () => {
    await concluirExecucao(null, 'erro', null, 'x')
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('erro de RPC não lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(concluirExecucao('exec-1', 'erro', null, 'falhou')).resolves.toBeUndefined()
  })

  it('RPC que LANÇA não propaga', async () => {
    rpcMock.mockRejectedValueOnce(new Error('rede fora'))
    await expect(concluirExecucao('exec-1', 'pulado')).resolves.toBeUndefined()
  })
})
