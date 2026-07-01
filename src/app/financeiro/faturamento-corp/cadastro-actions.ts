'use server'

// Faturamento Corporativo — Fase 3 (v4.33.0). Server Actions do CADASTRO de clientes
// corporativos (aba "Cadastro de Clientes"). CRUD + import, gated financeiro/faturamento-corp,
// via getServerClient (sessão → as RPCs exigem exigir_acesso no banco: defesa em profundidade).
// O cadastro é REFERÊNCIA (Visão A) — só guarda os dados; a Emissão NÃO consome isto ainda.

import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import type { ClienteCorpRaw } from '@/lib/faturamento/parse-clientes-corp'

/* eslint-disable @typescript-eslint/no-explicit-any */ // RPCs fora dos tipos gerados (padrão do projeto)

async function rpc(fn: string, args?: Record<string, unknown>) {
  const db = await getServerClient()
  return (db.rpc as any)(fn, args) as Promise<{ data: any; error: { message: string } | null }>
}

function revalidar() { revalidatePath('/financeiro/faturamento-corp') }

/** Campos de negócio do cadastro (o que o form/import enviam). */
export type ClienteCorpInput = ClienteCorpRaw

export interface ResultadoImportClientes {
  ok: boolean
  inseridos: number
  colisoesManual: string[]      // nomes que já existem como MANUAL (não sobrescritos)
  duplicadasPlanilha: string[]  // nomes repetidos DENTRO da própria planilha
  erro?: string
}

export async function importarClientesCorp(linhas: ClienteCorpInput[]): Promise<ResultadoImportClientes> {
  await requireAreaAction('financeiro/faturamento-corp')
  try {
    const { data, error } = await rpc('importar_clientes_corp', { p_linhas: linhas })
    if (error) return { ok: false, inseridos: 0, colisoesManual: [], duplicadasPlanilha: [], erro: error.message }
    revalidar()
    return {
      ok: true,
      inseridos: Number(data?.inseridos ?? 0),
      colisoesManual: Array.isArray(data?.colisoes_manual) ? data.colisoes_manual : [],
      duplicadasPlanilha: Array.isArray(data?.duplicadas_planilha) ? data.duplicadas_planilha : [],
    }
  } catch (e) {
    return { ok: false, inseridos: 0, colisoesManual: [], duplicadasPlanilha: [], erro: e instanceof Error ? e.message : 'Erro ao importar' }
  }
}

export async function inserirClienteCorp(dados: ClienteCorpInput): Promise<{ ok: boolean; id?: number; motivo?: string }> {
  await requireAreaAction('financeiro/faturamento-corp')
  try {
    const { data, error } = await rpc('inserir_cliente_corp', { p_dados: dados })
    if (error) return { ok: false, motivo: error.message }
    if (!data?.ok) return { ok: false, motivo: data?.motivo ?? 'erro' }
    revalidar()
    return { ok: true, id: Number(data.id) }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Erro ao inserir' }
  }
}

const CAMPOS_PERMITIDOS = ['empresa','situacao','faturar_em','vencimento','obs','pct_juros','pct_multa','destinatarios','forma_pgto','contato_whats']

export async function atualizarClienteCorp(id: number, campo: string, valor: string): Promise<{ ok: boolean; motivo?: string }> {
  await requireAreaAction('financeiro/faturamento-corp')
  if (!CAMPOS_PERMITIDOS.includes(campo)) return { ok: false, motivo: 'campo_invalido' }
  try {
    const { data, error } = await rpc('atualizar_cliente_corp', { p_id: id, p_campo: campo, p_valor: valor })
    if (error) return { ok: false, motivo: error.message }
    if (!data?.ok) return { ok: false, motivo: data?.motivo ?? 'erro' }
    revalidar()
    return { ok: true }
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : 'Erro ao atualizar' }
  }
}

export async function excluirClienteCorp(id: number): Promise<{ ok: boolean }> {
  await requireAreaAction('financeiro/faturamento-corp')
  try {
    const { error } = await rpc('excluir_cliente_corp', { p_id: id })
    if (error) return { ok: false }
    revalidar()
    return { ok: true }
  } catch { return { ok: false } }
}

export async function apagarClientesCorp(ids: number[]): Promise<{ ok: boolean; removidos: number }> {
  await requireAreaAction('financeiro/faturamento-corp')
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, removidos: 0 }
  try {
    const { data, error } = await rpc('apagar_clientes_corp', { p_ids: ids })
    if (error) return { ok: false, removidos: 0 }
    revalidar()
    return { ok: true, removidos: Number(data?.removidos ?? 0) }
  } catch { return { ok: false, removidos: 0 } }
}
