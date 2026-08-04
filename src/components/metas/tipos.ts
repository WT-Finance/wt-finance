// Contrato de dados do Acompanhamento de Metas (v5.0.0) — compartilhado entre o
// Server Component (src/app/metas/page.tsx, que monta) e os componentes de
// apresentação (client). O REAL vem de get_executiva_kpis (fonte única); o cálculo
// de ritmo/meta/pró-rata vem do módulo puro calcularRitmo (já testado).

import type { RitmoAgregado, RitmoResultado } from '@/lib/metas/ritmo'
import type { ProdutoNaoClassificado } from '@/types/api'

/** Um painel = Group (computado) OU um setor. */
export interface PainelSetor {
  /** Chave interna do banco: 'todos' | 'Lazer' | 'Weddings' | 'Corporativo'. */
  key: string
  /** Rótulo de exibição: 'Group' | 'Trips' | 'Weddings' | 'Corporativo'. */
  display: string
  /** Cor de identidade (var()); Group usa neutro. */
  cor: string
  /** Faturamento (VT) realizado no período — da fonte única. */
  faturamento: number | null
  /** Receita realizada no período. */
  receita: number | null
  /** % Rec REALIZADO = receita/faturamento (o margem_pct da Performance). */
  margemPct: number | null
  /** Nº de contratos de casamento vendidos no período (subsetor COMERCIAL de Weddings,
   *  de get_sumario_subsetor). SÓ preenchido no painel Weddings; null nos demais. */
  contratos?: number | null
  /** Ritmo (meta do período, % da meta, esperado, ritmo%, status, pontos do gráfico). */
  ritmo: RitmoResultado
}

/**
 * Um subsetor de Weddings (v5.4.4). Subsetor é agrupamento de PRODUTO, não de equipe:
 * o balde vem de `analytics.dim_produto_subsetor` (21 produtos curados), o mesmo que a
 * Performance usa. A meta cadastrada contra ele é, portanto, meta de MIX DE PRODUTO.
 *
 * ⚠️ O realizado aqui vem do UPLOAD (`analytics.fato_venda_item`), enquanto o realizado
 * do setor Weddings vem do MONDE (`get_executiva_kpis`). As duas fontes não fecham fora
 * do mês corrente — medido em 2026: 0,00 em agosto, 19,1% em julho, 5,1% no ano. Some-se
 * a isso o balde `naoClassificado`. Por isso a soma dos cards de subsetor NÃO é o card de
 * Weddings, e a expansão declara as fontes. O Scope B (repontar produto ao Monde) fecha.
 */
export interface PainelSubsetor {
  /** Chave do banco, exatamente como em `SUBSETOR_ORDER`. */
  key: string
  /** Rótulo curto ('Comercial', 'Convidados'). */
  display: string
  /** Segunda linha do par CONVIDADOS ('Hospedagens' | 'Extras'); ausente nos outros três. */
  subtitulo?: string
  /** Cor do subsetor (token `--subsetor-*`). NUNCA hex. */
  cor: string
  faturamento: number
  receita: number
  /** % Rec realizado do subsetor. */
  margemPct: number | null
  /** Contratos de casamento vendidos. SÓ COMERCIAL; null nos demais. */
  contratos: number | null
  /** Ritmo em R$ — existe em todos. É o que compõe a soma da meta de Weddings. */
  ritmo: RitmoAgregado
  /** Ritmo em CONTRATOS — só COMERCIAL. Quando existe, governa o topo e a barra do card. */
  ritmoContratos: RitmoAgregado | null
}

/** O balde de produtos de Weddings que estão FORA do mapa de subsetor (v5.4.4). */
export interface NaoClassificado {
  faturamento: number
  receita: number
  /** Detalhe produto a produto. Vazio se a chave da 0234 ainda não existir no banco. */
  produtos: ProdutoNaoClassificado[]
}

export interface AcompanhamentoData {
  preset: string
  periodoLabel: string
  from: string
  to: string
  /** Período ainda em curso (fim >= hoje). */
  eParcial: boolean
  /** Data da última venda carregada (ISO) — o "hoje" do produto. */
  ultimaVenda: string | null
  /** timestamptz (UTC) da última SINCRONIZAÇÃO com o Monde
   *  (monde_ingest_status.ultima_sincronizacao = max(atualizado_em) de monde.ingest_control) —
   *  "última atualização" exibida no topo; avança a cada pull do cron (~15min). (v5.1.8; antes
   *  usava ultima_sync = MAX(sincronizado_em) = último dado mudado, que congelava em janelas
   *  sem venda nova.) Fallback a ultima_sync. null se indisponível. */
  ultimaAtualizacao: string | null
  /** [Group, Trips, Weddings, Corporativo] — nesta ordem. */
  setores: PainelSetor[]
  /** Subsetores de Weddings, na ordem de `SUBSETOR_ORDER` (v5.4.4).
   *  `null` = a RPC falhou ou o acesso foi negado → a expansão do card não aparece. */
  subsetores: PainelSubsetor[] | null
  /** Balde fora do mapa. `null` = não houve nada não classificado no período (o caso
   *  normal do mês corrente) → a faixa não é renderizada. */
  naoClassificado: NaoClassificado | null
}
