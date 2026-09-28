import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vigia.ts` é `server-only` — neutralizado no vitest. Mocka só as DUAS bordas de I/O
// (`getAdminClient`/RPC e `enviarAlarmeIngestao`/e-mail) — o resto (inclusive `./alarme.ts`) é
// código REAL, exercitado de ponta a ponta na parte de orquestração. A parte que importa mais
// — `decidirAcaoExpectativa` — é PURA e testada isolada, sem nenhum mock.
vi.mock('server-only', () => ({}))

const { rpcMock, enviarAlarmeIngestaoMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  enviarAlarmeIngestaoMock: vi.fn(),
}))

class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    void alcance
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))
vi.mock('@/lib/email/alarme-ingestao', () => ({ enviarAlarmeIngestao: enviarAlarmeIngestaoMock }))

import { decidirAcaoExpectativa, lerVigiaEstado, rodarVigia, type VigiaExpectativa } from './vigia'

beforeEach(() => {
  rpcMock.mockReset()
  enviarAlarmeIngestaoMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── decidirAcaoExpectativa — FUNÇÃO PURA, prova exaustiva (critério da delegação) ───────────

const AGORA_MS = Date.parse('2026-09-24T12:00:00Z')

function expectativaProcesso(overrides: Partial<VigiaExpectativa> = {}): VigiaExpectativa {
  return { alvo: 'monde-incremental', tipo: 'processo', ativo: true, tolerancia_segundos: 2700, ultimo_sinal_em: null, ...overrides }
}

describe('decidirAcaoExpectativa', () => {
  it('processo DENTRO da tolerância, sem incidente aberto ⇒ nada', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 10 * 60 * 1000).toISOString() }) // 10 min atrás
    expect(decidirAcaoExpectativa(exp, AGORA_MS, false)).toEqual({ acao: 'nada' })
  })

  it('processo FORA da tolerância, sem incidente aberto ⇒ abre, com o alarme pronto', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 60 * 60 * 1000).toISOString() }) // 60 min atrás, tolerância 45min
    const acao = decidirAcaoExpectativa(exp, AGORA_MS, false)
    expect(acao.acao).toBe('abrir')
    if (acao.acao !== 'abrir') throw new Error('esperado abrir')
    expect(acao.tipo).toBe('processo_sem_resultado')
    expect(acao.chave).toBe('monde-incremental')
    expect(acao.alarme).toMatchObject({ tipo: 'processo_sem_resultado', processo: 'monde-incremental', minutosSemResultado: 60 })
  })

  it('já ABERTO e ainda fora da tolerância ⇒ nada (não reabre, não reenvia)', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 60 * 60 * 1000).toISOString() })
    expect(decidirAcaoExpectativa(exp, AGORA_MS, true)).toEqual({ acao: 'nada' })
  })

  it('sinal VOLTOU (dentro da tolerância) e havia incidente aberto ⇒ resolve', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 5 * 60 * 1000).toISOString() })
    expect(decidirAcaoExpectativa(exp, AGORA_MS, true)).toEqual({ acao: 'resolver', tipo: 'processo_sem_resultado', chave: 'monde-incremental' })
  })

  it('"pulado" conta como sinal saudável — a RPC já mescla isso em ultimo_sinal_em; a decisão não distingue', () => {
    // Este teste documenta a fronteira: `ingestao_vigia_estado()` (não esta função) é quem
    // trata ok/pulado como equivalentes ao compor `ultimo_sinal_em`. Um sinal recente, de
    // QUALQUER origem saudável, resulta em "nada" (dentro da tolerância).
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 60 * 1000).toISOString() })
    expect(decidirAcaoExpectativa(exp, AGORA_MS, false)).toEqual({ acao: 'nada' })
  })

  it('expectativa INATIVA sem incidente é ignorada, mesmo fora da tolerância e sem sinal algum', () => {
    const exp = expectativaProcesso({ ativo: false, ultimo_sinal_em: null })
    expect(decidirAcaoExpectativa(exp, AGORA_MS, false)).toEqual({ acao: 'nada' })
    const exp2 = expectativaProcesso({ ativo: false, ultimo_sinal_em: new Date(AGORA_MS - 999_999_999).toISOString() })
    expect(decidirAcaoExpectativa(exp2, AGORA_MS, false)).toEqual({ acao: 'nada' })
  })

  it('expectativa DESLIGADA enquanto alarmava ⇒ RESOLVE (senão o incidente ficaria aberto para sempre)', () => {
    const exp = expectativaProcesso({ ativo: false, ultimo_sinal_em: new Date(AGORA_MS - 999_999_999).toISOString() })
    expect(decidirAcaoExpectativa(exp, AGORA_MS, true))
      .toEqual({ acao: 'resolver', tipo: 'processo_sem_resultado', chave: exp.alvo })
  })

  it('NUNCA houve sinal (ultimo_sinal_em null), expectativa ATIVA ⇒ abre', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: null })
    const acao = decidirAcaoExpectativa(exp, AGORA_MS, false)
    expect(acao.acao).toBe('abrir')
    if (acao.acao !== 'abrir') throw new Error('esperado abrir')
    expect(acao.alarme).toMatchObject({ tipo: 'processo_sem_resultado', ultimaExecucaoOkEm: null })
  })

  it('o LIMITE EXATO da tolerância não oscila entre rodadas — mesmo input, mesmo resultado sempre', () => {
    const exp = expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 2700 * 1000).toISOString() }) // exatamente no limite
    const a1 = decidirAcaoExpectativa(exp, AGORA_MS, false)
    const a2 = decidirAcaoExpectativa(exp, AGORA_MS, false)
    expect(a1).toEqual(a2)
    expect(a1).toEqual({ acao: 'nada' }) // <= tolerância conta como DENTRO (saudável)
  })

  it('base — mesmas regras, alarme tipado carga_esperada_nao_chegou, alvo validado contra BASES_INGESTAO', () => {
    const exp: VigiaExpectativa = {
      alvo: 'lancamentos-aberto', tipo: 'base', ativo: true, tolerancia_segundos: 30 * 3600,
      ultimo_sinal_em: new Date(AGORA_MS - 40 * 3600 * 1000).toISOString(), // 40h atrás, tolerância 30h
    }
    const acao = decidirAcaoExpectativa(exp, AGORA_MS, false)
    expect(acao.acao).toBe('abrir')
    if (acao.acao !== 'abrir') throw new Error('esperado abrir')
    expect(acao.tipo).toBe('carga_esperada_nao_chegou')
    expect(acao.alarme).toMatchObject({ tipo: 'carga_esperada_nao_chegou', base: 'lancamentos-aberto', horasSemCarga: 40 })
  })

  it('base com alvo DESCONHECIDO (linha malformada) é ignorada, nunca quebra', () => {
    const exp: VigiaExpectativa = {
      alvo: 'base-que-nao-existe', tipo: 'base', ativo: true, tolerancia_segundos: 3600, ultimo_sinal_em: null,
    }
    expect(decidirAcaoExpectativa(exp, AGORA_MS, false)).toEqual({ acao: 'nada' })
  })
})

// ── rodarVigia — orquestração (I/O real de `./alarme.ts`, RPC/e-mail mockados) ──────────────

function estadoRpc(overrides: Record<string, unknown> = {}) {
  return {
    agora: '2026-09-24T12:00:00Z',
    expectativas: [],
    alarmes_abertos: [],
    pendentes_notificacao: [],
    ...overrides,
  }
}

describe('lerVigiaEstado', () => {
  it('traduz o formato da RPC', async () => {
    rpcMock.mockResolvedValueOnce({ data: estadoRpc({ expectativas: [expectativaProcesso()] }), error: null })
    const estado = await lerVigiaEstado()
    expect(estado?.agora).toBe('2026-09-24T12:00:00Z')
    expect(estado?.expectativas).toHaveLength(1)
  })

  it('erro de RPC devolve null, nunca lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await lerVigiaEstado()).toBeNull()
  })
})

describe('rodarVigia', () => {
  it('falha ao ler o estado ⇒ falha_leitura:true, nenhuma expectativa avaliada', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    const r = await rodarVigia()
    expect(r).toEqual({ expectativas_avaliadas: 0, abertos: 0, resolvidos: 0, reenviados: 0, falha_leitura: true })
  })

  it('expectativa fora da tolerância, sem incidente: abre, notifica e marca notificado', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_vigia_estado') {
        return Promise.resolve({
          data: estadoRpc({
            expectativas: [expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 60 * 60 * 1000).toISOString() })],
          }),
          error: null,
        })
      }
      if (fn === 'ingestao_alarme_abrir') return Promise.resolve({ data: { novo: true, id: 'a1' }, error: null })
      return Promise.resolve({ data: {}, error: null })
    })
    enviarAlarmeIngestaoMock.mockResolvedValueOnce({ ok: true })

    const r = await rodarVigia()

    expect(r.abertos).toBe(1)
    expect(r.resolvidos).toBe(0)
    expect(enviarAlarmeIngestaoMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'a1' })
  })

  it('expectativa dentro da tolerância mas com incidente aberto: resolve, não notifica', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_vigia_estado') {
        return Promise.resolve({
          data: estadoRpc({
            expectativas: [expectativaProcesso({ ultimo_sinal_em: new Date(AGORA_MS - 5 * 60 * 1000).toISOString() })],
            alarmes_abertos: [{ id: 'a1', tipo: 'processo_sem_resultado', chave: 'monde-incremental', notificado_em: '2026-09-24T10:00:00Z' }],
          }),
          error: null,
        })
      }
      return Promise.resolve({ data: {}, error: null })
    })

    const r = await rodarVigia()

    expect(r.resolvidos).toBe(1)
    expect(r.abertos).toBe(0)
    expect(enviarAlarmeIngestaoMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'processo_sem_resultado', p_chave: 'monde-incremental' })
  })

  it('reenvia pendentes de notificação (qualquer tipo) numa mesma rodada', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_vigia_estado') {
        return Promise.resolve({
          data: estadoRpc({
            pendentes_notificacao: [
              { id: 'p1', tipo: 'checksum_falho', chave: 'c1', detalhe: { tipo: 'checksum_falho', base: 'vendas-produto', cargaId: 'c1', motivo: 'x' } },
            ],
          }),
          error: null,
        })
      }
      return Promise.resolve({ data: {}, error: null })
    })
    enviarAlarmeIngestaoMock.mockResolvedValueOnce({ ok: true })

    const r = await rodarVigia()

    expect(r.reenviados).toBe(1)
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'p1' })
  })
})
