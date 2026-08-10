import { getServerClient } from '@/lib/supabase/server'
import { rpcPatrimonio } from '@/lib/patrimonio/rpc-patrimonio'
import {
  parseRpc, patrimonioAtivosSchema, patrimonioCatalogosSchema,
  patrimonioMovimentacoesSchema, patrimonioResumoSchema,
} from '@/lib/schemas-rpc'
import type {
  AtivoLista, CatalogosInventario, Movimentacao, ResumoInventario,
} from '@/components/gestao-pessoas/inventario/tipos'

// Leitura do Inventário de Ativos (v5.6.0/M3) — as quatro RPCs que a tela precisa, em uma
// ida ao banco cada, disparadas juntas.
//
// ⚠️ `Promise.allSettled`, NUNCA `.catch()` encadeado: o retorno de `.rpc()` do supabase-js é
// *thenable* (tem `.then`, NÃO tem `.catch`) — encadear compila e estoura em runtime, com
// todos os gates verdes (custou a página da DRE inteira na v5.3.0).
//
// FAIL-SAFE (invariante 14): RPC que falha degrada para vazio e a página continua viva; o
// flag `erro` é o que permite a UI dizer "não foi possível carregar" em vez de fingir base
// vazia — a distinção que o `unwrapRpc` do projeto existe para preservar.

export interface DadosInventario {
  ativos: AtivoLista[]
  movimentacoes: Movimentacao[]
  catalogos: CatalogosInventario
  resumo: ResumoInventario | null
  /** Alguma das leituras falhou (≠ base legitimamente vazia). */
  erro: boolean
}

const CATALOGOS_VAZIO: CatalogosInventario = {
  categorias: [], areas: [], detentores: [], locais: [],
}

export async function carregarInventario(): Promise<DadosInventario> {
  const db = await getServerClient()

  const [rCatalogos, rAtivos, rMovs, rResumo] = await Promise.allSettled([
    rpcPatrimonio(db, 'patrimonio_catalogos'),
    // Sem filtros de propósito: o parque de uma empresa são centenas de linhas, então a
    // lista inteira vem uma vez e a busca/filtro roda no cliente (instantânea, sem ida ao
    // banco por tecla). Os parâmetros da RPC seguem disponíveis para quem precisar paginar.
    rpcPatrimonio(db, 'patrimonio_listar_ativos'),
    rpcPatrimonio(db, 'patrimonio_listar_movimentacoes', { p_limite: 2000 }),
    rpcPatrimonio(db, 'patrimonio_resumo'),
  ])

  const catalogos = rCatalogos.status === 'fulfilled'
    ? parseRpc(patrimonioCatalogosSchema, rCatalogos.value, 'patrimonio_catalogos')
    : null
  const ativos = rAtivos.status === 'fulfilled'
    ? parseRpc(patrimonioAtivosSchema, rAtivos.value, 'patrimonio_listar_ativos')
    : null
  const movs = rMovs.status === 'fulfilled'
    ? parseRpc(patrimonioMovimentacoesSchema, rMovs.value, 'patrimonio_listar_movimentacoes')
    : null
  const resumo = rResumo.status === 'fulfilled'
    ? parseRpc(patrimonioResumoSchema, rResumo.value, 'patrimonio_resumo')
    : null

  return {
    ativos: ativos ?? [],
    movimentacoes: movs ?? [],
    catalogos: catalogos ?? CATALOGOS_VAZIO,
    resumo,
    erro: catalogos === null || ativos === null || movs === null || resumo === null,
  }
}
