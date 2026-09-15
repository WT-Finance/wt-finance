import { getServerClient } from '@/lib/supabase/server'
import { rpcEstante } from '@/lib/estante/rpc-estante'
import { parseRpc, estanteLivrosSchema, estanteMovimentacoesSchema } from '@/lib/schemas-rpc'
import type { LivroLista, MovimentacaoEstante } from '@/components/gestao-pessoas/estante/tipos'

// Leitura da Estante Welcome (v5.11.0/M3): duas RPCs, uma ida ao banco cada, disparadas juntas.
//
// ⚠️ `Promise.allSettled`, NUNCA `.catch()` encadeado: o retorno de `.rpc()` do supabase-js é
// *thenable* (tem `.then`, NÃO tem `.catch`) — encadear compila e estoura em runtime, com
// todos os gates verdes (custou a página da DRE inteira na v5.3.0).
//
// FAIL-SAFE (invariante 12): RPC que falha degrada para vazio e a página continua viva; o flag
// `erro` é o que permite a UI dizer "não foi possível carregar" em vez de fingir estante vazia.

export interface DadosEstante {
  livros: LivroLista[]
  movimentacoes: MovimentacaoEstante[]
  /** Alguma das leituras falhou (≠ estante legitimamente vazia). */
  erro: boolean
}

export async function carregarEstante(): Promise<DadosEstante> {
  const db = await getServerClient()

  const [rLivros, rMovs] = await Promise.allSettled([
    // Sem filtros de propósito: uma estante de escritório são dezenas de linhas, então o
    // acervo inteiro vem uma vez e busca/filtro rodam no cliente (instantâneos). Os
    // parâmetros da RPC seguem disponíveis para quem precisar paginar.
    rpcEstante(db, 'estante_listar_livros'),
    rpcEstante(db, 'estante_listar_movimentacoes', { p_limite: 2000 }),
  ])

  const livros = rLivros.status === 'fulfilled'
    ? parseRpc(estanteLivrosSchema, rLivros.value, 'estante_listar_livros')
    : null
  const movs = rMovs.status === 'fulfilled'
    ? parseRpc(estanteMovimentacoesSchema, rMovs.value, 'estante_listar_movimentacoes')
    : null

  return {
    livros: livros ?? [],
    movimentacoes: movs ?? [],
    erro: livros === null || movs === null,
  }
}
