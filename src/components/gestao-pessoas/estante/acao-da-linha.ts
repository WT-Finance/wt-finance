import type { LivroLista } from './tipos'

export type AcaoLinha = 'pegar' | 'devolver' | null

/**
 * Qual botão a linha oferece. Espelha as travas da RPC `estante_registrar_movimentacao`
 * (0272): `JA_EMPRESTADO` e `DEVOLUCAO_DE_OUTRO`. A tela não DECIDE nada — o banco continua
 * sendo a barreira; ela só evita oferecer o que será recusado.
 */
export function acaoDaLinha(
  livro: LivroLista,
  meuId: string | null,
  podeGerir: boolean,
): AcaoLinha {
  if (livro.arquivado) return null
  if (!livro.emprestado) return 'pegar'
  if (podeGerir) return 'devolver'
  return meuId !== null && livro.portador_id === meuId ? 'devolver' : null
}
