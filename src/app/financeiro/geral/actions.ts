'use server'

import { revalidatePath } from 'next/cache'
import { requireAreaAction } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc } from '@/lib/schemas-rpc'
import { AREA_GESTAO, dataIsoValida, traduzirErroAntecipacao } from '@/lib/financeiro-geral/gestao'
import {
  antecipacaoHistoricoSchema, antecipacaoListarSchema, desfazerAntecipacaoSchema, salvarAntecipacaoSchema,
  type EntradaHistorico, type ListaAntecipacoes,
} from '@/lib/financeiro-geral/schemas'

// Registro de antecipações (v6.4.0, migration 0296). Escrita e leitura da GESTÃO exigem
// 'financeiro/geral/gestao' — a camada 2 do enforcement (a RPC repete o `exigir_acesso` por dentro: o
// banco é o backstop). Nenhuma regra de negócio vive aqui: o CHECK de valores, a conta da lista curada,
// a data não futura e o diário são do banco; estas actions só traduzem o erro da RPC para uma frase.
//
// ⚠️ O retorno de `.rpc()` é thenable (sem `.catch`) e o SDK do Supabase NÃO lança: o erro vem no campo
// `error` — checar só try/catch deixaria a falha passar como sucesso (v5.9.1). E "sem erro" não é
// "confirmado": o retorno das RPCs que devolvem json é LIDO pelo schema (v6.2.1).
//
// As RPCs novas são tipadas pelo `database.ts` GERADO (regenerado depois da 0296/0297): nenhum helper
// frouxo aqui (skill `contrato-rpc-front` §1).

const ROTA = '/financeiro/geral'

export type ResultadoAcao =
  | { ok: true; mensagem: string }
  | { ok: false; erro: string }

export type ResultadoLeitura<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string }

export interface EntradaSalvar {
  /** `null` cria; um id atualiza. */
  id: number | null
  contaId: number
  /** 'YYYY-MM-DD' */
  data: string
  /** Reais (já normalizados no formulário por `validarFormulario`). */
  valorAntecipado: number
  valorLiquido: number
}

/** Mensagem da RPC → frase. A desconhecida é LOGADA no servidor: sem isso, um erro que ninguém previu
 *  viraria "tente novamente" na tela e NADA no log. */
function frase(rpc: string, msg: string): string {
  const t = traduzirErroAntecipacao(msg)
  if (!t.conhecido) console.error(`[financeiro-geral] ${rpc}: erro não previsto da RPC:`, msg)
  return t.texto
}

const inteiroPositivo = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0

export async function listarAntecipacoes(): Promise<ResultadoLeitura<ListaAntecipacoes>> {
  await requireAreaAction(AREA_GESTAO)
  const db = await getServerClient()
  const res = await db.rpc('antecipacao_listar')
  if (res.error) return { ok: false, erro: frase('antecipacao_listar', res.error.message) }
  const dados = parseRpc(antecipacaoListarSchema, res, 'antecipacao_listar')
  if (!dados) return { ok: false, erro: 'Não foi possível ler os registros. Recarregue a página.' }
  return { ok: true, dados }
}

export async function historicoAntecipacoes(limite = 20): Promise<ResultadoLeitura<EntradaHistorico[]>> {
  await requireAreaAction(AREA_GESTAO)
  // A RPC aceita 1..200; fora disso o valor é preso, não repassado.
  const p_limite = Math.min(200, Math.max(1, Number.isInteger(limite) ? limite : 20))
  const db = await getServerClient()
  const res = await db.rpc('antecipacao_historico', { p_limite })
  if (res.error) return { ok: false, erro: frase('antecipacao_historico', res.error.message) }
  const dados = parseRpc(antecipacaoHistoricoSchema, res, 'antecipacao_historico')
  if (!dados) return { ok: false, erro: 'Não foi possível ler o histórico. Recarregue a página.' }
  return { ok: true, dados }
}

export async function salvarAntecipacao(e: EntradaSalvar): Promise<ResultadoAcao> {
  await requireAreaAction(AREA_GESTAO)
  // Server action é chamável por qualquer cliente: confere a FORMA antes de ir ao banco (a regra de
  // negócio continua sendo a do banco).
  if (!(e.id === null || inteiroPositivo(e.id)) || !inteiroPositivo(e.contaId)
    || typeof e.data !== 'string' || !dataIsoValida(e.data)
    || typeof e.valorAntecipado !== 'number' || !Number.isFinite(e.valorAntecipado)
    || typeof e.valorLiquido !== 'number' || !Number.isFinite(e.valorLiquido)) {
    return { ok: false, erro: 'Dados inválidos — confira o formulário.' }
  }
  const db = await getServerClient()
  const res = await db.rpc('antecipacao_salvar', {
    // O tipo gerado não modela NULL em argumento (`p_id: number`), mas o PostgREST aceita o null JSON —
    // e é ele que diz à RPC "criar". Cast só neste campo.
    p_id: e.id as unknown as number,
    p_conta_id: e.contaId,
    p_data: e.data,
    p_valor_antecipado: e.valorAntecipado,
    p_valor_liquido: e.valorLiquido,
  })
  if (res.error) return { ok: false, erro: frase('antecipacao_salvar', res.error.message) }
  const r = parseRpc(salvarAntecipacaoSchema, res, 'antecipacao_salvar')
  if (!r || !r.ok) return { ok: false, erro: 'Não foi possível confirmar o registro. Confira a lista antes de tentar de novo.' }
  revalidatePath(ROTA)
  if (r.criada) return { ok: true, mensagem: 'Antecipação registrada.' }
  return { ok: true, mensagem: r.alterada ? 'Antecipação atualizada.' : 'Nada mudou — o registro já estava assim.' }
}

export async function excluirAntecipacao(id: number): Promise<ResultadoAcao> {
  await requireAreaAction(AREA_GESTAO)
  if (!inteiroPositivo(id)) return { ok: false, erro: 'Registro inválido.' }
  const db = await getServerClient()
  const res = await db.rpc('antecipacao_excluir', { p_id: id })
  if (res.error) return { ok: false, erro: frase('antecipacao_excluir', res.error.message) }
  revalidatePath(ROTA)
  return { ok: true, mensagem: 'Antecipação excluída. Dá para desfazer pelo histórico.' }
}

export async function desfazerAntecipacao(diarioId: number): Promise<ResultadoAcao> {
  await requireAreaAction(AREA_GESTAO)
  if (!inteiroPositivo(diarioId)) return { ok: false, erro: 'Entrada do histórico inválida.' }
  const db = await getServerClient()
  const res = await db.rpc('antecipacao_desfazer', { p_diario_id: diarioId })
  if (res.error) return { ok: false, erro: frase('antecipacao_desfazer', res.error.message) }
  const r = parseRpc(desfazerAntecipacaoSchema, res, 'antecipacao_desfazer')
  if (!r) return { ok: false, erro: 'Não foi possível confirmar o desfazer. Confira a lista antes de tentar de novo.' }
  // `revertidos = 0` ⇒ nada a desfazer (já estava como antes).
  if (r.revertidos === 0) return { ok: true, mensagem: 'Nada a desfazer — essa alteração já não está valendo.' }
  revalidatePath(ROTA)
  return { ok: true, mensagem: 'Alteração desfeita.' }
}
