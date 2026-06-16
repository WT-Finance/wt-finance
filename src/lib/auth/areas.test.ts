import { describe, it, expect } from 'vitest'
import { AREAS, AREA_INFO, areasDoSetor, areasDaRota, rotaInicial, nextSeguro } from './areas'

// v4.13: o mapa de áreas é a ESPINHA do RBAC no app (ADR-0107/0109). Estes testes
// blindam o mapeamento rota→área e setor→área — um erro aqui vira porta aberta ou
// porta fechada indevida. A paridade com o banco (app.rbac_areas / areas_do_setor)
// é coberta no rpc-contrato.test.ts.

describe('areasDoSetor — espelho de app.areas_do_setor', () => {
  it('mapeia os três setores do banco', () => {
    expect(areasDoSetor('Weddings')).toEqual(['performance/weddings'])
    expect(areasDoSetor('Lazer')).toEqual(['performance/trips'])
    expect(areasDoSetor('Corporativo')).toEqual(['performance/corporativo'])
  })
  it("'todos', desconhecidos e vazio caem nos agregados (executiva|performance)", () => {
    expect(areasDoSetor('todos')).toEqual(['executiva', 'performance'])
    expect(areasDoSetor('Inexistente')).toEqual(['executiva', 'performance'])
    expect(areasDoSetor(null)).toEqual(['executiva', 'performance'])
    expect(areasDoSetor(undefined)).toEqual(['executiva', 'performance'])
  })
})

describe('areasDaRota — toda rota de página tem dono', () => {
  const casos: Array<[string, string[] | null]> = [
    ['/',                                   null],
    ['/sem-acesso',                         null],
    ['/executiva',                          ['executiva']],
    ['/metas',                              ['metas']],
    ['/performance',                        ['performance']],
    ['/performance/trips',                  ['performance/trips']],
    ['/performance/weddings',               ['performance/weddings']],
    ['/performance/corporativo',            ['performance/corporativo']],
    ['/financeiro',                         ['financeiro/fluxo-caixa', 'financeiro/gerencial']],
    ['/financeiro/fluxo-caixa',             ['financeiro/fluxo-caixa', 'financeiro/gerencial']],
    ['/financeiro/fluxo-caixa/gerencial',   ['financeiro/gerencial']],
    ['/admin/uploads',                      ['admin/uploads']],
    ['/admin/uploads/financeiro',           ['admin/uploads']],
    ['/admin/design-system',                ['admin/design-system']],
    ['/admin/acessos',                      ['admin/acessos']],
    ['/admin/solicitacoes',                 ['solicitacoes']],
    ['/admin/solicitacoes/movimentacoes',   ['solicitacoes']],
    ['/admin',                              ['admin/acessos']],
    ['/solicitacoes',                       ['solicitacoes/basico', 'solicitacoes']],
  ]
  it.each(casos)('%s → %j', (rota, esperado) => {
    expect(areasDaRota(rota)).toEqual(esperado)
  })
  it('o mais específico vence o prefixo genérico', () => {
    expect(areasDaRota('/performance/weddings/qualquer')).toEqual(['performance/weddings'])
    expect(areasDaRota('/financeiro/fluxo-caixa/gerencial/x')).toEqual(['financeiro/gerencial'])
  })
})

describe('rotaInicial — primeira área permitida', () => {
  it('prioriza executiva; sem nada → null', () => {
    expect(rotaInicial(['metas', 'executiva'])).toBe('/executiva')
    expect(rotaInicial(['performance/trips'])).toBe('/performance/trips')
    expect(rotaInicial(['financeiro/gerencial'])).toBe('/financeiro/fluxo-caixa/gerencial')
    expect(rotaInicial([])).toBeNull()
    expect(rotaInicial(['inexistente'])).toBeNull()
  })
})

describe('nextSeguro — anti open-redirect', () => {
  it('só aceita caminho relativo interno', () => {
    expect(nextSeguro('/executiva')).toBe('/executiva')
    expect(nextSeguro('/performance/trips?preset=este-ano')).toBe('/performance/trips?preset=este-ano')
  })
  it('rejeita externos, protocolo-relativo, /auth e vazios', () => {
    expect(nextSeguro('https://evil.com')).toBe('/')
    expect(nextSeguro('//evil.com')).toBe('/')
    expect(nextSeguro('/auth/confirm?x=1')).toBe('/')
    expect(nextSeguro('')).toBe('/')
    expect(nextSeguro(null)).toBe('/')
  })
  it('rejeita backslash, codificados e /auth case-insensitive (endurecido S11)', () => {
    expect(nextSeguro('/\\evil.com')).toBe('/')      // \ ≡ / no browser
    expect(nextSeguro('/%2f%2fevil.com')).toBe('/')  // %2f = /
    expect(nextSeguro('/%5cevil.com')).toBe('/')     // %5c = \
    expect(nextSeguro('/AUTH/confirm')).toBe('/')
    expect(nextSeguro('/auth')).toBe('/')
  })
})

describe('catálogo — consistência interna', () => {
  it('AREA_INFO cobre exatamente AREAS', () => {
    expect(Object.keys(AREA_INFO).sort()).toEqual([...AREAS].sort())
  })
  it('ordens únicas', () => {
    const ordens = Object.values(AREA_INFO).map(i => i.ordem)
    expect(new Set(ordens).size).toBe(ordens.length)
  })
})
