import { createHash } from 'node:crypto'
import { setorMacro, SETOR_WELCOME, type SetorMacro } from './sectors'
import type { VendaDetalhe, Produto } from './schemas'

// Transformação PURA (sem I/O — testável isoladamente) de uma venda da API OFICIAL do Monde (v3) numa
// linha de venda-espelho, pronta para a RPC `monde_ingest_lote`. Aplica as exclusões de ESCOPO (setor
// Welcome = emissão interna; setor fora do mapa) e a síntese de 3 campos sem sinal direto na API
// (ADR-0149).
//
// ── v6.2.0: A FONTE MUDOU, A SAÍDA NÃO ─────────────────────────────────────────────────────
// Até a v6.1.x a venda chegava pela `monde-data` do TTARS, que embrulhava este mesmo payload e
// acrescentava nomes resolvidos (`payer_name`, `travel_agent_name`, `supplier_name`,
// `product_name_resolvido`, `custom_fields[].name`, `data_inicio`/`data_fim`, `total_amount`). A v3
// manda só ids. Cada regra abaixo reconstrói o que o TTARS entregava e foi PROVADA contra as colunas
// já gravadas no espelho (jul–set/2026: 2.140 vendas, 4.604 itens — o `raw` guardado é o payload v3):
//   • valor do item = `totals.amount` (4604/4604);
//   • datas por tipo (100% em todos os tipos presentes; no aéreo, 1ª..última PARTIDA dos trechos);
//   • nome do produto por tipo (hotel `accommodation_kind`, pacote `package_name`, others/operations o
//     nome do catálogo SEM o espaço final, demais um rótulo fixo);
//   • setor = campo personalizado "Setor" (2140/2140); vendedor de Weddings = campo "Vendedor(a)
//     Responsável - Grupo" ou, sem ele, o nome do seller; nomes de pessoa = `/people/{id}.name`.
// Os ids dos campos personalizados NÃO são fixados aqui: o resolvedor os acha pelo NOME em
// `/custom_fields` — a mesma chave que a v5.x usava.
//
// ── v5.4.5: O ESPELHO ESPELHA; A REGRA DE NEGÓCIO MORA NA LEITURA (ADR-0165) ───────────────
// Gravamos TODOS os produtos, com o `status` real; quem decide o que soma é a
// `monde.mv_vendas_diarias` (`WHERE i.status = 'active'`). Venda 100% cancelada entra no espelho e
// soma zero sozinha. Só `welcome` e `sem_setor` continuam sendo exclusão (de ESCOPO, estável).

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

// `sem_item_ativo` continua no tipo, mas NUNCA é retornado (v5.4.5) — a chave segue no shape do
// tripwire e em dado já gravado.
export type TransformResult =
  | { venda: VendaEspelho }
  | { excluida: 'welcome' | 'sem_setor' | 'sem_item_ativo' }

/** O que o transform precisa saber que a venda não traz (nomes) — ver `nomes.ts`. */
export interface Resolvedor {
  /** Nome e documento de uma pessoa do Monde; `null` se desconhecida. */
  pessoa(id: string | null | undefined): { nome: string | null; cpf_cnpj: string | null } | null
  /** Nome do produto do catálogo; `null` se desconhecido. */
  produtoCatalogo(id: string | null | undefined): string | null
  /** Id do campo personalizado "Setor". */
  readonly campoSetor: number
  /** Id do campo "Vendedor(a) Responsável - Grupo" (`null` se o Monde não tiver mais o campo). */
  readonly campoVendedorWeddings: number | null
}

// ── VERSÃO DA TRANSFORMAÇÃO NO `raw_hash` (v5.12.0) ───────────────────────────────────────────
// O `monde_ingest_promover` só reescreve uma venda quando `raw_hash` MUDA. O hash carrega a versão da
// transformação para que mudar a REGRA (sem o Monde mudar a venda) reescreva cada venda uma vez.
// v6.2.0: 3 — e o hash da origem passou a ser NOSSO (o TTARS mandava pronto): sha256 do JSON
// canônico do payload (chaves ordenadas), estável para o mesmo conteúdo.
export const VERSAO_TRANSFORM = 3

/** JSON com as chaves de todo objeto em ordem — a mesma venda dá sempre o mesmo texto. */
export function jsonCanonico(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(',')}}`
}

/** `raw_hash` gravado: sha256 do payload canônico + versão da transformação. */
export function hashDoRaw(raw: unknown): string {
  return `${createHash('sha256').update(jsonCanonico(raw)).digest('hex')}#t${VERSAO_TRANSFORM}`
}

