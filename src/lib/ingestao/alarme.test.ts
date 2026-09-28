import { describe, it, expect, vi, beforeEach } from 'vitest'

// `alarme.ts` é `server-only` — neutralizado no vitest. Mocka `getAdminClient` (RPC) e
// `enviarAlarmeIngestao` (e-mail, já provado à exaustão em `email/alarme-ingestao.test.ts` —
// aqui importa só o CONTRATO: chamado com o alarme certo, nunca aguardado sem `await`, e o
// incidente só é marcado NOTIFICADO quando o envio deu certo).
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

import {
  somaPorAno, anoCorrenteSP, calcularDiffPorAno, ehRejeicaoDeConteudo, precisaAlarmarParNovo,
  abrirIncidente, resolverIncidente, marcarNotificado, dispararAlarmeDeEvento,
  comoAlarmeIngestao, reenviarPendentesNotificacao,
  type SomaPorAno,
} from './alarme'
import type { AlarmeIngestao } from '@/lib/email/template'

beforeEach(() => {
  rpcMock.mockReset()
  enviarAlarmeIngestaoMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

// ── anoCorrenteSP — pura, testável com Date injetada ────────────────────────────────────────

describe('anoCorrenteSP', () => {
  it('lê o ano no fuso de São Paulo, não em UTC', () => {
    // 31/12/2026 22:00 em SP (UTC-3) é 01/01/2027 01:00 em UTC — o ano CORRETO é 2026.
    const instanteUtc = new Date('2027-01-01T01:00:00Z')
    expect(anoCorrenteSP(instanteUtc)).toBe(2026)
  })

  it('já virou o ano em SP também (não é sempre "um a menos que UTC")', () => {
    const instanteUtc = new Date('2027-01-01T04:00:00Z') // 01:00 em SP — já é 01/01 lá também
    expect(anoCorrenteSP(instanteUtc)).toBe(2027)
  })
})

// ── calcularDiffPorAno — PURA, decide o alarme "ano fechado alterado" (anexo §4) ────────────

describe('calcularDiffPorAno', () => {
  const ANO_CORRENTE = 2026

  it('nenhum ano fechado mudou ⇒ nenhum alarme, anosFechadosAlterados vazio', () => {
    const antes: SomaPorAno = { '2024': { linhas: 100, centavos: 500_000 }, '2025': { linhas: 50, centavos: 200_000 } }
    const depois: SomaPorAno = { ...antes }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([])
    expect(r.alarmes).toEqual([])
    expect(r.porAno).toEqual({ '2024': 0, '2025': 0 })
  })

  it('mudou SÓ a contagem (soma igual) num ano fechado ⇒ alarma', () => {
    const antes: SomaPorAno = { '2024': { linhas: 100, centavos: 500_000 } }
    const depois: SomaPorAno = { '2024': { linhas: 106, centavos: 500_000 } }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([2024])
    expect(r.alarmes).toHaveLength(1)
    expect(r.alarmes[0]).toMatchObject({
      tipo: 'ano_fechado_alterado', base: 'demonstrativo-competencia', ano: 2024,
      linhasAntes: 100, linhasDepois: 106, centavosAntes: 500_000, centavosDepois: 500_000, cargaId: 'c1',
    })
    expect(r.porAno['2024']).toBe(6)
  })

  it('mudou SÓ a soma (contagem igual) num ano fechado ⇒ alarma — dinheiro sem mudar linhas dispara igual', () => {
    const antes: SomaPorAno = { '2024': { linhas: 100, centavos: 500_000 } }
    const depois: SomaPorAno = { '2024': { linhas: 100, centavos: 510_000 } }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([2024])
    expect(r.alarmes[0].centavosAntes).toBe(500_000)
    expect(r.alarmes[0].centavosDepois).toBe(510_000)
    expect(r.porAno['2024']).toBe(0) // linhas não mudaram — só o diff de LINHAS entra em por_ano
  })

  it('só o ANO CORRENTE mudou (qualquer grandeza) ⇒ nenhum alarme (fechado = ANTERIOR ao corrente)', () => {
    const antes: SomaPorAno = { '2026': { linhas: 10, centavos: 10_000 } }
    const depois: SomaPorAno = { '2026': { linhas: 40, centavos: 90_000 } }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([])
    expect(r.alarmes).toEqual([])
    expect(r.porAno['2026']).toBe(30) // ainda entra em por_ano — só não é "fechado"
  })

  it('mistura: ano fechado alterado E ano corrente alterado no MESMO diff ⇒ só o fechado alarma', () => {
    const antes: SomaPorAno = { '2024': { linhas: 100, centavos: 500_000 }, '2026': { linhas: 10, centavos: 10_000 } }
    const depois: SomaPorAno = { '2024': { linhas: 99, centavos: 500_000 }, '2026': { linhas: 40, centavos: 90_000 } }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([2024])
    expect(r.alarmes).toHaveLength(1)
    expect(r.alarmes[0].ano).toBe(2024)
  })

  it('ano presente só em UM dos dois lados (base nova/zerada) entra no diff sem quebrar', () => {
    const antes: SomaPorAno = {}
    const depois: SomaPorAno = { '2024': { linhas: 5, centavos: 1_000 } }
    const r = calcularDiffPorAno('demonstrativo-competencia', 'c1', antes, depois, ANO_CORRENTE)
    expect(r.anosFechadosAlterados).toEqual([2024]) // 0→5 é mudança de contagem num ano fechado
    expect(r.porAno['2024']).toBe(5)
  })

  it('cargaId e base viajam para dentro do alarme — é a CHAVE do incidente de evento', () => {
    const antes: SomaPorAno = { '2024': { linhas: 1, centavos: 1 } }
    const depois: SomaPorAno = { '2024': { linhas: 2, centavos: 1 } }
    const r = calcularDiffPorAno('lancamentos-aberto', 'carga-xyz', antes, depois, ANO_CORRENTE)
    expect(r.alarmes[0].cargaId).toBe('carga-xyz')
    expect(r.alarmes[0].base).toBe('lancamentos-aberto')
  })
})

// ── ehRejeicaoDeConteudo / precisaAlarmarParNovo — decisões triviais, mas PURAS e testadas ──

describe('ehRejeicaoDeConteudo', () => {
  it('422 é conteúdo (checksum e as demais rejeições de conteúdo)', () => {
    expect(ehRejeicaoDeConteudo(422)).toBe(true)
  })
  it('401/403/409/500 NÃO são conteúdo (auth, lock, bug interno)', () => {
    expect(ehRejeicaoDeConteudo(401)).toBe(false)
    expect(ehRejeicaoDeConteudo(403)).toBe(false)
    expect(ehRejeicaoDeConteudo(409)).toBe(false)
    expect(ehRejeicaoDeConteudo(500)).toBe(false)
  })
})

describe('precisaAlarmarParNovo', () => {
  it('só o Demonstrativo, e só com paresNovos > 0', () => {
    expect(precisaAlarmarParNovo('demonstrativo-competencia', 3)).toBe(true)
    expect(precisaAlarmarParNovo('demonstrativo-competencia', 0)).toBe(false)
    expect(precisaAlarmarParNovo('vendas-produto', 3)).toBe(false)
  })
})

// ── somaPorAno — tradução da RPC (jsonb → SomaPorAno), degrada em falha ─────────────────────

describe('somaPorAno', () => {
  it('traduz {ano: {linhas, centavos}} corretamente', async () => {
    rpcMock.mockResolvedValueOnce({ data: { '2024': { linhas: 10, centavos: 1000 } }, error: null })
    const r = await somaPorAno('demonstrativo-competencia')
    expect(r).toEqual({ '2024': { linhas: 10, centavos: 1000 } })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_soma_por_ano', { p_base: 'demonstrativo-competencia' })
  })

  it('erro de RPC degrada para null, nunca lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await somaPorAno('vendas-produto')).toBeNull()
  })

  it('conjunto vazio ({}) é uma resposta VÁLIDA (base sem linha nenhuma), não formato inesperado', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    expect(await somaPorAno('vendas-produto')).toEqual({})
  })
})

