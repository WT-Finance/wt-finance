'use server'

import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { requireAreaAction } from '@/lib/auth/sessao'
import type { CampoDef } from '@/lib/solicitacoes/schemas'

// Admin de tipos de solicitação — área 'solicitacoes'. Banco revalida o acesso.

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
async function rpcSessao(fn: string, args: Record<string, unknown>) {
  const sb = await getServerClient()
  return (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
}

export async function salvarTipo(input: { id: number | null; nome: string; campos: CampoDef[] }): Promise<{ ok: true; id: number } | { ok: false; erro: string }> {
  await requireAreaAction('solicitacoes')
  const { data, error } = await rpcSessao('admin_solic_salvar_tipo', {
    p_id: input.id, p_nome: input.nome,
    p_campos: input.campos.map(c => ({
      rotulo: c.rotulo, tipo_campo: c.tipo_campo, obrigatorio: c.obrigatorio,
      opcoes: c.tipo_campo === 'selecao' ? (c.opcoes ?? []) : null,
    })),
  })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/admin/solicitacoes')
  return { ok: true, id: (data as { id: number }).id }
}

export async function arquivarTipo(id: number, arquivar: boolean): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('solicitacoes')
  const { error } = await rpcSessao('admin_solic_arquivar_tipo', { p_id: id, p_arquivar: arquivar })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/admin/solicitacoes'); return { ok: true }
}

export async function excluirTipo(id: number): Promise<{ ok: boolean; erro?: string }> {
  await requireAreaAction('solicitacoes')
  const { error } = await rpcSessao('admin_solic_excluir_tipo', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/admin/solicitacoes'); return { ok: true }
}

function traduzir(msg: string): string {
  const m: Record<string, string> = {
    NOME_OBRIGATORIO: 'Informe o nome do tipo.',
    ROTULO_OBRIGATORIO: 'Todo campo precisa de um rótulo.',
    OPCOES_OBRIGATORIAS: 'Campo de seleção precisa de ao menos uma opção.',
    TIPO_CAMPO_INVALIDO: 'Tipo de campo inválido.',
    TIPO_EM_USO: 'Este tipo tem solicitações vinculadas — arquive-o em vez de excluir.',
    TIPO_INEXISTENTE: 'Tipo não encontrado.',
    PERMISSAO_NEGADA: 'Você não tem permissão para administrar tipos.',
  }
  return m[msg.split(':')[0]?.trim()] ?? msg.replace(/^[A-Z_]+:\s*/, '')
}
