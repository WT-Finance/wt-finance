import { setorMacro, SETOR_WELCOME, type SetorMacro } from './sectors'
import type { SaleDetail, Product } from './schemas'

// Transformação PURA (sem I/O — testável isoladamente) de um SaleDetail da API Monde
// numa linha de venda-espelho, pronta para a RPC `monde_ingest_lote` (v5.1.2 — Ingestão
// Monde). Aplica as exclusões de ESCOPO (setor Welcome = emissão interna; setor fora do
// mapa) e a SÍNTESE de 3 campos sem sinal direto na API — ver ADR-0149: a decisão foi
// consumir o `raw` cru (guardado por inteiro em cada venda) e reconstruir esses sinais
// por heurística, documentada aqui, em vez de esperar a API expor os campos. Nenhuma
// dessas heurísticas afeta a agregação da materialized view — são de completude/auditoria;
// reprocessáveis a partir do `raw` se a heurística mudar.
//
// ── v5.4.5: O ESPELHO ESPELHA; A REGRA DE NEGÓCIO MORA NA LEITURA (ADR-0165) ───────────
// Até a v5.4.4 esta função filtrava `status === 'active'` ANTES de gravar e descartava a
// venda inteira quando não sobrava item ativo. Isso criava uma falha estrutural: o UPSERT
// só escreve sobre o universo que pediu, então venda que **saía** desse universo (todos os
// produtos cancelados na origem) ficava invisível para a escrita — não podia ser atualizada
// nem removida, e a linha velha sobrevivia CONGELADA com os valores de antes.
//
// Medido em 05/08/2026 contra a API, venda a venda, nos 12 meses — **24 vendas nessa condição,
// R$ 896.718,90 de faturamento e R$ 282.422,05 de receita** (baseline completo em
// `docs/investigacoes/2026-08-05-v5-4-5-baseline-vendas-retidas.md`). jul/2026 é o pior:
// **25,19% da receita do mês**, quase toda numa venda só (a 73083 valia R$ 293.721,82 no
// espelho e −R$ 687,96 na API). E crescia: julho foi de 5 para 6 em 24h.
//
// Agora gravamos TODOS os produtos, com o `status` real. Quem decide o que soma é a
// `monde.mv_vendas_diarias`, que **já filtra** `WHERE i.status = 'active'` desde a 0179 — um
// filtro que era código morto (a tabela tinha 47.182 itens, todos ativos) e passa a ser o
// mecanismo vivo. Venda 100% cancelada entra no espelho e não produz linha nenhuma na mv:
// contribui zero **sozinha**, sem ninguém marcar nada. Auto-corretiva.
//
// O que continua sendo excluído é só o que é exclusão de ESCOPO — `welcome` e `sem_setor` —,
// que é estável: uma venda não deixa de ser Welcome. (Resíduo conhecido e aceito: venda que
// MUDE para Welcome depois de espelhada ainda sobraria; zero casos medidos, e o tripwire a
// acusaria. Tratá-la exigiria filtrar venda na mv, o que só é possível com DROP+CREATE —
// destrutivo, e derrubaria a view-compat de que Metas e Performance dependem.)

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

// `sem_item_ativo` continua no tipo, mas NUNCA é mais retornado (v5.4.5): venda sem item ativo
// passou a ser espelhada, com os itens cancelados. O membro fica porque `IngestResult.excluidas`
// e o tripwire têm a chave no shape e em dado já gravado — removê-la quebraria o histórico do
// painel sem ganho. Vira zero permanente, e isso é observável de propósito.
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

  // 2. Itens = TODOS os produtos (v5.4.5). O cancelado é gravado com o `status` real e a mv o
  //    ignora — ver o bloco no topo. `itensAtivos` segue existindo porque é a base do RATEIO
  //    de receita (§5) e do `taxa_servico` (§4): esses continuam olhando só o que está vivo.
  //    Venda sem NENHUM item ativo não é mais excluída: ela é espelhada e soma zero.
  const itensAtivos: Product[] = sale.products.filter((p) => p.status === 'active')

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

  // 5. RECEITA por item: o `total_revenue` da VENDA é o número autoritativo do Monde (agrega
  // ~ao que o upload traz); a soma dos componentes por produto (comissão/over/taxa/RAV/pax_fee)
  // NÃO o reconstrói de forma confiável (verificado ao vivo: nenhuma combinação bate por venda).
  // Então distribuímos o `total_revenue` entre os itens ATIVOS proporcional ao valor, com o resto
  // de arredondamento no ÚLTIMO ATIVO → a soma por venda bate com total_revenue AO CENTAVO. É uma
  // ALOCAÇÃO (não receita nativa por item); só o agregado (o que a comparação mostra) importa. (ADR-0149.)
  //
  // ⚠️ v5.4.5 — o rateio continua caindo SÓ nos ativos; **cancelado recebe receitas = 0**. Se ele
  // participasse, receita vazaria para linha que a mv não soma e o total por venda deixaria de
  // fechar com `total_revenue`. Por isso o denominador é a soma dos ATIVOS e o resto vai ao último
  // ATIVO — daí `idxUltimoAtivo` em vez do último índice do array. Venda 100% cancelada não aloca
  // nada a ninguém (`idxUltimoAtivo === -1`) e soma zero, que é o comportamento pretendido.
  const totalRevenue = sale.total_revenue ?? 0
  const somaValorAtivos = itensAtivos.reduce((s, p) => s + (p.total_amount ?? 0), 0)
  const idxUltimoAtivo = sale.products.reduce((ult, p, i) => (p.status === 'active' ? i : ult), -1)
  let acumulado = 0
  const itens: ItemEspelho[] = sale.products.map((p, idx) => {
    let receita = 0 // cancelado fica em zero e não entra no rateio
    if (p.status === 'active') {
      if (idx === idxUltimoAtivo) {
        receita = Math.round((totalRevenue - acumulado) * 100) / 100 // resto ao último → soma exata
      } else {
        const frac = somaValorAtivos > 0 ? (p.total_amount ?? 0) / somaValorAtivos : 1 / itensAtivos.length
        receita = Math.round(totalRevenue * frac * 100) / 100
        acumulado += receita
      }
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
