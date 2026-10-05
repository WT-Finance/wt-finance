import { describe, it, expect } from 'vitest'
import { transformSale, VERSAO_TRANSFORM, hashDoRaw, jsonCanonico, canceladoEm, type Resolvedor } from './transform'
import { zVendaDetalhe } from './schemas'

// Fixtures SINTÉTICAS no formato da API Monde v3 (v6.2.0) — ids e nomes inventados, nunca dado real.
// Passam pelo Zod de verdade (`zVendaDetalhe.parse`), então o teste também cobre o schema.
const SETOR = 7
const VENDEDOR_WED = 11

const PESSOAS: Record<string, { nome: string | null; cpf_cnpj: string | null }> = {
  'p-pagante': { nome: 'Cliente Y', cpf_cnpj: '00000000191' },
  'p-seller': { nome: 'Agente Emissor', cpf_cnpj: null },
  'p-forn': { nome: 'Fornecedor Hotel', cpf_cnpj: null },
}
const CATALOGO: Record<string, string> = { 'prd-contrato': 'Contrato de casamento ', 'prd-ferry': 'Ferry' }

const R: Resolvedor = {
  campoSetor: SETOR,
  campoVendedorWeddings: VENDEDOR_WED,
  pessoa: (id) => (id ? PESSOAS[id] ?? null : null),
  produtoCatalogo: (id) => (id ? CATALOGO[id] ?? null : null),
}

function produto(over: Record<string, unknown> = {}) {
  return {
    id: 'prod-1', status: 'active', canceled_at: null, supplier: { id: 'p-forn' },
    totals: { amount: 500 }, agency_service_fee: 0, passengers: [{ person: { id: 'pax' } }],
    accommodation_kind: 'Single', check_in: '2026-06-11', check_out: '2026-06-12',
    ...over,
  }
}
function venda(over: Record<string, unknown> = {}) {
  const raw = {
    id: 'sale-100', sale_number: 100, sale_date: '2026-06-10', status: 'closed',
    payer: { id: 'p-pagante' }, seller: { id: 'p-seller' }, intermediary: null,
    custom_fields: [{ id: SETOR, value: 'Corporativo' }],
    totals: { final_amount: 1000, revenue: 100, balance: 0 },
    hotels: [produto()],
    ...over,
  }
  return { detalhe: zVendaDetalhe.parse(raw), raw }
}
function transformar(over: Record<string, unknown> = {}) {
  const { detalhe, raw } = venda(over)
  const r = transformSale(detalhe, raw, R)
  if (!('venda' in r)) throw new Error(`esperava venda, veio ${JSON.stringify(r)}`)
  return r.venda
}

describe('transformSale v3 — exclusões', () => {
  it('exclui setor Welcome (emissão interna)', () => {
    const { detalhe, raw } = venda({ custom_fields: [{ id: SETOR, value: 'Welcome' }] })
    expect(transformSale(detalhe, raw, R)).toEqual({ excluida: 'welcome' })
  })
  it('exclui venda sem o campo Setor', () => {
    const { detalhe, raw } = venda({ custom_fields: [] })
    expect(transformSale(detalhe, raw, R)).toEqual({ excluida: 'sem_setor' })
  })
  it('exclui micro desconhecido (fora do mapa)', () => {
    const { detalhe, raw } = venda({ custom_fields: [{ id: SETOR, value: 'Foo' }] })
    expect(transformSale(detalhe, raw, R)).toEqual({ excluida: 'sem_setor' })
  })
  it('lê o setor pelo ID do campo, não pela posição (outro campo com valor de setor não conta)', () => {
    const { detalhe, raw } = venda({ custom_fields: [{ id: 99, value: 'Lazer' }] })
    expect(transformSale(detalhe, raw, R)).toEqual({ excluida: 'sem_setor' })
  })
  // v5.4.5 — venda sem item ativo é ESPELHADA e soma zero (a mv filtra `status='active'`).
  it('ESPELHA venda sem nenhum item ativo e ela soma ZERO', () => {
    const v = transformar({ totals: { final_amount: 900, revenue: 5000 }, hotels: [produto({ status: 'canceled', canceled_at: '2026-06-09' })] })
    expect(v.itens).toHaveLength(1)
    expect(v.itens[0].status).toBe('canceled')
    expect(v.itens[0].receitas).toBe(0)
  })
})

