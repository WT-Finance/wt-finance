'use server'

import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { revalidatePath } from 'next/cache'

// Escrita do Cadastro de Metas (v5.0.0) — autosave por linha (setor×mês). Exige a
// área forte 'metas' (edição). Chama metas_upsert, que grava a trilha em
// meta_setor_historico e valida (RAISE 'METAS_*: ...'). Retorno {ok}|{ok:false,erro}
// — a UI reverte a célula em erro. fonte='real' é garantida dentro da RPC.

export interface MetaCelula {
  setorMacroId: number
  ano: number
  mes: number
  valorMeta: number
  pctReceita: number | null
}

function traduzirErro(msg: string): string {
  if (msg.includes('METAS_SETOR_INVALIDO')) return 'Setor inválido.'
  if (msg.includes('METAS_MES_INVALIDO'))   return 'Mês inválido.'
  if (msg.includes('METAS_VALOR_INVALIDO')) return 'Meta VT inválida (não pode ser negativa).'
  if (msg.includes('METAS_PCT_INVALIDO'))   return '% Rec inválido (deve ficar entre 0 e 100).'
  if (msg.includes('PERMISSAO_NEGADA') || msg.includes('AUTH')) return 'Sem permissão para editar metas.'
  return 'Falha ao salvar a meta. Tente novamente.'
}

export async function salvarMeta(cel: MetaCelula): Promise<{ ok: true } | { ok: false; erro: string }> {
  await requireAreaAction('metas')
  const db = await getServerClient()
  const { error } = await rpcMetas(db, 'metas_upsert', {
    p_metas: [{
      setor_macro_id: cel.setorMacroId,
      ano:  cel.ano,
      mes:  cel.mes,
      valor_meta:  cel.valorMeta,
      pct_receita: cel.pctReceita,
    }],
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }
  revalidatePath('/metas/cadastro')
  revalidatePath('/metas') // o Acompanhamento reflete as metas cadastradas
  return { ok: true }
}
