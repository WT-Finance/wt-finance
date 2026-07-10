// Contrato de dados do Acompanhamento de Metas (v5.0.0) — compartilhado entre o
// Server Component (src/app/metas/page.tsx, que monta) e os componentes de
// apresentação (client). O REAL vem de get_executiva_kpis (fonte única); o cálculo
// de ritmo/meta/pró-rata vem do módulo puro calcularRitmo (já testado).

import type { RitmoResultado } from '@/lib/metas/ritmo'

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
  /** Ritmo (meta do período, % da meta, esperado, ritmo%, status, pontos do gráfico). */
  ritmo: RitmoResultado
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
  /** [Group, Trips, Weddings, Corporativo] — nesta ordem. */
  setores: PainelSetor[]
}
