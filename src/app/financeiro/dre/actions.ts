'use server'

// Server Action do RATEIO DO CSC na DRE por centro (v6.5.1, 0308). Mesmo padrão das actions da estrutura
// (./estrutura/actions.ts): requireAreaAction (guard de superfície; o banco checa app.exigir_acesso de novo
// dentro da RPC) + getServerClient (sessão, NÃO service role) + rpcDre. Quem vê a DRE pode editar o rateio
// (decisão do Yan). A RPC SUBSTITUI o conjunto inteiro: o drawer sempre manda tudo.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import { rpcDre } from '@/lib/dre/rpc-dre'
import { parseRpc } from '@/lib/schemas-rpc'
import type { ItemRateio } from '@/lib/dre-centro/rateio'

const pct = z.number().min(0).max(100)
const itensSchema = z.array(z.object({
  categoria_id: z.number().int().positive().optional(),
  bloco_chave: z.string().min(1).max(200).optional(),
  pct_trips: pct,
  pct_weddings: pct,
  pct_corp: pct,
}).strict().refine(i => (i.categoria_id == null) !== (i.bloco_chave == null), 'um alvo por linha')).max(2000)

const resultadoSchema = z.object({ salvos: z.number() }).passthrough()

/** As mensagens da RPC já são para o usuário ("Rateio: …"); qualquer outra vira genérica. */
function traduzir(msg: string): string {
  const m = /Rateio: [^\n]+/.exec(msg)
  if (m) return m[0]
  if (msg.includes('PERMISSAO_NEGADA')) return 'Você não tem permissão para alterar o rateio.'
  return 'Não foi possível salvar o rateio. Tente novamente.'
}

export async function salvarRateioCsc(itens: ItemRateio[]): Promise<{ ok: boolean; salvos?: number; erro?: string }> {
  await requireAreaAction('financeiro/dre')
  const valido = itensSchema.safeParse(itens)
  if (!valido.success) return { ok: false, erro: 'Rateio inválido — confira os percentuais e tente de novo.' }
  try {
    const db = await getServerClient()
    const res = await rpcDre(db, 'salvar_dre_rateio_csc', { p_itens: valido.data })
    if (res.error) return { ok: false, erro: traduzir(res.error.message) }
    const parsed = parseRpc(resultadoSchema, res, 'salvar_dre_rateio_csc')
    if (!parsed) return { ok: false, erro: 'Não foi possível confirmar o salvamento — recarregue a página.' }
    revalidatePath('/financeiro/dre')
    return { ok: true, salvos: parsed.salvos }
  } catch (e) {
    console.error('[rateio CSC] salvar', e)
    return { ok: false, erro: 'Não foi possível salvar o rateio. Tente novamente.' }
  }
}
