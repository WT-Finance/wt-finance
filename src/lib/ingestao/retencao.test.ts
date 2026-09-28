import { describe, it, expect, vi, beforeEach } from 'vitest'

// A regra de retenção do cru (errata 3(b)) apaga arquivo de forma IRREVERSÍVEL — então é função
// pura e cada borda tem caso: 7 dias exatos, 3 meses no fim do mês, citado × não citado,
// recém-enviado, data ilegível, e as duas travas que recusam apagar (teto, cargas vazias).
vi.mock('server-only', () => ({}))

const { rpcMock, removeMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), removeMock: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({
  getAdminClient: () => ({
    rpc: (fn: string, args?: Record<string, unknown>) => rpcMock(fn, args),
    storage: { from: (bucket: string) => ({ remove: (paths: string[]) => removeMock(bucket, paths) }) },
  }),
}))

import {
  decidirRetencao, menosMeses, comoInventario, rodarRetencao, TETO_POR_RODADA,
  type InventarioRetencao,
} from './retencao'

const AGORA = '2026-09-24T12:00:00.000Z'
const DIA = 24 * 60 * 60 * 1000
const haDias = (d: number) => new Date(Date.parse(AGORA) - d * DIA).toISOString()

function inv(p: Partial<InventarioRetencao> = {}): InventarioRetencao {
  return { agora: AGORA, objetos: [], citados: [], cargas: 1, ...p }
}

describe('menosMeses — meses de CALENDÁRIO, sem transbordar', () => {
  it('24/09 − 3 meses = 24/06, mesma hora', () => {
    expect(menosMeses(new Date(AGORA), 3).toISOString()).toBe('2026-06-24T12:00:00.000Z')
  })
  it('31/05 − 3 meses = 28/02 (ano comum), nunca 03/03', () => {
    expect(menosMeses(new Date('2026-05-31T10:00:00Z'), 3).toISOString()).toBe('2026-02-28T10:00:00.000Z')
  })
  it('31/05 − 3 meses em ano bissexto = 29/02', () => {
    expect(menosMeses(new Date('2028-05-31T10:00:00Z'), 3).toISOString()).toBe('2028-02-29T10:00:00.000Z')
  })
  it('atravessa a virada do ano: 15/01 − 3 meses = 15/10 do ano anterior', () => {
    expect(menosMeses(new Date('2027-01-15T00:00:00Z'), 3).toISOString()).toBe('2026-10-15T00:00:00.000Z')
  })
})

