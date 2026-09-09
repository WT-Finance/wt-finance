// v5.9.3 (M7) — ordenação da Base de Dados do Fluxo de Caixa Gerencial, extraída de
// `base-dados-tab.tsx` para módulo puro testável (mesmo molde de
// `src/lib/weddings/ordenacao-operacoes.ts`).
import { canonizarConta } from './normalizar-conta'

export type ColOrd = 'tipo' | 'pessoa' | 'valor' | 'descricao' | 'conta' | 'vencimento' | 'originador'
export type DirOrd = 'asc' | 'desc'

/** Tipo mínimo de linha que o comparador precisa — subconjunto de `Lancamento`
 *  (`lancamento-row.tsx`), para o módulo não depender de componente. */
export interface LinhaOrdenavel {
  tipo:            string
  pessoa:          string
  valor_final:     number
  descricao:       string | null
  conta_previsao:  string | null
  vencimento:      string
  originador_nome: string | null
}

// Direção padrão ao TROCAR de coluna: texto começa em asc (A→Z); número em desc (maior
// valor primeiro); Vencimento, do mais antigo ao mais novo (decisão do Yan, v5.9.3).
export const DIR_PADRAO_COL: Record<ColOrd, DirOrd> = {
  tipo: 'asc', pessoa: 'asc', valor: 'desc', descricao: 'asc', conta: 'asc', vencimento: 'asc', originador: 'asc',
}

function compararTexto(a: string, b: string): number {
  return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
}

/** Texto NULÁVEL — vazio/nulo sempre no FIM, em qualquer direção (convenção já usada em
 *  `ranking-caixa.tsx` para colunas que podem faltar dado). */
function compararTextoNulo(a: string | null, b: string | null, dir: DirOrd): number {
  const va = a?.trim() || null
  const vb = b?.trim() || null
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  return dir === 'asc' ? compararTexto(va, vb) : compararTexto(vb, va)
}

/** Comparador por coluna. `conta` usa a MESMA `canonizarConta` do filtro de Conta — senão
 *  a ordenação discordaria de "por qual conta esta linha está agrupada no filtro"
 *  (ex.: "Banco Itau" da planilha precisa ordenar junto de "Itaú", não separado). */
export function comparadorLancamentos(col: ColOrd, dir: DirOrd, contasReais: string[]) {
  return (a: LinhaOrdenavel, b: LinhaOrdenavel): number => {
    switch (col) {
      case 'tipo':       return dir === 'asc' ? compararTexto(a.tipo, b.tipo) : compararTexto(b.tipo, a.tipo)
      case 'pessoa':     return dir === 'asc' ? compararTexto(a.pessoa, b.pessoa) : compararTexto(b.pessoa, a.pessoa)
      case 'valor':      return dir === 'asc' ? a.valor_final - b.valor_final : b.valor_final - a.valor_final
      // vencimento é date puro 'AAAA-MM-DD' (sem fuso) — comparação lexicográfica de
      // string ordena igual a uma comparação de data (mesmo raciocínio de `fmtVencBr`).
      case 'vencimento': return dir === 'asc' ? a.vencimento.localeCompare(b.vencimento) : b.vencimento.localeCompare(a.vencimento)
      case 'descricao':  return compararTextoNulo(a.descricao, b.descricao, dir)
      case 'originador': return compararTextoNulo(a.originador_nome, b.originador_nome, dir)
      case 'conta': {
        const ca = canonizarConta(a.conta_previsao, contasReais)
        const cb = canonizarConta(b.conta_previsao, contasReais)
        return dir === 'asc' ? compararTexto(ca, cb) : compararTexto(cb, ca)
      }
    }
  }
}
