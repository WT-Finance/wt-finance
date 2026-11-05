// Tipos da página "Financeiro · Geral" (v6.4.0) — só o que atravessa servidor → cliente. Os tipos
// de cada RPC saem dos schemas (`schemas.ts`); aqui a casca que a página monta.

import type { Antecipacoes, Prejuizos, Recebiveis } from './schemas'

/** Resultado de uma leitura que pode falhar sem derrubar a página (inv. 11: a seção degrada, a
 *  página fica de pé). Espelha o `allSettled` por item feito em `page.tsx`. */
export type Carregado<T> = { ok: true; dados: T } | { ok: false }

/** Uma leitura de FLUXO (a RPC é por ano) — cada ano falha sozinho. */
export interface LeituraAno<T> {
  ano: number
  leitura: Carregado<T>
}

/** O que a página recebe do servidor. Arrays (não Map/Set): atravessam a fronteira RSC → client. */
export interface DadosGeral {
  /** Anos selecionados em "Perdas e prejuízos" (`?prejuizos=`; ao menos 1), CRESCENTE. */
  anosPrejuizos: number[]
  /** Os anos FIXOS de "Antecipações" (sem pills, sem URL): o corrente e os dois anteriores, CRESCENTE. */
  anosAntecipacoes: number[]
  /** Anos com pill em "Perdas e prejuízos", crescente. */
  anosDisponiveis: number[]
  /** Hoje em São Paulo ('YYYY-MM-DD'), calculado NO SERVIDOR (o cliente não usa relógio próprio). */
  hoje: string
  /** Estoque: ignora as pills de ano. */
  recebiveis: Carregado<Recebiveis>
  /** Fluxo: uma leitura por ano (`antecipacoes` ↔ `anosAntecipacoes`, `prejuizos` ↔ `anosPrejuizos`), na MESMA
   *  ordem. `prejuizos` serve só ao "Prejuízo por Pessoa" (e ao futuro "Prejuízo por Setor"): os anos das pills. */
  antecipacoes: LeituraAno<Antecipacoes>[]
  prejuizos: LeituraAno<Prejuizos>[]
  /** Os anos FIXOS do gráfico "Prejuízo Mensal" (o corrente e os dois anteriores, crescente), independentes das
   *  pills. Vêm da MESMA leitura de `prejuizos` quando o ano está nos dois conjuntos (cada ano é lido uma vez). */
  prejuizosMensal: LeituraAno<Prejuizos>[]
  /** As leituras do ANO CORRENTE, carregadas SEMPRE (v6.5.0), mesmo com a pill de Prejuízos desmarcada: a faixa
   *  do topo (prejuízo do ano corrente, dias sem antecipação) e o card "Dias sem antecipação" não dependem das
   *  pills. É a MESMA leitura das listas (uma chamada só; o corrente está sempre nos anos fixos). */
  corrente: {
    prejuizos: LeituraAno<Prejuizos>
    antecipacoes: LeituraAno<Antecipacoes>
  }
  /** O recorde de SEMPRE de dias sem antecipação (`maiorIntervaloHistorico` sobre todos os anos desde o primeiro).
   *  `null` = algum ano falhou ou nunca houve intervalo: a linha não aparece. */
  intervaloRecorde: { dias: number; de: string; ate: string } | null
  /** Tem 'financeiro/geral/gestao'? Só então o botão "Registrar antecipação" existe. */
  podeGerir: boolean
}
