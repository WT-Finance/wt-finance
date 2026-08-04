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
//
// v5.4.4 — `salvarMetasSubsetor` é a IRMÃ desta action para o quadro de subsetores de
// Weddings (metas_subsetor_upsert, migration 0230). `traduzirErro` é COMPARTILHADO
// pelas duas (os códigos de erro do banco não colidem entre as duas RPCs — ver os
// `RAISE EXCEPTION` de 0175/0230).

export interface MetaCelula {
  setorMacroId: number
  ano: number
  mes: number
  valorMeta: number
  pctReceita: number | null
}

/** Uma LINHA (subsetor, ano, mes) do quadro de subsetores — sempre o valor CORRENTE dos
 *  3 campos, mesmo o que não mudou: `metas_subsetor_upsert` faz UPDATE dos três a cada
 *  chamada (não faz COALESCE com o que já está gravado), então enviar só o campo tocado
 *  apagaria os outros dois. `metaContratos` só existe para subsetor === 'COMERCIAL' (a
 *  RPC recusa valor não-nulo nos demais — METAS_CONTRATOS_SO_COMERCIAL). */
export interface MetaSubsetorCelula {
  subsetor: string
  ano: number
  mes: number
  valorMeta: number
  metaContratos: number | null
  pctReceita: number | null
}

function traduzirErro(msg: string): string {
  if (msg.includes('METAS_SETOR_INVALIDO'))    return 'Setor inválido.'
  if (msg.includes('METAS_SUBSETOR_INVALIDO')) return 'Subsetor inválido.'
  if (msg.includes('METAS_MES_INVALIDO'))      return 'Mês inválido.'
  if (msg.includes('METAS_VALOR_INVALIDO'))    return 'Meta de faturamento inválida (não pode ser negativa).'
  if (msg.includes('METAS_CONTRATOS_SO_COMERCIAL')) return 'Meta de contratos só se aplica ao subsetor Comercial.'
  if (msg.includes('METAS_CONTRATOS_INVALIDO'))     return 'Meta de contratos inválida (não pode ser negativa).'
  if (msg.includes('METAS_PCT_INVALIDO'))      return '% Rec inválido (deve ficar entre 0 e 100).'
  if (msg.includes('METAS_WEDDINGS_DERIVADO')) return 'A meta de Weddings é somada a partir das metas de subsetor — edite pelo quadro "Metas por subsetor de Weddings".'
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

/**
 * Salva em LOTE as linhas pendentes do quadro "Metas por subsetor de Weddings"
 * (v5.4.4) — irmã de `salvarMetas`, mesmo formato de retorno. `celulas` já vem
 * FILTRADA pelo call-site (`cadastro-grade-subsetor.tsx`) só com as LINHAS
 * (subsetor,ano,mes) que o usuário tocou — nunca as 12×5 inteiras: é esse filtro que
 * preserva o gatilho da rampa de Weddings no Acompanhamento ("mês com ao menos uma
 * linha de subsetor" — ver `aplicarRampaWeddings`). Gravar zero linhas não-tocadas
 * zeraria a meta de Weddings (e a do Group) de uma vez.
 */
export async function salvarMetasSubsetor(
  celulas: MetaSubsetorCelula[],
): Promise<{ ok: true; gravadas: number } | { ok: false; erro: string }> {
  await requireAreaAction('metas')
  if (celulas.length === 0) return { ok: true, gravadas: 0 }

  const db = await getServerClient()
  const { data, error } = await rpcMetas(db, 'metas_subsetor_upsert', {
    p_metas: celulas.map(c => ({
      subsetor:       c.subsetor,
      ano:            c.ano,
      mes:            c.mes,
      valor_meta:     c.valorMeta,
      meta_contratos: c.metaContratos,
      pct_receita:    c.pctReceita,
    })),
  })
  if (error) return { ok: false, erro: traduzirErro(error.message) }

  revalidatePath('/metas/cadastro')
  revalidatePath('/metas') // o Acompanhamento reflete a rampa de Weddings (soma dos subsetores)
  const gravadas = (data as { gravadas?: number } | null)?.gravadas ?? celulas.length
  return { ok: true, gravadas }
}
