'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import type { ResultadoAcao, ResultadoConvite } from '@/components/admin/acessos/tipos'

// v4.13 — server actions da administração de acessos. Todas finas: guard de
// permissão + RPC com o cliente DE SESSÃO (o banco revalida o admin/acessos do
// CHAMADOR — o guard da UI é conveniência, o do banco é o backstop). O cliente
// admin (service role) é usado SÓ para o Auth (convite / criação de usuário /
// geração de link), nunca para as RPCs admin_*.

type ClienteAdmin = ReturnType<typeof getAdminClient>

/** Prefixos de erro do guard interno do banco → mensagem legível para a UI. */
const ERROS_BANCO: ReadonlyArray<readonly [string, string]> = [
  ['ANTI_LOCKOUT',        'Ação bloqueada para impedir perda de acesso do próprio administrador.'],
  ['ROLE_EM_USO',         'Há usuários com esta role. Reatribua-os a outra role antes de excluir.'],
  ['AREAS_INVALIDAS',     'Uma ou mais permissões selecionadas são inválidas. Recarregue a página e tente de novo.'],
  ['USUARIO_INEXISTENTE', 'Usuário não encontrado. Recarregue a página e tente de novo.'],
  ['PERMISSAO_NEGADA',    'Você não tem permissão para administrar usuários e acessos.'],
]

function traduzirErro(mensagem: string): string {
  for (const [prefixo, texto] of ERROS_BANCO) {
    if (mensagem.includes(prefixo)) return texto
  }
  return mensagem
}

function comoErro(err: unknown): string {
  return err instanceof Error ? traduzirErro(err.message) : String(err)
}

/** Origem pública do request (atrás do proxy da Vercel). */
async function origemRequest(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? ''
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}

function emailJaRegistrado(mensagem: string): boolean {
  const m = mensagem.toLowerCase()
  return m.includes('already been registered') || m.includes('already registered') || m.includes('email_exists')
}

/**
 * GoTrue não filtra `listUsers` por e-mail — pagina e procura localmente.
 * Base interna pequena; 10 páginas × 200 cobrem com folga.
 */
async function buscarUserIdPorEmail(admin: ClienteAdmin, email: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const achado = data.users.find(u => (u.email ?? '').toLowerCase() === email)
    if (achado) return achado.id
    if (data.users.length < 200) return null
  }
  return null
}

/**
 * Convida um usuário: cria no Auth (convite por e-mail; fallback sem e-mail),
 * registra o vínculo via RPC com o cliente de sessão e gera um link de convite
 * copiável (fallback: ok sem link). E-mail já existente → só re-registra + link.
 */
export async function convidarUsuario(input: {
  email: string
  nome?: string
  roleId: number
}): Promise<ResultadoConvite> {
  await requireAreaAction('admin/acessos')

  const email = input.email.trim().toLowerCase()
  const nome = input.nome?.trim() || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'E-mail inválido.' }
  if (!Number.isInteger(input.roleId) || input.roleId <= 0) {
    return { ok: false, erro: 'Selecione uma role válida.' }
  }

  try {
    const origin = await origemRequest()
    const admin = getAdminClient()

    // 1) Usuário no Auth — convite por e-mail; se o envio falhar (rate limit /
    //    SMTP), cria sem e-mail; se já existir, apenas localiza o id.
    let userId: string | null = null
    const convite = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/auth/confirm`,
    })
    if (!convite.error) {
      userId = convite.data.user?.id ?? null
    } else if (emailJaRegistrado(convite.error.message)) {
      userId = await buscarUserIdPorEmail(admin, email)
    } else {
      const criado = await admin.auth.admin.createUser({ email, email_confirm: true })
      if (!criado.error) {
        userId = criado.data.user?.id ?? null
      } else if (emailJaRegistrado(criado.error.message)) {
        userId = await buscarUserIdPorEmail(admin, email)
      } else {
        return { ok: false, erro: `Não foi possível criar o usuário: ${criado.error.message}` }
      }
    }
    if (!userId) {
      return { ok: false, erro: 'Não foi possível localizar o usuário deste e-mail no Auth.' }
    }

    // 2) Vínculo via cliente DE SESSÃO — o banco valida o admin/acessos do chamador.
    const supabase = await getServerClient()
    const { error: erroRegistro } = await supabase.rpc('admin_registrar_usuario', {
      p_user_id: userId,
      p_email:   email,
      p_nome:    nome,
      p_role_id: input.roleId,
    })
    if (erroRegistro) return { ok: false, erro: traduzirErro(erroRegistro.message) }

    // 3) Link de convite copiável (fallback: ok sem link).
    let linkConvite: string | null = null
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    if (!link.error && link.data.properties?.hashed_token) {
      linkConvite = `${origin}/auth/confirm?token_hash=${link.data.properties.hashed_token}&type=magiclink`
    }

    return { ok: true, linkConvite }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

export async function atribuirRole(userId: string, roleId: number): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_atribuir_role', {
      p_user_id: userId,
      p_role_id: roleId,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

export async function definirAtivo(userId: string, ativo: boolean): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_definir_usuario_ativo', {
      p_user_id: userId,
      p_ativo:   ativo,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    // Revogação ATIVA ao desativar (defesa em profundidade — achado S11): além de
    // negar por request (o guard do banco checa `ativo` em toda chamada), encerra
    // as sessões/refresh tokens vivos do usuário para fechar a janela do JWT já
    // emitido. Best-effort: a desativação já vale mesmo se o signOut falhar.
    if (!ativo) {
      try { await getAdminClient().auth.admin.signOut(userId) } catch { /* já negado por request */ }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

export async function criarRole(input: {
  nome: string
  descricao: string
  permissoes: string[]
}): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  const nome = input.nome.trim()
  if (!nome) return { ok: false, erro: 'Informe o nome da role.' }
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_criar_role', {
      p_nome:       nome,
      p_descricao:  input.descricao.trim(),
      p_permissoes: input.permissoes,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

export async function atualizarRole(input: {
  id: number
  nome: string
  descricao: string
  permissoes: string[]
}): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  const nome = input.nome.trim()
  if (!nome) return { ok: false, erro: 'Informe o nome da role.' }
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_atualizar_role', {
      p_role_id:    input.id,
      p_nome:       nome,
      p_descricao:  input.descricao.trim(),
      p_permissoes: input.permissoes,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

export async function excluirRole(id: number): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_excluir_role', { p_role_id: id })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}
