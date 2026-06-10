import { cache } from 'react'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc } from '@/lib/schemas-rpc'
import { type Area, AREA_ADMIN } from '@/lib/auth/areas'

// v4.13 (ADR-0109): sessão + permissões com UMA chamada por request (React.cache).
// Camada 2 do enforcement: requireArea (páginas), requireAreaApi (route handlers),
// requireAreaAction (server actions). O banco (ADR-0108) é o backstop.

/** get_minhas_permissoes → shape REAL da RPC (0119). */
const minhasPermissoesSchema = z.object({
  registrado: z.boolean(),
  ativo:      z.boolean(),
  permissoes: z.array(z.string()),
  user_id:    z.string().optional(),
  email:      z.string().nullable().optional(),
  nome:       z.string().nullable().optional(),
  role_id:    z.number().nullable().optional(),
  role:       z.string().nullable().optional(),
}).passthrough()

export interface Sessao {
  logado:     boolean
  registrado: boolean
  ativo:      boolean
  userId:     string | null
  email:      string | null
  nome:       string | null
  role:       string | null
  permissoes: string[]
  isAdmin:    boolean
}

const SESSAO_ANONIMA: Sessao = {
  logado: false, registrado: false, ativo: false,
  userId: null, email: null, nome: null, role: null,
  permissoes: [], isAdmin: false,
}

/** Sessão + permissões do request atual (cacheada por request). */
export const getSessao = cache(async (): Promise<Sessao> => {
  const supabase = await getServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return SESSAO_ANONIMA

  const res = await (supabase.rpc as unknown as (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>)('get_minhas_permissoes')
  const perfil = parseRpc(minhasPermissoesSchema, res as { data: unknown; error: { message: string } | null }, 'get_minhas_permissoes')

  if (!perfil) {
    // RPC falhou (drift/erro): tratar como sem permissões — nunca abrir acesso.
    return { ...SESSAO_ANONIMA, logado: true, userId: user.id, email: user.email ?? null }
  }

  const permissoes = perfil.ativo ? perfil.permissoes : []
  return {
    logado:     true,
    registrado: perfil.registrado,
    ativo:      perfil.ativo,
    userId:     user.id,
    email:      perfil.email ?? user.email ?? null,
    nome:       perfil.nome ?? null,
    role:       perfil.role ?? null,
    permissoes,
    isAdmin:    permissoes.includes(AREA_ADMIN),
  }
})

function temAlguma(sessao: Sessao, areas: Area[] | null): boolean {
  if (!sessao.logado || !sessao.ativo) return false
  if (areas === null) return true
  return areas.some(a => sessao.permissoes.includes(a))
}

/**
 * Guard de PÁGINA: exige login ativo + (se informado) alguma das áreas.
 * Sem sessão → /login; sem permissão/inativo → /sem-acesso.
 */
export async function requireArea(areas: Area[] | Area | null): Promise<Sessao> {
  const sessao = await getSessao()
  if (!sessao.logado) redirect('/login')
  const lista = areas === null ? null : Array.isArray(areas) ? areas : [areas]
  if (!temAlguma(sessao, lista)) redirect('/sem-acesso')
  return sessao
}

/**
 * Guard de ROUTE HANDLER: retorna Response (401/403) quando negado, ou a sessão.
 * Uso: `const s = await requireAreaApi(areas); if (s instanceof Response) return s`
 */
export async function requireAreaApi(areas: Area[] | Area | null): Promise<Sessao | Response> {
  const sessao = await getSessao()
  if (!sessao.logado) {
    return Response.json({ error: 'AUTH_NECESSARIA' }, { status: 401 })
  }
  const lista = areas === null ? null : Array.isArray(areas) ? areas : [areas]
  if (!temAlguma(sessao, lista)) {
    return Response.json({ error: 'PERMISSAO_NEGADA' }, { status: 403 })
  }
  return sessao
}

/** Guard de SERVER ACTION: lança quando negado (a action devolve erro à UI). */
export async function requireAreaAction(areas: Area[] | Area | null): Promise<Sessao> {
  const sessao = await getSessao()
  if (!sessao.logado) throw new Error('AUTH_NECESSARIA')
  const lista = areas === null ? null : Array.isArray(areas) ? areas : [areas]
  if (!temAlguma(sessao, lista)) throw new Error('PERMISSAO_NEGADA')
  return sessao
}