/**
 * Tipos de produto, NA ORDEM em que os itens são gravados. É a ordem dos arrays no manual da v3 e a
 * ordem que o espelho já tem (medido em 05/10: as sequências multi-tipo gravadas seguem esta lista).
 * O valor gravado em `product_kind` é o nome do array — o mesmo que a v5.x gravava.
 */
export const TIPOS_PRODUTO = [
  'hotels', 'airline_tickets', 'insurances', 'cruises', 'car_rentals', 'ground_transportations',
  'train_tickets', 'travel_packages', 'others', 'operations', 'cvc_packages', 'excursions',
] as const
export type TipoProduto = (typeof TIPOS_PRODUTO)[number]

/** Rótulo do produto nos tipos sem nome próprio — o que o TTARS gravava (medido nos tipos presentes). */
const ROTULO_FIXO: Partial<Record<TipoProduto, string>> = {
  airline_tickets: 'Passagem aérea',
  insurances: 'Seguro viagem',
  car_rentals: 'Locação de veículo',
  // Tipos AUSENTES do espelho até 05/10 (nenhum item gravado): rótulo genérico, sem leitor hoje.
  cruises: 'Cruzeiro',
  ground_transportations: 'Transporte terrestre',
  train_tickets: 'Passagem de trem',
  cvc_packages: 'Pacote CVC',
  excursions: 'Excursão',
}

function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Parte de data (`AAAA-MM-DD`) de um campo de data ou data-hora sem fuso. */
function dia(v: string | null | undefined): string | null {
  const s = v?.trim()
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null
}

function nomeDoProduto(tipo: TipoProduto, p: Produto, r: Resolvedor): string | null {
  switch (tipo) {
    case 'hotels': return texto(p.accommodation_kind) ?? 'Hospedagem'
    case 'travel_packages': return texto(p.package_name)
    case 'others':
    case 'operations': return texto(r.produtoCatalogo(p.product?.id)) // o catálogo tem espaço final
    case 'cruises': return texto(p.ship_name) ?? ROTULO_FIXO.cruises ?? null
    case 'cvc_packages': return texto(p.package_name) ?? ROTULO_FIXO.cvc_packages ?? null
    default: return ROTULO_FIXO[tipo] ?? null
  }
}

function datasDoProduto(tipo: TipoProduto, p: Produto): { inicio: string | null; fim: string | null } {
  switch (tipo) {
    case 'hotels': return { inicio: dia(p.check_in), fim: dia(p.check_out) }
    case 'airline_tickets': {
      // A data do aéreo só existe nos trechos. O TTARS gravava a 1ª e a ÚLTIMA PARTIDA (1031/1031);
      // "última chegada" errava 83 itens.
      const partidas = p.segments.map((s) => dia(s.departure_date)).filter((d): d is string => d !== null).sort()
      return { inicio: partidas[0] ?? null, fim: partidas[partidas.length - 1] ?? null }
    }
    case 'insurances':
    case 'travel_packages': return { inicio: dia(p.begin_date), fim: dia(p.end_date) }
    case 'car_rentals': return { inicio: dia(p.pickup_date), fim: dia(p.dropoff_date) }
    case 'others':
    case 'operations':
    case 'cruises': return { inicio: dia(p.departure_date), fim: dia(p.arrival_date) }
    default:
      // Tipos ausentes do espelho: o primeiro par de datas que existir.
      return {
        inicio: dia(p.begin_date) ?? dia(p.departure_date) ?? dia(p.check_in) ?? dia(p.pickup_date),
        fim: dia(p.end_date) ?? dia(p.arrival_date) ?? dia(p.check_out) ?? dia(p.dropoff_date),
      }
  }
}

/**
 * `canceled_at` da v3 vem como DATA (`2026-08-20`) ou data-hora SEM fuso, sempre no horário de
 * Brasília. A coluna é `timestamptz` e o espelho já guarda a meia-noite de Brasília
 * (`2026-08-20T03:00:00Z`) — então o offset vai explícito; sem ele o Postgres leria em UTC e erraria 3 h.
 */