// ── RPCs de escrita do incidente ─────────────────────────────────────────────────────────────

describe('abrirIncidente / resolverIncidente / marcarNotificado', () => {
  it('abrirIncidente chama ingestao_alarme_abrir e devolve {novo, id}', async () => {
    rpcMock.mockResolvedValueOnce({ data: { novo: true, id: 'a1' }, error: null })
    const r = await abrirIncidente('checksum_falho', 'carga-1', { motivo: 'x' })
    expect(r).toEqual({ novo: true, id: 'a1' })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_abrir', {
      p_tipo: 'checksum_falho', p_chave: 'carga-1', p_detalhe: { motivo: 'x' },
    })
  })

  it('abrirIncidente com erro de RPC devolve null', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    expect(await abrirIncidente('checksum_falho', 'carga-1', null)).toBeNull()
  })

  it('resolverIncidente chama ingestao_alarme_resolver e nunca lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: { resolvido: false }, error: null })
    await expect(resolverIncidente('checksum_falho', 'carga-1')).resolves.toBeUndefined()
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'checksum_falho', p_chave: 'carga-1' })
  })

  it('marcarNotificado chama ingestao_alarme_marcar_notificado e nunca lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: {}, error: null })
    await expect(marcarNotificado('a1')).resolves.toBeUndefined()
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'a1' })
  })
})

