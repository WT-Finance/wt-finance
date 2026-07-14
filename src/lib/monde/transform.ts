import { setorMacro, SETOR_WELCOME, type SetorMacro } from './sectors'
import type { SaleDetail, Product } from './schemas'

// Transformação PURA (sem I/O — testável isoladamente) de um SaleDetail da API Monde
// numa linha de venda-espelho, pronta para a RPC `monde_ingest_lote` (v5.1.2 — Ingestão
// Monde). Aplica as exclusões de escopo do briefing (setor Welcome = emissão interna;
// setor fora do mapa; venda sem nenhum item ativo) e a SÍNTESE de 3 campos sem sinal
// direto na API — ver ADR-0149: a decisão foi consumir o `raw` cru (guardado por
// inteiro em cada venda) e reconstruir esses sinais por heurística, documentada aqui,
// em vez de esperar a API expor os campos. Nenhuma dessas heurísticas afeta a agregação
// da materialized view — são de completude/auditoria; reprocessáveis a partir do `raw`
// se a heurística mudar.

export interface ItemEspelho {
  produto: string | null
  product_kind: string | null
  fornecedor: string | null
  status: string
  canceled_at: string | null
  valor_total: number
  receitas: number
  data_inicio: string | null
  data_fim: string | null
  passageiros: number | null
}

export interface VendaEspelho {
  venda_numero: string
  sale_id: string | null
  data_venda: string
  status: string
  setor_micro: string
  setor_macro: SetorMacro
  vendedor: string | null
  pagante: string | null
  pagante_doc: string | null
  contrato: boolean
  taxa_servico: boolean
  operacao_propria: boolean
  total_final_value: number | null
  total_revenue: number | null
  raw: unknown
  raw_hash: string
  itens: ItemEspelho[]
}

export type TransformResult =
  | { venda: VendaEspelho }
  | { excluida: 'welcome' | 'sem_setor' | 'sem_item_ativo' }

const CAMPO_SETOR = 'Setor'
const CAMPO_VENDEDOR_WEDDINGS = 'Vendedor(a) Responsável - Grupo'

/** Valor (trim, `null` se ausente/vazio) do custom_field cujo `name` bate exatamente. */
function customFieldValor(sale: SaleDetail, nome: string): string | null {
  const cf = sale.custom_fields.find((f) => f.name === nome)
  const v = cf?.value?.trim()
  return v ? v : null
}

/**
 * Converte um SaleDetail em uma venda-espelho, ou sinaliza exclusão. Regras 1-6 do
 * briefing v5.1.2 (ver módulo). Nunca lança — Zod (schemas.ts) já tolerou o formato;
 * aqui só há decisão de escopo/síntese sobre dado já validado.
 */
export function transformSale(sale: SaleDetail): TransformResult {
  // 1. Setor: custom_field "Setor" → micro → macro. Sem setor, Welcome e desconhecido excluem.
  const micro = customFieldValor(sale, CAMPO_SETOR)
  if (micro === null) return { excluida: 'sem_setor' }        // sem custom_field Setor
  if (micro === SETOR_WELCOME) return { excluida: 'welcome' } // emissão interna

  const macro = setorMacro(micro)
  if (macro === null) return { excluida: 'sem_setor' }        // micro fora do mapa

  // 2. Itens = só produtos ativos (cancelado não compõe a venda-espelho).
  const itensAtivos: Product[] = sale.products.filter((p) => p.status === 'active')
  if (itensAtivos.length === 0) return { excluida: 'sem_item_ativo' }

  // 3. Vendedor: em Weddings, custom_field dedicado tem prioridade, com fallback ao
  // travel_agent_name se ausente/vazio; nos demais setores, sempre travel_agent_name.
  const vendedorWeddings = macro === 'Weddings' ? customFieldValor(sale, CAMPO_VENDEDOR_WEDDINGS) : null
  const travelAgent = sale.travel_agent_name?.trim() || null
  const vendedor = vendedorWeddings ?? travelAgent

  // 4. Síntese (ADR-0149) — não afeta a agregação da mv; é completude/auditoria.
  //    - taxa_servico: algum item ATIVO cobrou taxa de agência (> 0).
  //    - operacao_propria: heurística PROVISÓRIA a partir de `raw.intermediary`
  //      (ausente/null = operação própria); `raw` fica guardado por inteiro para
  //      reprocessar se a heurística precisar mudar.
  //    - contrato: sem sinal confiável na API hoje — default explícito `false`
  //      (não é "falso valor"; é "não sabemos", registrado como tal); `raw` guardado.
  const taxaServico = itensAtivos.some((p) => (p.agency_service_fee ?? 0) > 0)
  const intermediary = sale.raw.intermediary
  const operacaoPropria = intermediary === undefined || intermediary === null
  const contrato = false

  // RECEITA por item: o `total_revenue` da VENDA é o número autoritativo do Monde (agrega
  // ~ao que o upload traz); a soma dos componentes por produto (comissão/over/taxa/RAV/pax_fee)
  // NÃO o reconstrói de forma confiável (verificado ao vivo: nenhuma combinação bate por venda).
  // Então distribuímos o `total_revenue` entre os itens ATIVOS proporcional ao valor, com o resto
  // de arredondamento no ÚLTIMO item → a soma por venda bate com total_revenue AO CENTAVO. É uma
  // ALOCAÇÃO (não receita nativa por item); só o agregado (o que a comparação mostra) importa. (ADR-0149.)
  const totalRevenue = sale.total_revenue ?? 0
  const somaValor = itensAtivos.reduce((s, p) => s + (p.total_amount ?? 0), 0)
  let acumulado = 0
  const itens: ItemEspelho[] = itensAtivos.map((p, idx) => {
    let receita: number
    if (idx === itensAtivos.length - 1) {
      receita = Math.round((totalRevenue - acumulado) * 100) / 100 // resto ao último → soma exata
    } else {
      const frac = somaValor > 0 ? (p.total_amount ?? 0) / somaValor : 1 / itensAtivos.length
      receita = Math.round(totalRevenue * frac * 100) / 100
      acumulado += receita
    }
    return {
      produto: p.description ?? null,
      product_kind: p.product_kind ?? null,
      fornecedor: p.supplier_name ?? null,
      status: p.status,
      canceled_at: p.canceled_at ?? null,
      valor_total: p.total_amount ?? 0,
      receitas: receita,
      data_inicio: p.data_inicio ?? null,
      data_fim: p.data_fim ?? null,
      passageiros: p.passengers?.length ?? null,
    }
  })

  const venda: VendaEspelho = {
    venda_numero: sale.sale_number,
    sale_id: sale.sale_id ?? null,
    data_venda: sale.sale_date,
    status: sale.status,
    setor_micro: micro,
    setor_macro: macro,
    vendedor,
    pagante: sale.payer_name ?? null,
    pagante_doc: sale.payer_cpf_cnpj ?? null,
    contrato,
    taxa_servico: taxaServico,
    operacao_propria: operacaoPropria,
    total_final_value: sale.total_final_value ?? null,
    total_revenue: sale.total_revenue ?? null,
    raw: sale.raw,
    raw_hash: sale.raw_hash,
    itens,
  }

  return { venda }
}
