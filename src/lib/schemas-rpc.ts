import { z, type ZodType } from 'zod'
import type { RpcLike } from './rpc'

// Validação de SHAPE das respostas de RPCs críticas (F7, v4.12). Complementa o
// unwrapRpc (F5): além de logar erro de RPC, valida o formato do retorno com Zod
// e loga drift (RPC mudou e o tipo não) — falha degrada para null (não quebra a
// tela; alimenta o mesmo "estado de erro" do F5). RPCs novas devem nascer tipadas.
//
// SEMENTE: get_mix_produto (um dos "números da diretoria"). A expansão às demais
// RPCs críticas (get_executiva_kpis, get_tendencia_margem, ranking range,
// vendas_em_aberto, receita_negativa, operacoes, carteira) segue o mesmo padrão —
// incremental, registrado no out-briefing da v4.12.

export function parseRpc<T>(schema: ZodType<T>, res: RpcLike, contexto: string): T | null {
  if (res.error) {
    console.error(`[RPC ${contexto}] ${res.error.message ?? 'erro desconhecido'}`)
    return null
  }
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) {
    console.error(`[RPC ${contexto}] shape inesperado (contrato divergiu?): ${parsed.error.message}`)
    return null
  }
  return parsed.data
}

// ── Schemas das RPCs críticas ────────────────────────────────────────────────

const mixProdutoItem = z.object({
  produto_nome:    z.string(),
  faturamento:     z.number(),
  receita:         z.number(),
  margem_pct:      z.number().nullable(),
  pct_faturamento: z.number(),
})

/** get_mix_produto → { produtos[], outros } */
export const mixProdutoSchema = z.object({
  produtos: z.array(mixProdutoItem),
  outros:   mixProdutoItem.extend({ quantidade_produtos: z.number() }),
})