// ── dispararAlarmeDeEvento — abre, notifica SE novo, SEMPRE resolve em seguida ──────────────

const CHECKSUM_FALHO: AlarmeIngestao = { tipo: 'checksum_falho', base: 'vendas-produto', cargaId: 'c1', motivo: 'CHECKSUM_FALHOU' }

describe('dispararAlarmeDeEvento', () => {
  it('incidente NOVO + envio OK: notifica, marca notificado, e RESOLVE em seguida', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_alarme_abrir') return Promise.resolve({ data: { novo: true, id: 'a1' }, error: null })
      return Promise.resolve({ data: {}, error: null })
    })
    enviarAlarmeIngestaoMock.mockResolvedValueOnce({ ok: true, enviados: 1, total: 1 })

    await dispararAlarmeDeEvento(CHECKSUM_FALHO, 'c1')

    expect(enviarAlarmeIngestaoMock).toHaveBeenCalledWith(CHECKSUM_FALHO)
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'a1' })
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'checksum_falho', p_chave: 'c1' })
  })

  it('incidente NOVO + envio FALHOU: NÃO marca notificado, mas AINDA resolve (fica pendente de notificação)', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_alarme_abrir') return Promise.resolve({ data: { novo: true, id: 'a1' }, error: null })
      return Promise.resolve({ data: {}, error: null })
    })
    enviarAlarmeIngestaoMock.mockResolvedValueOnce({ ok: false, erro: 'SMTP fora' })

    await dispararAlarmeDeEvento(CHECKSUM_FALHO, 'c1')

    expect(rpcMock).not.toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', expect.anything())
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'checksum_falho', p_chave: 'c1' })
  })

  it('incidente JÁ EXISTIA (novo:false): NÃO tenta enviar de novo, mas ainda resolve', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_alarme_abrir') return Promise.resolve({ data: { novo: false, id: 'a1' }, error: null })
      return Promise.resolve({ data: {}, error: null })
    })

    await dispararAlarmeDeEvento(CHECKSUM_FALHO, 'c1')

    expect(enviarAlarmeIngestaoMock).not.toHaveBeenCalled()
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'checksum_falho', p_chave: 'c1' })
  })

  it('envio que LANÇA (não só devolve ok:false): não propaga — carga já aplicada não vira erro — e ainda resolve', async () => {
    rpcMock.mockImplementation((fn: string) => {
      if (fn === 'ingestao_alarme_abrir') return Promise.resolve({ data: { novo: true, id: 'a1' }, error: null })
      return Promise.resolve({ data: {}, error: null })
    })
    enviarAlarmeIngestaoMock.mockRejectedValueOnce(new Error('bug no template'))

    await expect(dispararAlarmeDeEvento(CHECKSUM_FALHO, 'c1')).resolves.toBeUndefined()
    expect(rpcMock).not.toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', expect.anything())
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_resolver', { p_tipo: 'checksum_falho', p_chave: 'c1' })
  })

  it('abrir falhou (RPC com erro): não tenta notificar nem resolver — nunca lança', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    await expect(dispararAlarmeDeEvento(CHECKSUM_FALHO, 'c1')).resolves.toBeUndefined()
    expect(enviarAlarmeIngestaoMock).not.toHaveBeenCalled()
  })
})

