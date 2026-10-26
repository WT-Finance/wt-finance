// Tipos da página "Financeiro · Geral" (v6.4.0) — só o que atravessa servidor → cliente. Os tipos
// de cada RPC saem dos schemas (`schemas.ts`); aqui a casca que a página monta.

import type { Antecipacoes, Prejuizos, Recebiveis } from './schemas'

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
  /** Fluxo: uma leitura por ano selecionado, na MESMA ordem de `anos`. */
  antecipacoes: LeituraAno<Antecipacoes>[]
  prejuizos: LeituraAno<Prejuizos>[]
  /** As leituras do ANO CORRENTE, carregadas SEMPRE (v6.5.0), mesmo com a pill desmarcada: a faixa do topo
   *  (prejuízo do ano corrente, dias sem antecipação) e o card "Dias sem antecipação" não dependem das pills.
   *  Se o ano corrente está selecionado, é a MESMA leitura da lista (uma chamada só). */
  corrente: {
    prejuizos: LeituraAno<Prejuizos>
    antecipacoes: LeituraAno<Antecipacoes>
  }
  /** Tem 'financeiro/geral/gestao'? Só então o botão "Registrar antecipação" existe. */
  podeGerir: boolean
}
