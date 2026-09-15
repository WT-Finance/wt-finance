'use server'

import { revalidatePath } from 'next/cache'
import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcEstante } from '@/lib/estante/rpc-estante'
import { parseRpc, estanteFichaSchema } from '@/lib/schemas-rpc'
import type {
  LivroLista, MovimentacaoEstante, TipoMovimentacaoEstante,
} from '@/components/gestao-pessoas/estante/tipos'

// Escrita da Estante Welcome (v5.11.0/M3-M4). DOIS níveis: catálogo exige
// 'gestao-pessoas/estante/gestao'; movimentação, a área de uso.
//
// Nenhuma regra de negócio vive aqui. As RPCs da 0272 são a barreira (já emprestado, não
// emprestado, arquivado, devolução alheia) e estas actions só traduzem o erro delas para
// uma frase que o usuário entende. Duplicar a validação no TS criaria uma segunda verdade
// que envelhece — a do banco é a que vale.

const ROTA = '/gestao-pessoas/estante'
const USO = ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'] as const
const GESTAO = 'gestao-pessoas/estante/gestao' as const

export type Resultado =
  | { ok: true; id: number; mensagem?: string }
  | { ok: false; erro: string }

export interface LivroEntrada {
  titulo: string
  autor: string | null
  editora: string | null
  ano: number | null
  isbn: string | null
  obs: string | null
}

export interface MovimentacaoEntrada {
  livro_id: number
  tipo: TipoMovimentacaoEstante
  data_movimentacao: string | null
  obs: string | null
}

/**
 * Erro da RPC → frase para o usuário. Os prefixos são o contrato combinado com a 0272; o
 * `else` genérico existe porque mensagem crua de Postgres na tela não ajuda ninguém.
 *
 * O caminho genérico é LOGADO no servidor de propósito: sem isso, um erro que ninguém
 * previu viraria "tente novamente" na tela e NADA no log.
 */
function traduzirErro(msg: string): string {
  if (msg.includes('TITULO_OBRIGATORIO'))    return 'Informe o título do livro.'
  if (msg.includes('ANO_INVALIDO'))          return 'Ano fora do intervalo aceito — confira o número.'
  if (msg.includes('LIVRO_NAO_ENCONTRADO'))  return 'Este livro não existe mais. Recarregue a página.'
  if (msg.includes('LIVRO_ARQUIVADO'))       return 'Este livro foi arquivado e não aceita movimentação.'
  if (msg.includes('JA_EMPRESTADO'))         return 'Este livro já está com outra pessoa.'
  if (msg.includes('NAO_EMPRESTADO'))        return 'Este livro já está na estante.'
  if (msg.includes('DEVOLUCAO_DE_OUTRO'))    return 'Este livro está com outra pessoa — só quem administra a estante devolve por ela.'
  if (msg.includes('EMPRESTIMO_PARA_OUTRO')) return 'Só quem administra a estante registra empréstimo em nome de outra pessoa.'
  if (msg.includes('USUARIO_DESCONHECIDO'))  return 'Pessoa sem cadastro ativo no Janus.'
  if (msg.includes('USUARIO_OBRIGATORIO'))   return 'Não foi possível identificar de quem é a movimentação. Recarregue a página.'
  if (msg.includes('DATA_INVALIDA'))         return 'Data fora do intervalo aceito — confira o ano.'
  if (msg.includes('DATA_FUTURA'))           return 'A data não pode ser futura.'
  if (msg.includes('TIPO_INVALIDO'))         return 'Tipo de movimentação inválido.'
  if (msg.includes('TIPO_NAO_SUPORTADO'))    return 'Tipo de movimentação não suportado.'
  if (msg.includes('USUARIO_INATIVO'))       return 'Seu acesso foi desativado. Recarregue a página.'
  if (msg.includes('PERMISSAO_NEGADA') || msg.includes('AUTH'))
    return 'Sem permissão para esta ação na Estante.'
  console.error('[estante] erro não previsto da RPC:', msg)
  return 'Não foi possível concluir. Tente novamente.'
}

function idDe(data: unknown): number | null {
  const v = (data as { id?: unknown } | null)?.id
  return typeof v === 'number' ? v : null
}

