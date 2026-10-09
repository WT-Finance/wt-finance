// Das leituras por ano às FATIAS que os cards somam (v6.3.0) — módulo PURO.
//
// A página lê `resumo` e `fornecedores` de cada ano selecionado, e cada leitura pode falhar sozinha
// (`Carregado`). Quem SOMA anos (total do período, tabela por categoria, ranking) NÃO pode somar
// só os que carregaram: o total sairia menor, sob o mesmo rótulo, numa página cuja razão de ser é
// bater ao centavo com a DRE. Por isso estas funções devolvem as fatias que carregaram E os anos
// que falharam — o card que soma mostra o erro nomeando o ano; o gráfico (barras por ano) desenha
// os anos que chegaram e avisa dos ausentes.

import type { FatiaAno } from './agregacao'
import { recortePadrao } from './periodo'
import type { LeituraAno, LinhaMesCategoria, LinhaMesFornecedor } from './tipos'

export interface FatiasCarregadas<L> {
  /** Os anos que carregaram, na ordem recebida (crescente), cada um com o recorte do seu ano. */
  fatias: FatiaAno<L>[]
  /** Os anos cuja leitura falhou. Vazio = tudo carregou e o total é completo. */
  anosFalha: number[]
}

export function fatiasDeResumo(porAno: readonly LeituraAno[], hoje: string): FatiasCarregadas<LinhaMesCategoria> {
  const fatias: FatiaAno<LinhaMesCategoria>[] = []
  const anosFalha: number[] = []
  for (const l of porAno) {
    if (l.resumo.ok) {
      fatias.push({ ano: l.ano, recorte: recortePadrao(l.ano, hoje), linhas: l.resumo.dados.porMesCategoria })
    } else {
      anosFalha.push(l.ano)
    }
  }
  return { fatias, anosFalha }
}

export function fatiasDeFornecedores(porAno: readonly LeituraAno[], hoje: string): FatiasCarregadas<LinhaMesFornecedor> {
  const fatias: FatiaAno<LinhaMesFornecedor>[] = []
  const anosFalha: number[] = []
  for (const l of porAno) {
    if (l.fornecedores.ok) {
      fatias.push({ ano: l.ano, recorte: recortePadrao(l.ano, hoje), linhas: l.fornecedores.dados.porMesFornecedor })
    } else {
      anosFalha.push(l.ano)
    }
  }
  return { fatias, anosFalha }
}

/** Carimbo da última carga da base. É GLOBAL (a RPC não filtra por ano): vale o do resumo mais
 *  recente que carregou; `null` se nenhum carregou. */
export function ultimaCargaDe(porAno: readonly LeituraAno[]): string | null {
  for (let i = porAno.length - 1; i >= 0; i--) {
    const r = porAno[i].resumo
    if (r.ok) return r.dados.ultimaCarga
  }
  return null
}