describe('decidirRetencao — a regra', () => {
  it('nada no bucket ⇒ nada a apagar', () => {
    expect(decidirRetencao(inv())).toEqual({ ok: true, apagar: [], expirados: 0, orfaos: 0 })
  })

  it('citado por carga e com menos de 3 meses ⇒ FICA, mesmo muito antigo em dias', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'a', criado_em: haDias(80) }], citados: ['a'] }))
    expect(d).toEqual({ ok: true, apagar: [], expirados: 0, orfaos: 0 })
  })

  it('citado por carga e com mais de 3 meses ⇒ EXPIRADO (a carga não o protege)', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'a', criado_em: '2026-06-24T11:59:59.000Z' }], citados: ['a'] }))
    expect(d.ok && d.apagar).toEqual([{ path: 'a', motivo: 'expirado', criado_em: '2026-06-24T11:59:59.000Z' }])
  })

  it('exatamente 3 meses ⇒ FICA ("mais de" 3 meses)', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'a', criado_em: '2026-06-24T12:00:00.000Z' }], citados: ['a'] }))
    expect(d.ok && d.apagar).toEqual([])
  })

  it('sem carga, 8 dias ⇒ ÓRFÃO', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: haDias(8) }] }))
    expect(d).toEqual({ ok: true, apagar: [{ path: 'x', motivo: 'orfao', criado_em: haDias(8) }], expirados: 0, orfaos: 1 })
  })

  it('sem carga, exatamente 7 dias ⇒ FICA; 7 dias + 1 ms ⇒ órfão', () => {
    const exato = new Date(Date.parse(AGORA) - 7 * DIA).toISOString()
    const passou = new Date(Date.parse(AGORA) - 7 * DIA - 1).toISOString()
    expect(decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: exato }] })).apagar).toEqual([])
    expect(decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: passou }] })).apagar).toHaveLength(1)
  })

  it('recém-enviado sem carga ainda (entre os passos 1 e 3 do contrato) ⇒ FICA', () => {
    expect(decidirRetencao(inv({ objetos: [{ path: 'novo', criado_em: haDias(0.01) }] })).apagar).toEqual([])
  })

  it('sem carga e com mais de 3 meses ⇒ conta como EXPIRADO (um motivo por objeto, nunca dois)', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: haDias(120) }] }))
    expect(d.ok && d.apagar.map((a) => a.motivo)).toEqual(['expirado'])
  })

  it('datas no formato REAL do banco (microssegundos + fuso) são lidas — senão nada nunca sairia, em silêncio', () => {
    // `now()` chega com -03:00 (ALTER ROLE SET timezone, 0152) e `storage.objects.created_at`
    // em UTC com 6 casas. Se o parse falhasse, "data ilegível ⇒ fica" viraria "a limpeza nunca
    // apaga nada" sem nenhum erro — este caso prova que o positivo é enxergado.
    const d = decidirRetencao(inv({
      agora: '2026-09-24T17:09:37.630285-03:00',
      objetos: [
        { path: 'orfao-real', criado_em: '2026-09-10T19:16:42.596401+00:00' },
        { path: 'expirado-real', criado_em: '2026-06-01T19:16:42.596401+00:00' },
      ],
      citados: ['expirado-real'],
    }))
    expect(d.ok && d.apagar.map((a) => `${a.path}:${a.motivo}`)).toEqual(['orfao-real:orfao', 'expirado-real:expirado'])
  })

  it('data de criação ilegível ⇒ FICA (na dúvida não se apaga)', () => {
    expect(decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: 'ontem' }] })).apagar).toEqual([])
  })

  it('mistura: conta expirados e órfãos separados, mantém o resto', () => {
    const d = decidirRetencao(inv({
      objetos: [
        { path: 'velho-citado', criado_em: haDias(100) },
        { path: 'orfao', criado_em: haDias(10) },
        { path: 'citado-recente', criado_em: haDias(10) },
        { path: 'orfao-recente', criado_em: haDias(2) },
      ],
      citados: ['velho-citado', 'citado-recente'],
    }))
    expect(d.ok).toBe(true)
    if (!d.ok) return
    expect(d.apagar.map((a) => a.path)).toEqual(['velho-citado', 'orfao'])
    expect(d.expirados).toBe(1)
    expect(d.orfaos).toBe(1)
  })

  it('TRAVA: há objetos antigos e NENHUMA carga ⇒ recusa (todos pareceriam órfãos)', () => {
    const d = decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: haDias(10) }], cargas: 0 }))
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.recusa).toMatch(/NENHUMA carga/)
  })

  it('zero cargas mas nada a apagar (bucket novo, tudo recente) ⇒ não recusa', () => {
    expect(decidirRetencao(inv({ objetos: [{ path: 'x', criado_em: haDias(1) }], cargas: 0 })).ok).toBe(true)
  })

  it('TRAVA: acima do teto por rodada ⇒ recusa, e diz quantos seriam', () => {
    const objetos = Array.from({ length: TETO_POR_RODADA + 1 }, (_, i) => ({ path: `p${i}`, criado_em: haDias(10) }))
    const d = decidirRetencao(inv({ objetos }))
    expect(d.ok).toBe(false)
    if (d.ok) return
    expect(d.recusa).toContain(String(TETO_POR_RODADA + 1))
    expect(d.apagar).toHaveLength(TETO_POR_RODADA + 1)
  })

  it('exatamente no teto ⇒ apaga', () => {
    const objetos = Array.from({ length: TETO_POR_RODADA }, (_, i) => ({ path: `p${i}`, criado_em: haDias(10) }))
    expect(decidirRetencao(inv({ objetos })).ok).toBe(true)
  })

  it('relógio inválido ⇒ recusa, nada apagado', () => {
    const d = decidirRetencao(inv({ agora: 'x', objetos: [{ path: 'a', criado_em: haDias(200) }] }))
    expect(d.ok).toBe(false)
    expect(d.apagar).toEqual([])
  })
})

describe('comoInventario — formato do jsonb', () => {
  it('aceita o formato da RPC (cargas pode vir como string numérica)', () => {
    expect(comoInventario({ agora: AGORA, objetos: [{ path: 'a', criado_em: AGORA }], citados: ['a'], cargas: '2' }))
      .toEqual({ agora: AGORA, objetos: [{ path: 'a', criado_em: AGORA }], citados: ['a'], cargas: 2 })
  })
  it.each([
    null, [], { agora: AGORA }, { agora: AGORA, objetos: [{ path: 1 }], citados: [], cargas: 0 },
    { agora: AGORA, objetos: [], citados: [1], cargas: 0 }, { agora: AGORA, objetos: [], citados: [], cargas: 'x' },
  ])('rejeita formato inesperado: %j', (x) => {
    expect(comoInventario(x)).toBeNull()
  })
})

// ── rodarRetencao — o executor: só apaga o que a regra devolveu, e registra o CONFIRMADO ─────

function inventarioRpc(p: Partial<InventarioRetencao>) {
  return { data: { agora: AGORA, objetos: [], citados: [], cargas: 1, ...p }, error: null }
}