export function canceladoEm(v: string | null | undefined): string | null {
  const s = v?.trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00-03:00`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return `${s}-03:00`
  return s // já tem fuso
}

function valorCampo(venda: VendaDetalhe, id: number | null): string | null {
  if (id === null) return null
  return texto(venda.custom_fields.find((c) => c.id === id)?.value)
}

/**
 * Converte uma venda da v3 em uma venda-espelho, ou sinaliza exclusão. Nunca lança — o Zod
 * (schemas.ts) já validou o formato; aqui só há decisão de escopo e síntese.
 */
export function transformSale(venda: VendaDetalhe, raw: unknown, r: Resolvedor): TransformResult {
  // 1. Setor: campo "Setor" → micro → macro. Sem setor, Welcome e desconhecido excluem.
  const micro = valorCampo(venda, r.campoSetor)
  if (micro === null) return { excluida: 'sem_setor' }
  if (micro === SETOR_WELCOME) return { excluida: 'welcome' }
  const macro = setorMacro(micro)
  if (macro === null) return { excluida: 'sem_setor' }

  // 2. Itens = TODOS os produtos, na ordem dos tipos (v5.4.5: o cancelado é gravado com o status real).
  const produtos: { tipo: TipoProduto; p: Produto }[] = TIPOS_PRODUTO.flatMap((tipo) =>
    (venda[tipo] ?? []).map((p) => ({ tipo, p })))
  const ehAtivo = (p: Produto) => p.status === 'active'
  const ativos = produtos.filter(({ p }) => ehAtivo(p))

  // 3. Vendedor: em Weddings o campo dedicado tem prioridade; senão, o seller da venda.
  const nomeSeller = texto(r.pessoa(venda.seller?.id)?.nome)
  const vendedor = (macro === 'Weddings' ? valorCampo(venda, r.campoVendedorWeddings) : null) ?? nomeSeller

  // 4. Síntese (ADR-0149) — não afeta a agregação da mv.
  const taxaServico = ativos.some(({ p }) => (p.agency_service_fee ?? 0) > 0)
  const operacaoPropria = venda.intermediary === undefined || venda.intermediary === null
  const contrato = false

  // 5. RECEITA por item: o `totals.revenue` da VENDA distribuído entre os itens ATIVOS proporcional ao
  // valor, com o resto de arredondamento no ÚLTIMO ativo → a soma por venda bate ao centavo. Cancelado
  // recebe 0 (se participasse, receita vazaria para linha que a mv não soma). (ADR-0149, v5.4.5.)
  const totalRevenue = venda.totals.revenue
  const somaAtivos = ativos.reduce((s, { p }) => s + p.totals.amount, 0)
  const idxUltimoAtivo = produtos.reduce((ult, { p }, i) => (ehAtivo(p) ? i : ult), -1)
  let acumulado = 0
  const itens: ItemEspelho[] = produtos.map(({ tipo, p }, idx) => {
    let receita = 0
    if (ehAtivo(p)) {
      if (idx === idxUltimoAtivo) {
        receita = Math.round((totalRevenue - acumulado) * 100) / 100
      } else {
        const frac = somaAtivos > 0 ? p.totals.amount / somaAtivos : 1 / ativos.length
        receita = Math.round(totalRevenue * frac * 100) / 100
        acumulado += receita
      }
    }
    const { inicio, fim } = datasDoProduto(tipo, p)
    return {
      produto: nomeDoProduto(tipo, p, r),
      product_kind: tipo,
      fornecedor: texto(r.pessoa(p.supplier?.id)?.nome),
      status: p.status,
      canceled_at: canceladoEm(p.canceled_at),
      valor_total: p.totals.amount,
      receitas: receita,
      data_inicio: inicio,
      data_fim: fim,
      passageiros: p.passengers.length,
    }
  })

  const pagante = r.pessoa(venda.payer?.id)
  return {
    venda: {
      venda_numero: venda.sale_number,
      sale_id: venda.id,
      data_venda: venda.sale_date,
      status: venda.status,
      setor_micro: micro,
      setor_macro: macro,
      vendedor,
      pagante: texto(pagante?.nome),
      pagante_doc: texto(pagante?.cpf_cnpj),
      contrato,
      taxa_servico: taxaServico,
      operacao_propria: operacaoPropria,
      total_final_value: venda.totals.final_amount,
      total_revenue: venda.totals.revenue,
      raw,
      raw_hash: hashDoRaw(raw),
      itens,
    },
  }
}
