// Tipos da página "Financeiro · Geral" (v6.4.0) — só o que atravessa servidor → cliente. Os tipos
// de cada RPC saem dos schemas (`schemas.ts`); aqui a casca que a página monta.

import type {
  Antecipacoes, CustosFinanceiros, Prazos, Prejuizos, Recebiveis,
} from './schemas'

/** Resultado de uma leitura que pode falhar sem derrubar a página (inv. 8: a seção degrada, a
 *  página fica de pé). Espelha o `allSettled` por item feito em `page.tsx`. */
export type Carregado<T> = { ok: true; dados: T } | { ok: false }

/** Uma leitura de FLUXO (a RPC é por ano) — cada ano falha sozinho. */
export interface LeituraAno<T> {
  ano: number
  leitura: Carregado<T>
}

/** O que a página recebe do servidor. Arrays (não Map/Set): atravessam a fronteira RSC → client. */
export interface DadosGeral {
  /** Anos selecionados (ao menos 1), CRESCENTE. */
  anos: number[]
  /** Anos com pill, crescente. */
  anosDisponiveis: number[]
  /** Hoje em São Paulo ('YYYY-MM-DD'), calculado NO SERVIDOR (o cliente não usa relógio próprio). */
  hoje: string
  /** Estoque: ignora as pills de ano. */
  recebiveis: Carregado<Recebiveis>
  /** Janela móvel de 12 meses (sem `p_ano`): também não muda com as pills. */
  prazos: Carregado<Prazos>
  /** Fluxo: uma leitura por ano selecionado, na MESMA ordem de `anos`. */
  antecipacoes: LeituraAno<Antecipacoes>[]
  prejuizos: LeituraAno<Prejuizos>[]
  custos: LeituraAno<CustosFinanceiros>[]
  /** Tem 'financeiro/geral/gestao'? Só então o botão "Registrar antecipação" existe. */
  podeGerir: boolean
}