describe('rodarRetencao', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    removeMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  function registroGravado(): Record<string, unknown> {
    const chamada = rpcMock.mock.calls.find((c) => c[0] === 'ingestao_retencao_registrar')
    if (!chamada) throw new Error('rodada não foi registrada')
    return chamada[1] as Record<string, unknown>
  }

  it('SIMULAR: percorre, registra "simulado" com a lista, e NÃO chama o Storage', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({ objetos: [{ path: 'x', criado_em: haDias(10) }] }))
      : Promise.resolve({ data: 'id', error: null }))
    const r = await rodarRetencao({ simular: true })
    expect(removeMock).not.toHaveBeenCalled()
    expect(r.status).toBe('simulado')
    expect(r.orfaos).toBe(1)
    expect(registroGravado()).toMatchObject({ p_status: 'simulado', p_orfaos: 1, p_expirados: 0 })
  })

  it('apaga SÓ no bucket ingestao-cru, SÓ os paths decididos, e registra o que o Storage confirmou', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({
          objetos: [{ path: 'orfao', criado_em: haDias(10) }, { path: 'fica', criado_em: haDias(1) }, { path: 'sumiu', criado_em: haDias(10) }],
        }))
      : Promise.resolve({ data: 'id', error: null }))
    // O Storage só confirma 'orfao' — 'sumiu' já não existia.
    removeMock.mockResolvedValueOnce({ data: [{ name: 'orfao' }], error: null })
    const r = await rodarRetencao({ simular: false })
    expect(removeMock).toHaveBeenCalledWith('ingestao-cru', ['orfao', 'sumiu'])
    expect(r.status).toBe('ok')
    expect(r.apagados.map((a) => a.path)).toEqual(['orfao'])
    expect(registroGravado()).toMatchObject({ p_status: 'ok', p_orfaos: 1 })
  })

  it('recusa da regra (zero cargas) ⇒ registra "recusado" e NÃO apaga', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({ objetos: [{ path: 'x', criado_em: haDias(10) }], cargas: 0 }))
      : Promise.resolve({ data: 'id', error: null }))
    const r = await rodarRetencao({ simular: false })
    expect(removeMock).not.toHaveBeenCalled()
    expect(r.status).toBe('recusado')
    expect(registroGravado()).toMatchObject({ p_status: 'recusado' })
  })

  it('inventário falhou ⇒ "erro", nunca "nada a apagar"; não apaga', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve({ data: null, error: { message: 'boom' } })
      : Promise.resolve({ data: 'id', error: null }))
    const r = await rodarRetencao({ simular: false })
    expect(removeMock).not.toHaveBeenCalled()
    expect(r.status).toBe('erro')
    expect(r.erro).toMatch(/boom/)
  })

  it('Storage falhou num lote ⇒ "erro" e o log NÃO registra como apagado o que ficou', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({ objetos: [{ path: 'x', criado_em: haDias(10) }] }))
      : Promise.resolve({ data: 'id', error: null }))
    removeMock.mockResolvedValueOnce({ data: null, error: { message: 'storage fora' } })
    const r = await rodarRetencao({ simular: false })
    expect(r.status).toBe('erro')
    expect(r.apagados).toEqual([])
    expect(registroGravado()).toMatchObject({ p_status: 'erro', p_orfaos: 0 })
  })

  it('vários lotes: o 1º confirmado FICA no log mesmo se o 2º falhar, e o resto não é tentado', async () => {
    // 250 órfãos ⇒ lotes de 100, 100, 50. O 2º falha: o log tem de registrar os 100 do 1º como
    // apagados (saíram de verdade) e NÃO os do 2º e 3º; o 3º nem é tentado.
    const objetos = Array.from({ length: 250 }, (_, i) => ({ path: `p${i}`, criado_em: haDias(10) }))
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({ objetos }))
      : Promise.resolve({ data: 'id', error: null }))
    removeMock
      .mockImplementationOnce((_b: string, paths: string[]) => Promise.resolve({ data: paths.map((name) => ({ name })), error: null }))
      .mockResolvedValueOnce({ data: null, error: { message: 'storage caiu no meio' } })
    const r = await rodarRetencao({ simular: false })
    expect(removeMock).toHaveBeenCalledTimes(2)
    expect(removeMock.mock.calls[0][1]).toHaveLength(100)
    expect(r.status).toBe('erro')
    expect(r.apagados).toHaveLength(100)
    expect(r.apagados[0].path).toBe('p0')
    expect(r.apagados[99].path).toBe('p99')
    expect(registroGravado()).toMatchObject({ p_status: 'erro', p_orfaos: 100 })
  })

  it('vários lotes todos confirmados: acumula os três', async () => {
    const objetos = Array.from({ length: 250 }, (_, i) => ({ path: `p${i}`, criado_em: haDias(10) }))
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({ objetos }))
      : Promise.resolve({ data: 'id', error: null }))
    removeMock.mockImplementation((_b: string, paths: string[]) => Promise.resolve({ data: paths.map((name) => ({ name })), error: null }))
    const r = await rodarRetencao({ simular: false })
    expect(removeMock).toHaveBeenCalledTimes(3)
    expect(r.status).toBe('ok')
    expect(r.apagados).toHaveLength(250)
    expect(registroGravado()).toMatchObject({ p_status: 'ok', p_orfaos: 250 })
  })

  it('nunca lança, nem se o registro falhar — sinaliza logFalhou', async () => {
    rpcMock.mockImplementation((fn: string) => fn === 'ingestao_retencao_inventario'
      ? Promise.resolve(inventarioRpc({}))
      : Promise.reject(new Error('rede')))
    const r = await rodarRetencao({ simular: false })
    expect(r.status).toBe('ok')
    expect(r.logFalhou).toBe(true)
  })
})
