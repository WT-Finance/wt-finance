// Tipos e helpers PUROS da importação Gerencial.
// Sem dependências de @e965/xlsx nem de Supabase — seguro para importar
// tanto de Client Components quanto de Server (API Route / Server Actions).
// O parsing de Excel vive em parser.ts (só consumido pela API Route, runtime Node).

export interface LancamentoPlanilha {
  tipo:           'A pagar' | 'A receber'
  pessoa:         string
  valor_final:    number
  descricao:      string | null
  conta_previsao: string | null
  vencimento:     string  // YYYY-MM-DD
}

export interface ImportDiff {
  aAdicionar: LancamentoPlanilha[]
  aRemover:   Array<{ id: number; tipo: string; pessoa: string; valor_final: number; vencimento: string }>
  aManter:    number
  aAtualizar: Array<{ id: number; atual: Record<string, unknown>; novo: LancamentoPlanilha; camposDivergentes: string[] }>
}

export interface ImportResumo {
  adicionados: number
  removidos:   number
  atualizados: number
}

// Chave de duplicata para mesclagem inteligente
export function chaveDuplicata(l: {
  tipo: string; pessoa: string; valor_final: number; vencimento: string
}): string {
  return `${l.tipo}|${l.pessoa.toLowerCase().trim()}|${Number(l.valor_final).toFixed(2)}|${l.vencimento}`
}