export async function criarLivro(entrada: LivroEntrada): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { data, error } = await rpcEstante(db, 'estante_criar_livro', {
    p_titulo: entrada.titulo, p_autor: entrada.autor, p_editora: entrada.editora,
    p_ano: entrada.ano, p_isbn: entrada.isbn, p_obs: entrada.obs,
  })
  // ⚠️ O SDK do Supabase NÃO lança: o erro vem no campo `error`. Checar só o try/catch
  // deixaria a falha passar como sucesso (lição da v5.9.1).
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const id = idDe(data)
  if (id === null) return { ok: false, erro: 'Não foi possível cadastrar o livro.' }
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function atualizarLivro(id: number, entrada: LivroEntrada): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { error } = await rpcEstante(db, 'estante_atualizar_livro', {
    p_id: id, p_titulo: entrada.titulo, p_autor: entrada.autor, p_editora: entrada.editora,
    p_ano: entrada.ano, p_isbn: entrada.isbn, p_obs: entrada.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  revalidatePath(ROTA)
  return { ok: true, id }
}

export async function removerLivro(id: number): Promise<Resultado> {
  await requireAreaAction(GESTAO)
  const db = await getServerClient()
  const { data, error } = await rpcEstante(db, 'estante_remover_livro', { p_id: id })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const acao = (data as { acao?: unknown } | null)?.acao
  // Mapeamento EXPLÍCITO dos três valores possíveis, sem `else` genérico: foi um `else`
  // fail-open desse tipo que o revisor-db reprovou no lado SQL (achado A2). Um `acao` que
  // este código não reconhece cai no `default` e FALHA de forma visível em vez de arriscar
  // uma frase errada (foi exatamente essa mentira — 'arquivado' para um no-op — que o B7
  // pegou quando a RPC ainda não distinguia 'arquivado' de 'ja_arquivado').
  let mensagem: string
  switch (acao) {
    case 'apagado':
      mensagem = 'Livro excluído: nunca foi emprestado, então saiu de vez.'
      break
    case 'arquivado':
      mensagem = 'Livro arquivado: ele já teve empréstimo, e o histórico continua registrado.'
      break
    case 'ja_arquivado':
      mensagem = 'Este livro já estava arquivado — nada para fazer.'
      break
    default:
      console.error('[estante] estante_remover_livro: acao desconhecida da RPC:', acao)
      return { ok: false, erro: 'Não foi possível confirmar o resultado da exclusão. Recarregue a página.' }
  }
  revalidatePath(ROTA)
  return { ok: true, id, mensagem }
}

export interface Ficha {
  livro: LivroLista
  movimentacoes: MovimentacaoEstante[]
}

/**
 * Ficha + razão do exemplar numa ÚNICA leitura (invariante 10 do briefing). O drawer
 * NÃO reaproveita a lista já carregada: entre o render da página e a abertura do drawer
 * alguém pode ter pegado o livro, e mostrar razão defasado numa tela cujo propósito é
 * dizer "quem está com isto" seria o pior lugar para estar desatualizado.
 */
export async function carregarFicha(id: number): Promise<Ficha | null> {
  await requireAreaAction([...USO])
  const db = await getServerClient()
  const r = await rpcEstante(db, 'estante_detalhe_livro', { p_id: id })
  if (r.error) {
    console.error('[estante] estante_detalhe_livro:', r.error.message)
    return null
  }
  return parseRpc(estanteFichaSchema, r, 'estante_detalhe_livro')
}

export async function registrarMovimentacao(entrada: MovimentacaoEntrada): Promise<Resultado> {
  await requireAreaAction([...USO])
  const db = await getServerClient()
  // `p_usuario_id` fica de fora: a RPC deriva do JWT. Só a gestão pode informar outra
  // pessoa, e essa porta não é aberta pela UI desta versão.
  const { data, error } = await rpcEstante(db, 'estante_registrar_movimentacao', {
    p_livro_id: entrada.livro_id,
    p_tipo: entrada.tipo,
    p_data_movimentacao: entrada.data_movimentacao,
    p_obs: entrada.obs,
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  const id = idDe(data)
  if (id === null) return { ok: false, erro: 'Não foi possível registrar a movimentação.' }
  revalidatePath(ROTA)
  return { ok: true, id }
}
