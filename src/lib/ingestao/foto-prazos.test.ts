import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

/** `rpc` no PROTÓTIPO e tocando `this` (skill `contrato-rpc-front` §1): se `foto-prazos.ts` destacasse
 *  o método do client, `this.rest` seria `undefined` e o teste de caminho feliz estouraria. */
class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    expect(alcance.marcador).toBe('postgrest')
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))

import { registrarFotoDePrazos, AVISO_FOTO_PRAZOS_FALHOU } from './foto-prazos'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('registrarFotoDePrazos — fail-soft', () => {
  it('sucesso: chama registrar_foto_prazos(p_carga_id) com o client de metadado e devolve null (sem aviso)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null })
    expect(await registrarFotoDePrazos('carga-1')).toBeNull()
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('registrar_foto_prazos', { p_carga_id: 'carga-1' })
  })

  it('erro DEVOLVIDO (o SDK não lança): vira aviso e é logado — nunca lança', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'permission denied for function registrar_foto_prazos' } })
    expect(await registrarFotoDePrazos('carga-1')).toBe(AVISO_FOTO_PRAZOS_FALHOU)
    expect(console.error).toHaveBeenCalled()
  })

  it('exceção (rede): vira o mesmo aviso — nunca lança', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed'))
    await expect(registrarFotoDePrazos('carga-1')).resolves.toBe(AVISO_FOTO_PRAZOS_FALHOU)
    expect(console.error).toHaveBeenCalled()
  })

  it('o aviso diz que a carga FOI aplicada e não vaza o motivo técnico para a UI', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'SEGREDO-TECNICO' } })
    const aviso = await registrarFotoDePrazos('c')
    expect(aviso).toContain('A carga foi aplicada')
    expect(aviso).not.toContain('SEGREDO-TECNICO')
  })
})