describe('transformSale v3 — mapeamento (regras provadas contra o espelho em 05/10)', () => {
  it('cabeçalho: número vira texto, totais da venda, nomes pelo resolvedor, síntese', () => {
    const v = transformar()
    expect(v.venda_numero).toBe('100')            // sale_number é NÚMERO na v3; o espelho guarda texto
    expect(v.sale_id).toBe('sale-100')
    expect(v.data_venda).toBe('2026-06-10')
    expect(v.total_final_value).toBe(1000)        // totals.final_amount
    expect(v.total_revenue).toBe(100)             // totals.revenue
    expect(v.setor_macro).toBe('Corporativo')
    expect(v.vendedor).toBe('Agente Emissor')     // /people/{seller.id}.name
    expect(v.pagante).toBe('Cliente Y')
    expect(v.pagante_doc).toBe('00000000191')
    expect(v.contrato).toBe(false)
    expect(v.taxa_servico).toBe(false)
    expect(v.operacao_propria).toBe(true)         // intermediary null
  })

  it('item: valor = totals.amount, tipo = nome do array, fornecedor pelo resolvedor, passageiros', () => {
    const it0 = transformar().itens[0]
    expect(it0.valor_total).toBe(500)
    expect(it0.product_kind).toBe('hotels')
    expect(it0.fornecedor).toBe('Fornecedor Hotel')
    expect(it0.passageiros).toBe(1)
    expect(it0.receitas).toBe(100)
  })

  it('pessoa desconhecida vira null (nunca o id no lugar do nome)', () => {
    const v = transformar({ payer: { id: 'p-inexistente' }, seller: null })
    expect(v.pagante).toBeNull()
    expect(v.pagante_doc).toBeNull()
    expect(v.vendedor).toBeNull()
  })

  it('Lazer e Expedições → macro Lazer', () => {
    for (const micro of ['Lazer', 'Expedições']) {
      expect(transformar({ custom_fields: [{ id: SETOR, value: micro }] }).setor_macro).toBe('Lazer')
    }
  })

  it('Weddings: vendedor vem do campo "Vendedor(a) Responsável - Grupo"', () => {
    const v = transformar({ custom_fields: [{ id: SETOR, value: 'WedMe' }, { id: VENDEDOR_WED, value: 'Consultora Wed' }] })
    expect(v.setor_macro).toBe('Weddings')
    expect(v.vendedor).toBe('Consultora Wed')
  })
  it('Weddings sem o campo de vendedor → nome do seller', () => {
    expect(transformar({ custom_fields: [{ id: SETOR, value: 'Weddings' }] }).vendedor).toBe('Agente Emissor')
  })
  it('fora de Weddings o campo de vendedor é ignorado', () => {
    expect(transformar({ custom_fields: [{ id: SETOR, value: 'Lazer' }, { id: VENDEDOR_WED, value: 'X' }] }).vendedor).toBe('Agente Emissor')
  })

  it('taxa_servico = true quando algum item ATIVO tem agency_service_fee > 0', () => {
    expect(transformar({ hotels: [produto({ agency_service_fee: 15 })] }).taxa_servico).toBe(true)
    expect(transformar({ hotels: [produto({ agency_service_fee: 15, status: 'canceled' })] }).taxa_servico).toBe(false)
  })
  it('operacao_propria = false quando há intermediary', () => {
    expect(transformar({ intermediary: { id: 'p-inter' } }).operacao_propria).toBe(false)
  })
})

describe('transformSale v3 — rateio de receita (ADR-0149, v5.4.5)', () => {
  it('total_revenue distribuído por valor entre os ativos, resto no último (soma exata)', () => {
    const v = transformar({ hotels: [produto({ totals: { amount: 750 } }), produto({ totals: { amount: 250 } })] })
    expect(v.itens.map((i) => i.receitas)).toEqual([75, 25])
  })
  it('cancelado recebe 0 e NÃO entra no denominador', () => {
    const v = transformar({
      totals: { final_amount: 5000, revenue: 300 },
      hotels: [produto({ totals: { amount: 1000 } }), produto({ status: 'canceled', canceled_at: '2026-06-09', totals: { amount: 4000 } })],
    })
    expect(v.itens.map((i) => i.receitas)).toEqual([300, 0])
  })
  it('três iguais: 33,33 / 33,33 / 33,34', () => {
    const v = transformar({ hotels: [1, 2, 3].map(() => produto({ totals: { amount: 1 } })) })
    expect(v.itens.map((i) => i.receitas)).toEqual([33.33, 33.33, 33.34])
  })
  it('itens na ORDEM dos tipos do manual (hotel antes de aéreo antes de seguro antes de others)', () => {
    const v = transformar({
      others: [produto({ product: { id: 'prd-ferry' } })],
      insurances: [produto({ begin_date: '2026-06-01', end_date: '2026-06-09' })],
      airline_tickets: [produto({ segments: [] })],
      hotels: [produto()],
    })
    expect(v.itens.map((i) => i.product_kind)).toEqual(['hotels', 'airline_tickets', 'insurances', 'others'])
  })
})