// ── comoAlarmeIngestao — reidrata o `detalhe` jsonb, guard mínimo por tipo ──────────────────

describe('comoAlarmeIngestao', () => {
  it('reidrata cada um dos cinco tipos quando o formato bate', () => {
    expect(comoAlarmeIngestao('checksum_falho', CHECKSUM_FALHO)).toEqual(CHECKSUM_FALHO)
    const anoFechado: AlarmeIngestao = {
      tipo: 'ano_fechado_alterado', base: 'vendas-produto', ano: 2024,
      linhasAntes: 1, linhasDepois: 2, centavosAntes: 1, centavosDepois: 1, cargaId: 'c1',
    }
    expect(comoAlarmeIngestao('ano_fechado_alterado', anoFechado)).toEqual(anoFechado)
    const parNovo: AlarmeIngestao = { tipo: 'par_novo_bandeja', cargaId: 'c1', paresNovos: 2 }
    expect(comoAlarmeIngestao('par_novo_bandeja', parNovo)).toEqual(parNovo)
    const processo: AlarmeIngestao = { tipo: 'processo_sem_resultado', processo: 'monde-incremental', minutosSemResultado: 5 }
    expect(comoAlarmeIngestao('processo_sem_resultado', processo)).toEqual(processo)
    const cargaNaoChegou: AlarmeIngestao = { tipo: 'carga_esperada_nao_chegou', base: 'lancamentos-aberto', horasSemCarga: 30 }
    expect(comoAlarmeIngestao('carga_esperada_nao_chegou', cargaNaoChegou)).toEqual(cargaNaoChegou)
  })

  it('tipo divergente do esperado ⇒ null', () => {
    expect(comoAlarmeIngestao('par_novo_bandeja', CHECKSUM_FALHO)).toBeNull()
  })

  it('campo obrigatório faltando ⇒ null (não reidrata um alarme incompleto)', () => {
    expect(comoAlarmeIngestao('checksum_falho', { tipo: 'checksum_falho', base: 'vendas-produto' })).toBeNull()
  })

  it('detalhe não-objeto ⇒ null', () => {
    expect(comoAlarmeIngestao('checksum_falho', null)).toBeNull()
    expect(comoAlarmeIngestao('checksum_falho', 'string')).toBeNull()
  })
})

// ── reenviarPendentesNotificacao — usado pelo vigia (e por evento com envio falho) ─────────

describe('reenviarPendentesNotificacao', () => {
  it('reenvia cada pendente; marca notificado só quem teve sucesso; pula detalhe corrompido', async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null })
    enviarAlarmeIngestaoMock
      .mockResolvedValueOnce({ ok: true }) // pendente 1: sucesso
      .mockResolvedValueOnce({ ok: false, erro: 'SMTP fora' }) // pendente 2: falha de novo

    const n = await reenviarPendentesNotificacao([
      { id: 'p1', tipo: 'checksum_falho', chave: 'c1', detalhe: CHECKSUM_FALHO },
      { id: 'p2', tipo: 'checksum_falho', chave: 'c2', detalhe: { ...CHECKSUM_FALHO, cargaId: 'c2' } },
      { id: 'p3', tipo: 'par_novo_bandeja', chave: 'c3', detalhe: { tipo: 'par_novo_bandeja' } }, // sem paresNovos: corrompido
    ])

    expect(n).toBe(1)
    expect(enviarAlarmeIngestaoMock).toHaveBeenCalledTimes(2) // p3 nunca chega a tentar enviar
    expect(rpcMock).toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'p1' })
    expect(rpcMock).not.toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'p2' })
    expect(rpcMock).not.toHaveBeenCalledWith('ingestao_alarme_marcar_notificado', { p_id: 'p3' })
  })

  it('lista vazia devolve 0 sem chamar nada', async () => {
    expect(await reenviarPendentesNotificacao([])).toBe(0)
    expect(enviarAlarmeIngestaoMock).not.toHaveBeenCalled()
  })
})
