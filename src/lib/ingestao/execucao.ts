import 'server-only'

// Camada de LOG de EXECUÇÃO dos processos agendados (v6.0.0/M6 — anexo
// `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md` §3). Envelopa as duas RPCs
// `SECURITY DEFINER`/service_role-only da migration 0280 (`ingestao_execucao_abrir`/`_concluir`)
// — mesmo molde de `log.ts` (a camada equivalente para `ingestao.carga`).
//
// ⚠️ INVARIANTE DURO (contrato §1 da delegação): as rotas do Monde/CDI que chamam esta camada
// são CAMINHO VIVO de produção (o incremental roda a cada 15 min). O registro de execução NUNCA
// pode derrubar, atrasar de forma perceptível, nem mudar a resposta dessas rotas — por isso
// as duas funções aqui NUNCA lançam: falha de RPC vira `console.error` e um retorno degradado
// (`null`/nenhuma ação), e quem chama segue o fluxo normal como se o log não existisse.

import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

// `database.ts` regenerado (0280 aplicada) tipa as RPCs desta camada — chamada DIRETA, tipada,
// sem o helper frouxo `BoundRpc`/`.bind()` que `log.ts` usa para as RPCs pré-0280 (padrão
// atualizado por pedido do orquestrador nesta mesma missão). `.rpc(...)` chamado direto no
// objeto (nunca destacado numa variável) preserva o `this` por construção — é a atribuição
// solta que perde o `this` (lição v5.3.5), não a ausência do cast.

/** As QUATRO linhas do CHECK `ingestao_execucao_processo_valido` (migration 0280). */
export const PROCESSOS_AGENDADOS = [
  'monde-incremental', 'monde-reconciliacao', 'cdi-mensal', 'ingestao-vigia',
] as const
export type ProcessoAgendado = (typeof PROCESSOS_AGENDADOS)[number]

export type StatusExecucao = 'ok' | 'pulado' | 'erro'

/**
 * Abre uma execução (`ingestao_execucao_abrir`) e devolve o `id` para a chamada de conclusão —
 * `null` em qualquer falha (RPC ou exceção), NUNCA lança. `null` propaga para
 * `concluirExecucao`, que vira no-op nesse caso: perder o registro de UMA execução é aceitável
 * (é camada adicional); interromper a ingestão para registrá-la não é.
 */
export async function abrirExecucao(processo: ProcessoAgendado): Promise<string | null> {
  try {
    const { data, error } = await getAdminClient().rpc('ingestao_execucao_abrir', { p_processo: processo })
    if (error) {
      console.error(`[ingestao/execucao] ingestao_execucao_abrir(${processo}) falhou (a execução real segue normalmente):`, error.message)
      return null
    }
    if (typeof data !== 'string') {
      console.error(`[ingestao/execucao] ingestao_execucao_abrir(${processo}) devolveu formato inesperado.`, data)
      return null
    }
    return data
  } catch (err) {
    console.error(`[ingestao/execucao] ingestao_execucao_abrir(${processo}) lançou (a execução real segue normalmente):`, err)
    return null
  }
}

/**
 * Grava o resultado final de uma execução (`ingestao_execucao_concluir`). NO-OP silencioso se
 * `id` for `null` (a abertura já falhou ou foi pulada por desenho) — nada a concluir. Nunca
 * lança: falha aqui vira `console.error`, nunca propaga para quem chamou.
 */
export async function concluirExecucao(
  id: string | null,
  status: StatusExecucao,
  resultado?: unknown,
  erro?: string | null,
): Promise<void> {
  if (id === null) return
  try {
    const { error } = await getAdminClient().rpc('ingestao_execucao_concluir', {
      // `p_erro` é `string` OPCIONAL no tipo gerado (sem `| null`) — `undefined` (chave OMITIDA
      // do corpo) é o valor certo para "sem erro", não `null` (que não tipa e, de qualquer
      // forma, produz o MESMO `DEFAULT NULL` no banco).
      p_id: id, p_status: status, p_resultado: (resultado ?? null) as Json, p_erro: erro ?? undefined,
    })
    if (error) {
      console.error(`[ingestao/execucao] ingestao_execucao_concluir(${id}, ${status}) falhou:`, error.message)
    }
  } catch (err) {
    console.error(`[ingestao/execucao] ingestao_execucao_concluir(${id}, ${status}) lançou:`, err)
  }
}
