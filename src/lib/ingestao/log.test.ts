import { describe, it, expect, vi, beforeEach } from 'vitest'

// `log.ts` é `server-only` — neutralizado no vitest (mesmo molde de `storage.test.ts`).
// Mocka `getAdminClient` (não há rede real): o que se prova é a TRADUÇÃO parâmetro→RPC e
// RPC→objeto tipado — não o comportamento da RPC em si (isso é prova de banco, fora do escopo
// desta missão: "Não escreva teste que suba servidor nem que chame o banco").
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

import { abrirCarga, concluirCarga, ultimaCargaAplicada, obterCarga } from './log'

const LINHA_ABERTA = {
  existente: false,
  carga_id: 'c1', base: 'vendas-produto', origem: 'rpa-pad', chave_id: 7, usuario_id: null,
  idempotencia: null, extraido_em: null, recebido_em: '2026-09-22T00:00:00Z', concluido_em: null,
  arquivos: [], linhas: null, somas: null, checksums_conferidos: null, checksums_falhos: null,
  rejeitadas_por_data: null, pares_novos: null, diff: null, status: 'aberta', erro: null,
  duracao_ms: null, resposta: null, observacao: null,
}

beforeEach(() => {
  rpcMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('abrirCarga', () => {
  it('chama ingestao_carga_abrir com os p_* corretos e devolve a linha', async () => {
    rpcMock.mockResolvedValueOnce({ data: LINHA_ABERTA, error: null })
    const r = await abrirCarga({
      cargaId: 'c1', base: 'vendas-produto', origem: 'rpa-pad', arquivos: [{ nome: 'a.xlsx' }],
      chaveId: 7, usuarioId: null, idempotencia: null, extraidoEm: null, observacao: null,
    })
    expect(r).toEqual({ ok: true, linha: LINHA_ABERTA })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_abrir', {
      p_carga_id: 'c1', p_base: 'vendas-produto', p_origem: 'rpa-pad', p_arquivos: [{ nome: 'a.xlsx' }],
      p_chave_id: 7, p_usuario_id: null, p_idempotencia: null, p_extraido_em: null, p_observacao: null,
    })
  })

  it('erro de RPC devolve {ok:false} sem lançar', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'BASE_INVALIDA: x' } })
    const r = await abrirCarga({
      cargaId: 'c1', base: 'vendas-produto', origem: 'rpa-pad', arquivos: [],
      chaveId: null, usuarioId: null, idempotencia: null, extraidoEm: null, observacao: null,
    })
    expect(r).toEqual({ ok: false, erro: 'BASE_INVALIDA: x' })
  })

  it('formato inesperado (sem carga_id/status) devolve {ok:false}, não lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: { algumaCoisa: 1 }, error: null })
    const r = await abrirCarga({
      cargaId: 'c1', base: 'vendas-produto', origem: 'rpa-pad', arquivos: [],
      chaveId: null, usuarioId: null, idempotencia: null, extraidoEm: null, observacao: null,
    })
    expect(r.ok).toBe(false)
  })
})

describe('concluirCarga', () => {
  it('chama ingestao_carga_concluir com os p_* corretos', async () => {
    const linhaConcluida = { ...LINHA_ABERTA, status: 'aplicada', linhas: 100 }
    rpcMock.mockResolvedValueOnce({ data: linhaConcluida, error: null })
    const r = await concluirCarga({
      cargaId: 'c1', status: 'aplicada', linhas: 100, checksumsConferidos: 5, checksumsFalhos: 0,
      rejeitadasPorData: 0, paresNovos: 0, diff: { linhas: 10, soma: 1.5 }, resposta: { ok: true }, duracaoMs: 1234,
    })
    expect(r).toEqual({ ok: true, linha: linhaConcluida })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_concluir', {
      p_carga_id: 'c1', p_status: 'aplicada', p_linhas: 100, p_somas: null,
      p_checksums_conferidos: 5, p_checksums_falhos: 0, p_rejeitadas_por_data: 0, p_pares_novos: 0,
      p_diff: { linhas: 10, soma: 1.5 }, p_resposta: { ok: true }, p_erro: null, p_duracao_ms: 1234,
    })
  })

  it('erro de RPC (ex.: CARGA_NAO_ENCONTRADA) devolve {ok:false}, sem derrubar quem chamou', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'CARGA_NAO_ENCONTRADA: carga x não existe' } })
    const r = await concluirCarga({ cargaId: 'inexistente', status: 'erro', erro: 'ERRO_INTERNO: x' })
    expect(r).toEqual({ ok: false, erro: 'CARGA_NAO_ENCONTRADA: carga x não existe' })
  })

  it('RPC que LANÇA (rede) devolve {ok:false} — nunca propaga depois de uma promoção já feita (M6)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpcMock.mockRejectedValueOnce(new Error('fetch failed'))
    const r = await concluirCarga({ cargaId: 'c1', status: 'aplicada', linhas: 100 })
    expect(r).toEqual({ ok: false, erro: 'fetch failed' })
  })
})

describe('ultimaCargaAplicada', () => {
  it('devolve a linha quando a RPC acha uma carga aplicada', async () => {
    const linha = { ...LINHA_ABERTA, status: 'aplicada' }
    rpcMock.mockResolvedValueOnce({ data: linha, error: null })
    expect(await ultimaCargaAplicada('vendas-produto')).toEqual(linha)
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_ultima', { p_base: 'vendas-produto' })
  })

  it('devolve null quando a base nunca teve carga aplicada (RPC devolve null) — estado inicial legítimo', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null })
    expect(await ultimaCargaAplicada('vendas-produto')).toBeNull()
  })

  it('devolve null (nunca lança) quando a RPC falha', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    expect(await ultimaCargaAplicada('vendas-produto')).toBeNull()
  })
})

describe('obterCarga', () => {
  it('chama ingestao_carga_obter com p_carga_id e devolve a linha', async () => {
    rpcMock.mockResolvedValueOnce({ data: LINHA_ABERTA, error: null })
    const r = await obterCarga('c1')
    expect(r).toEqual({ ok: true, linha: LINHA_ABERTA })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_obter', { p_carga_id: 'c1' })
  })
})
