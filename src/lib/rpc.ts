import type { PostgrestError } from '@supabase/supabase-js'

// Resultado mínimo de uma chamada RPC do supabase-js.
export interface RpcLike { data: unknown; error: PostgrestError | { message: string } | null }

/**
 * Desembrulha o retorno de uma RPC distinguindo ERRO de VAZIO (F5, v4.12).
 *
 * O padrão antigo `res.error ? null : res.data` engolia o erro: uma falha (timeout,
 * permissão, RPC quebrada) virava "sem dados", indistinguível de um período
 * legitimamente vazio. Aqui o erro é SEMPRE logado com contexto (observabilidade)
 * e sinalizado via `out.erro` — a UI pode mostrar um estado de erro discreto em
 * vez de fingir vazio. `data` continua tipado para os consumidores existentes.
 */
export function unwrapRpc<T>(res: RpcLike, contexto: string): T | null {
  if (res.error) {
    console.error(`[RPC ${contexto}] ${res.error.message ?? 'erro desconhecido'}`)
    return null
  }
  return (res.data ?? null) as T | null
}

/**
 * Versão que devolve também a flag de erro, para a página decidir entre
 * "Não foi possível carregar" (erro) e "Sem dados no período" (vazio legítimo).
 */
export function unwrapRpcComErro<T>(res: RpcLike, contexto: string): { data: T | null; erro: boolean } {
  if (res.error) {
    console.error(`[RPC ${contexto}] ${res.error.message ?? 'erro desconhecido'}`)
    return { data: null, erro: true }
  }
  return { data: (res.data ?? null) as T | null, erro: false }
}
