import { describe, it, expect } from 'vitest'
import { transformSale, VERSAO_TRANSFORM } from './transform'
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
  // v5.4.5 — INVERSÃO DELIBERADA. Até a v5.4.4 este caso devolvia `{excluida:'sem_item_ativo'}`,
  // e era isso que criava o furo: a venda saía do universo de escrita e a linha antiga ficava
  // CONGELADA no espelho (medido: 10 vendas, +25% na receita de jul/2026). Agora ela é espelhada
  // com os itens cancelados e a mv — que já filtra `status='active'` — a ignora sozinha.
  it('ESPELHA venda sem nenhum item ativo (não exclui mais) e ela soma ZERO', () => {
    const r = transformSale(sale({
      total_revenue: 5000, // a API pode reportar receita mesmo com tudo cancelado (venda 73083)
      products: [product({ status: 'canceled', canceled_at: '2026-06-09T00:00:00Z', total_amount: 900 })],
    }))
    if (!('venda' in r)) throw new Error('não deve mais excluir por sem_item_ativo')
    expect(r.venda.itens).toHaveLength(1)
    expect(r.venda.itens[0].status).toBe('canceled')
    expect(r.venda.itens[0].canceled_at).toBe('2026-06-09T00:00:00Z')
    // O que faz a venda sumir dos totais: o item existe, mas nada é alocado nele.
    expect(r.venda.itens[0].receitas).toBe(0)
    // O `total_revenue` da venda NÃO é distribuído quando não há ativo — não vaza para o cancelado.
    expect(r.venda.itens.reduce((s, i) => s + i.receitas, 0)).toBe(0)
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

  // v5.4.5 — o cancelado passa a ser GRAVADO (antes era descartado aqui). Quem filtra é a mv.
  it('grava o item cancelado junto do ativo, e o rateio de receita NÃO vaza para ele', () => {
    const r = transformSale(sale({
      total_revenue: 300,
      products: [
        product({ description: 'Ativo', status: 'active', total_amount: 1000 }),
        product({ description: 'Cancelado', status: 'canceled', canceled_at: '2026-06-09T00:00:00Z', total_amount: 4000 }),
      ],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens).toHaveLength(2)

    const ativo = r.venda.itens.find(i => i.produto === 'Ativo')!
    const cancelado = r.venda.itens.find(i => i.produto === 'Cancelado')!
    expect(cancelado.status).toBe('canceled')
    expect(cancelado.receitas).toBe(0)
    // O denominador do rateio é a soma dos ATIVOS: o ativo leva os 300 inteiros, apesar de o
    // cancelado ter 4× o valor dele. Se o cancelado entrasse na conta, o ativo levaria 60.
    expect(ativo.receitas).toBe(300)
    // Invariante que não pode quebrar: soma dos ATIVOS = total_revenue, ao centavo.
    const somaAtivos = r.venda.itens.filter(i => i.status === 'active').reduce((s, i) => s + i.receitas, 0)
    expect(somaAtivos).toBe(300)
  })

  // Guarda de não-regressão: para venda SEM cancelado, nada pode ter mudado na v5.4.5.
  it('venda só com ativos: o rateio continua idêntico ao de antes (resto no último)', () => {
    const r = transformSale(sale({
      total_revenue: 100,
      products: [
        product({ description: 'A', status: 'active', total_amount: 1 }),
        product({ description: 'B', status: 'active', total_amount: 1 }),
        product({ description: 'C', status: 'active', total_amount: 1 }),
      ],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens.map(i => i.receitas)).toEqual([33.33, 33.33, 33.34]) // resto ao último
    expect(r.venda.itens.reduce((s, i) => s + i.receitas, 0)).toBe(100)
  })
})

// v5.12.0 — desde jun/2026 o provedor manda rótulo genérico em `description` nos tipos
// others/operations e o nome do catálogo em `product_name_resolvido`. Gravar `description`
// zerou `get_contratos_casamento_mes` (que filtra `produto ILIKE 'contrato de casamento%'`)
// de jun a set/2026, com 15 contratos na API.
describe('transformSale — nome do produto e versão da transformação (v5.12.0)', () => {
  it('produto = nome do catálogo quando description é o rótulo genérico "Outros"', () => {
    const r = transformSale(sale({
      custom_fields: [{ name: 'Setor', value: 'Weddings' }],
      products: [product({ product_kind: 'others', description: 'Outros', product_name_resolvido: 'Contrato de casamento' })],
    }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens[0].produto).toBe('Contrato de casamento')
  })
  it('produto cai para description quando o tipo não tem catálogo (hotel, aéreo, seguro)', () => {
    const r = transformSale(sale({ products: [product({ description: 'Hotel Single', product_name_resolvido: null })] }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens[0].produto).toBe('Hotel Single')
  })
  it('produto = null quando a API não manda nenhum dos dois (description sai em 2026-10-01)', () => {
    const r = transformSale(sale({ products: [product({ description: undefined, product_name_resolvido: undefined })] }))
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.itens[0].produto).toBeNull()
  })
  // O promover só reescreve venda cujo `raw_hash` mudou. Sem a versão no hash, corrigir a
  // transformação não alcançaria nenhuma venda já espelhada (o `raw` do Monde é o mesmo).
  it('raw_hash gravado = hash do provedor + versão da transformação', () => {
    const r = transformSale(sale())
    if (!('venda' in r)) throw new Error('esperava venda')
    expect(r.venda.raw_hash).toBe(`h100#t${VERSAO_TRANSFORM}`)
    expect(VERSAO_TRANSFORM).toBeGreaterThanOrEqual(2) // a v1 (hash cru) é o que está gravado até a v5.12.0
  })
})
