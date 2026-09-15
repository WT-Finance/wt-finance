// Tipos da Estante Welcome (v5.11.0). Espelham o jsonb das RPCs `estante_*` (0272);
// a validação de shape é dos schemas Zod em @/lib/schemas-rpc.

export type TipoMovimentacaoEstante = 'emprestimo' | 'devolucao'

/** Uma linha do acervo, com o estado DERIVADO da última movimentação. */
export interface LivroLista {
  id: number
  titulo: string
  autor: string | null
  editora: string | null
  ano: number | null
  isbn: string | null
  obs: string | null
  arquivado: boolean
  emprestado: boolean
  /** Só preenchidos quando `emprestado`. */
  portador_id: string | null
  portador_nome: string | null
  desde: string | null
  /** Já teve movimentação ⇒ excluir vai ARQUIVAR, não apagar. */
  tem_historico: boolean
}

/** Uma linha do razão. `livro_titulo` só vem do razão global — daí opcional. */
export interface MovimentacaoEstante {
  id: number
  livro_id: number
  livro_titulo?: string
  tipo: TipoMovimentacaoEstante
  usuario_id: string
  usuario_nome: string | null
  data_movimentacao: string
  obs: string | null
  criado_em: string
}
