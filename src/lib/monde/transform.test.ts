import { describe, it, expect } from 'vitest'
import { transformSale } from './transform'
import type { SaleDetail } from './schemas'

// Fixtures mínimas (só os campos que transformSale lê); cast via `unknown` porque a
// tolerância do Zod deixa muitos campos opcionais e o teste exercita a LÓGICA, não o parse.
function product(over: Record<string, unknown> = {}) {
  return {
    product_kind: 'hotels', description: 'Hotel Single', supplier_name: 'Fornecedor',
    status: 'active', canceled_at: null, total_amount: 500, agency_service_fee: 0,
    over_amount: 0, intermediary_commission_amount: 0, data_inicio: '2026-06-11',
    data_fim: '2026-06-12', passengers: [{ person_name: 'P', amount: 480, agency_fee: 20, fees: 0 }],
    ...over,
  }
}
function sale(over: Record<string, unknown> = {}): SaleDetail {
  return {
    sale_number: '100', sale_id: 'uuid-100', sale_date: '2026-06-10', status: 'closed',
    travel_agent_name: 'Agente Emissor', payer_name: 'Cliente Y', payer_cpf_cnpj: '123',
    total_final_value: 1000, total_revenue: 100, raw: {}, raw_hash: 'h100',
    custom_fields: [{ name: 'Setor', value: 'Corporativo' }],
    products: [product()],
    ...over,
  } as unknown as SaleDetail
}

describe('transformSale — exclusões', () => {
  it('exclui setor Welcome (emissão interna)', () => {
    const r = transformSale(sale({ custom_fields: [{ name: 'Setor', value: 'Welcome' }] }))
    expect(r).toEqual({ excluida: 'welcome' })
  })
  it('exclui venda sem custom_field Setor', () => {
    const r = transformSale(sale({ custom_fields: [] }))
    expect(r).toEqual({ excluida: 'sem_setor' })
  })
  it('exclui micro desconhecido (fora do mapa)', () => {
    const r = transformSale(sale({ custom_fields: [{ name: 'Setor', value: 'Foo' }] }))
    expect(r).toEqual({ excluida: 'sem_setor' })
  })
  it('exclui venda sem NENHUM item ativo (todos cancelados)', () => {
    const r = transformSale(sale({ products: [product({ status: 'canceled', canceled_at: '2026-06-09T00:00:00Z' })] }))
    expect(r).toEqual({ excluida: 'sem_item_ativo' })
  })
})

describe('transformSale — mapeamento e síntese', () => {
  it('Corporativo: macro Corporativo, vendedor = travel_agent_name, contrato false, receitas somadas', () => {
    const r = transformSale(sale())
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.setor_macro).toBe('Corporativo')
    expect(r.venda.setor_micro).toBe('Corporativo')
    expect(r.venda.vendedor).toBe('Agente Emissor')
    expect(r.venda.contrato).toBe(false)
    expect(r.venda.taxa_servico).toBe(false)          // agency_service_fee 0
    expect(r.venda.operacao_propria).toBe(true)       // raw.intermediary ausente
    expect(r.venda.itens).toHaveLength(1)
    expect(r.venda.itens[0].receitas).toBe(100)       // total_revenue da venda (1 item → tudo)
    expect(r.venda.itens[0].valor_total).toBe(500)
  })

  it('receita = total_revenue da venda distribuído por valor entre os itens ativos (soma exata)', () => {
    const r = transformSale(sale({
      total_revenue: 100,
      products: [
        product({ description: 'A', total_amount: 750, passengers: [] }),
        product({ description: 'B', total_amount: 250, passengers: [] }),
      ],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    const recs = r.venda.itens.map(i => i.receitas)
    expect(recs[0]).toBe(75)                                  // 750/1000 × 100
    expect(recs[1]).toBe(25)                                  // resto → 100 − 75
    expect(recs[0] + recs[1]).toBe(100)                        // soma = total_revenue ao centavo
  })

  it('Lazer e Expedições → macro Lazer', () => {
    for (const micro of ['Lazer', 'Expedições']) {
      const r = transformSale(sale({ custom_fields: [{ name: 'Setor', value: micro }] }))
      if (!('venda' in r)) throw new Error('esperava venda')
      expect(r.venda.setor_macro).toBe('Lazer')
    }
  })

  it('Weddings: vendedor vem do custom_field "Vendedor(a) Responsável - Grupo"', () => {
    const r = transformSale(sale({
      custom_fields: [
        { name: 'Setor', value: 'WedMe' },
        { name: 'Vendedor(a) Responsável - Grupo', value: 'Consultora Wed' },
      ],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.setor_macro).toBe('Weddings')
    expect(r.venda.vendedor).toBe('Consultora Wed')
  })

  it('Weddings sem o custom_field de vendedor → fallback travel_agent_name', () => {
    const r = transformSale(sale({ custom_fields: [{ name: 'Setor', value: 'Weddings' }] }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.vendedor).toBe('Agente Emissor')
  })

  it('taxa_servico = true quando algum item ativo tem agency_service_fee > 0', () => {
    const r = transformSale(sale({ products: [product({ agency_service_fee: 15 })] }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.taxa_servico).toBe(true)
  })

  it('operacao_propria = false quando raw.intermediary está presente', () => {
    const r = transformSale(sale({ raw: { intermediary: { name: 'Agência X' } } }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.operacao_propria).toBe(false)
  })

  it('só os itens ATIVOS entram (cancelado é descartado do espelho)', () => {
    const r = transformSale(sale({
      products: [
        product({ description: 'Ativo', status: 'active' }),
        product({ description: 'Cancelado', status: 'canceled', canceled_at: '2026-06-09T00:00:00Z' }),
      ],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens).toHaveLength(1)
    expect(r.venda.itens[0].produto).toBe('Ativo')
  })
})
