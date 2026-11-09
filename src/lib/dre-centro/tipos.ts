import type { DreLinha } from '@/lib/dre/schemas'
import type { CentroId } from './centros'

// ── Contrato da DRE de caixa por centro (v6.5.1) ─────────────────────────────
//
// O que o front recebe de `get_dre_caixa_centro` (0306) por ano, depois de `paraDreCentroAno`
// (`schemas.ts`). A DIVISÃO DE TRABALHO:
//   · o BANCO entrega o que depende do dado bruto — a árvore operacional de cada centro (já
//     com o deslocamento dos recebíveis antecipados e sem a taxa de antecipação) e os
//     recebíveis identificados por antecipação;
//   · o FRONT faz a atribuição (§3.4), que é aritmética sobre agregados e precisa ser testada
//     contra o protótipo — módulo puro `atribuicao.ts`.

/** Um recebível antecipado identificado, já agregado por dono × mês da antecipação × mês do
 *  vencimento original. `mesVencimento` > 12 = vence depois do ano (o D só vem depois). */
export interface RecebivelAntecipado {
  dono: CentroId
  mesAntecipacao: number
  mesVencimento: number
  /** Positivo (Receita de Vendas deslocada). */
  valor: number
}

/** Uma antecipação do registro do Janus (`financeiro.antecipacao`) e o que a regra da §3.3
 *  achou para ela. Alimenta as notas de cobertura. */
export interface EventoAntecipacao {
  /** 'AAAA-MM-DD' — date puro. */
  data: string
  conta: string
  /** Valor antecipado no registro (positivo). */
  valor: number
  /** Quanto a regra identificou nos recebimentos da conta (≤ `valor`). */
  identificado: number
  /** Quantos recebíveis a regra usou (opcional: a fixture do mockup não conta). */
  nRecebiveis?: number
  /** Taxa do registro (negativa) e a lançada no Monde na mesma data (negativa; 0 = pendente). */
  taxaRegistro: number
  taxaMonde: number
  /** Por que não identificou tudo, quando é o caso (texto curto para a nota). */
  motivo?: string
}

export interface DreCentroAno {
  ano: number
  hoje: string
  relacao: 'fechado' | 'corrente' | 'futuro'
  mes_corrente: number | null
  /** Árvore operacional por centro — MESMAS linhas, na MESMA ordem, da visão Empresa (o mapa
   *  vivo), com o REX como último totalizador. */
  arvores: Record<CentroId, DreLinha[]>
  recebiveis: RecebivelAntecipado[]
  /** Taxa de antecipação lançada no Monde, por mês, no centro em que foi lançada (negativa). */
  taxaMonde: Record<CentroId, number[]>
  eventos: EventoAntecipacao[]
  /** Cobertura do centro no ano: valor movimentado (Σ |valor|) total e sem centro. */
  cobertura: { valorMovimentado: number; semCentro: number }
}
