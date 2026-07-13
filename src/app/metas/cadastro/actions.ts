'use server'

import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { revalidatePath } from 'next/cache'

// Escrita do Cadastro de Metas (v5.0.0) — SALVAR EM LOTE (edição local + salvar).
// Exige a área forte 'metas'. Uma chamada metas_upsert com TODAS as células
// pendentes; o histórico continua POR CÉLULA no banco (metas_upsert grava um
// registro por linha alterada). Retorno {ok}|{ok:false,erro} — a UI mantém as
// pendências marcadas em caso de erro (nada se perde). fonte='real' na RPC.

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
  if (msg.includes('METAS_VALOR_INVALIDO')) return 'Meta de faturamento inválida (não pode ser negativa).'
  if (msg.includes('METAS_PCT_INVALIDO'))   return '% Rec inválido (deve ficar entre 0 e 100).'
  if (msg.includes('PERMISSAO_NEGADA') || msg.includes('AUTH')) return 'Sem permissão para editar metas.'
  return 'Falha ao salvar as metas. Tente novamente.'
}

export async function salvarMetas(
  celulas: MetaCelula[],
): Promise<{ ok: true; gravadas: number } | { ok: false; erro: string }> {
  await requireAreaAction('metas')
  if (celulas.length === 0) return { ok: true, gravadas: 0 }

  const db = await getServerClient()
  const { data, error } = await rpcMetas(db, 'metas_upsert', {
    p_metas: celulas.map(c => ({
      setor_macro_id: c.setorMacroId,
      ano:  c.ano,
      mes:  c.mes,
      valor_meta:  c.valorMeta,
      pct_receita: c.pctReceita,
    })),
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  revalidatePath('/metas/cadastro')
  revalidatePath('/metas') // o Acompanhamento reflete as metas cadastradas
  const gravadas = (data as { gravadas?: number } | null)?.gravadas ?? celulas.length
  return { ok: true, gravadas }
}