describe('transformSale v3 — nome e datas por tipo', () => {
  it('hotel: accommodation_kind; sem ele, "Hospedagem"; datas check_in/check_out', () => {
    const a = transformar().itens[0]
    expect([a.produto, a.data_inicio, a.data_fim]).toEqual(['Single', '2026-06-11', '2026-06-12'])
    expect(transformar({ hotels: [produto({ accommodation_kind: null })] }).itens[0].produto).toBe('Hospedagem')
  })
  it('aéreo: rótulo fixo e datas = 1ª e ÚLTIMA PARTIDA dos trechos (não a última chegada)', () => {
    const a = transformar({ hotels: [], airline_tickets: [produto({ segments: [
      { departure_date: '2026-12-25T08:00:00', arrival_date: '2026-12-26T01:00:00' },
      { departure_date: '2026-12-12T22:00:00', arrival_date: '2026-12-13T09:00:00' },
    ] })] }).itens[0]
    expect([a.produto, a.data_inicio, a.data_fim]).toEqual(['Passagem aérea', '2026-12-12', '2026-12-25'])
  })
  it('seguro, locação e pacote', () => {
    const v = transformar({ hotels: [],
      insurances: [produto({ begin_date: '2026-07-01', end_date: '2026-07-20' })],
      car_rentals: [produto({ pickup_date: '2026-10-03T14:00:00', dropoff_date: '2026-10-07T10:00:00' })],
      travel_packages: [produto({ package_name: 'Tropical Snack', begin_date: '2026-08-01', end_date: '2026-08-05' })],
    })
    expect(v.itens.map((i) => [i.produto, i.data_inicio, i.data_fim])).toEqual([
      ['Seguro viagem', '2026-07-01', '2026-07-20'],
      ['Locação de veículo', '2026-10-03', '2026-10-07'],
      ['Tropical Snack', '2026-08-01', '2026-08-05'],
    ])
  })
  // v5.12.0 — o nome do CATÁLOGO é o que `get_contratos_casamento_mes` filtra. O catálogo da v3 traz
  // espaço no fim do nome ("Transporte Rodoviario "); o espelho guarda sem.
  it('others/operations: nome do catálogo SEM espaço final; datas departure/arrival', () => {
    const v = transformar({ custom_fields: [{ id: SETOR, value: 'Weddings' }], hotels: [],
      others: [produto({ product: { id: 'prd-contrato' }, departure_date: '2027-05-01', arrival_date: null })],
      operations: [produto({ product: { id: 'prd-desconhecido' } })],
    })
    expect(v.itens[0].produto).toBe('Contrato de casamento')
    expect([v.itens[0].data_inicio, v.itens[0].data_fim]).toEqual(['2027-05-01', null])
    expect(v.itens[1].produto).toBeNull()
  })
})

describe('canceladoEm — fuso explícito de Brasília', () => {
  it('data pura vira meia-noite de Brasília (o que o espelho já guarda: 03:00Z)', () => {
    expect(canceladoEm('2026-08-20')).toBe('2026-08-20T00:00:00-03:00')
    expect(new Date(canceladoEm('2026-08-20')!).toISOString()).toBe('2026-08-20T03:00:00.000Z')
  })
  it('data-hora sem fuso ganha -03:00; com fuso fica como veio; vazio é null', () => {
    expect(canceladoEm('2026-08-20T10:30:00')).toBe('2026-08-20T10:30:00-03:00')
    expect(canceladoEm('2026-08-20T10:30:00Z')).toBe('2026-08-20T10:30:00Z')
    expect(canceladoEm(null)).toBeNull()
    expect(canceladoEm('  ')).toBeNull()
  })
})

describe('raw_hash (v6.2.0: o hash da origem passou a ser nosso)', () => {
  it('mesmo conteúdo com chaves em outra ordem dá o MESMO hash', () => {
    expect(hashDoRaw({ a: 1, b: { c: [1, { d: 2, e: 3 }] } })).toBe(hashDoRaw({ b: { c: [1, { e: 3, d: 2 }] }, a: 1 }))
    expect(jsonCanonico({ b: 1, a: undefined, c: null })).toBe('{"b":1,"c":null}')
  })
  it('conteúdo diferente dá hash diferente; o hash carrega a versão da transformação', () => {
    expect(hashDoRaw({ a: 1 })).not.toBe(hashDoRaw({ a: 2 }))
    expect(transformar().raw_hash).toMatch(new RegExp(`^[0-9a-f]{64}#t${VERSAO_TRANSFORM}$`))
    expect(VERSAO_TRANSFORM).toBe(3) // 2 = era TTARS; subir de novo quando a saída mudar para o mesmo raw
  })
  it('o raw gravado é o payload como veio, com o número da venda ainda numérico', () => {
    const v = transformar()
    expect((v.raw as { sale_number: unknown }).sale_number).toBe(100)
  })
})

describe('zVendaDetalhe — estrito no que decide receita', () => {
  it('totals sem revenue falha o parse (nunca zero silencioso)', () => {
    expect(zVendaDetalhe.safeParse({ id: 'x', sale_number: 1, sale_date: '2026-01-01', totals: { final_amount: 1 } }).success).toBe(false)
  })
})
