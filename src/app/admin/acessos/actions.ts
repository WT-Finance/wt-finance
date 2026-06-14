'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import type {
  ResultadoAcao, ResultadoCriarUsuario, ResultadoSenha,
} from '@/components/admin/acessos/tipos'

// v4.13/v4.14 — server actions da administração de acessos. Todas finas: guard de
// permissão + RPC com o cliente DE SESSÃO (o banco revalida o admin/acessos do
// CHAMADOR — o guard da UI é conveniência, o do banco é o backstop). O cliente
// admin (service role) é usado SÓ para o Auth (criar usuário / senha / link),
// nunca para as RPCs admin_*.

type ClienteAdmin = ReturnType<typeof getAdminClient>

/** Senha provisória forte (~20 chars base64url). NUNCA persistida em claro —
 *  exibida uma vez ao admin; o Supabase guarda só o hash. */
function senhaProvisoria(): string {
  return randomBytes(15).toString('base64url')
}

/** Prefixos de erro do guard interno do banco → mensagem legível para a UI. */
const ERROS_BANCO: ReadonlyArray<readonly [string, string]> = [
  ['ANTI_LOCKOUT',        'Ação bloqueada para impedir perda de acesso do próprio administrador.'],
  ['ROLE_EM_USO',         'Há usuários com esta permissão. Reatribua-os a outra permissão antes de excluir.'],
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
 * Cria um usuário com SENHA PROVISÓRIA (v4.14): cria no Auth (e-mail já confirmado,
 * pois o admin avaliza), vincula o RBAC via cliente de sessão (o banco valida o
 * admin/acessos do chamador) e marca troca obrigatória de senha. Devolve a senha
 * provisória para o admin repassar — NÃO envia e-mail (sem dependência de SMTP).
 * E-mail já existente no Auth → reusa a conta e redefine a senha provisória.
 */
export async function criarUsuario(input: {
  email: string
  nome?: string
  roleId: number
}): Promise<ResultadoCriarUsuario> {
  await requireAreaAction('admin/acessos')

  const email = input.email.trim().toLowerCase()
  const nome = input.nome?.trim() || null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: 'E-mail inválido.' }
  if (!Number.isInteger(input.roleId) || input.roleId <= 0) {
    return { ok: false, erro: 'Selecione uma permissão válida.' }
  }

  try {
    const admin = getAdminClient()
    const senha = senhaProvisoria()

    // 1) Conta no Auth com a senha provisória (e-mail confirmado).
    let userId: string | null = null
    const criado = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true })
    if (!criado.error) {
      userId = criado.data.user?.id ?? null
    } else if (emailJaRegistrado(criado.error.message)) {
      userId = await buscarUserIdPorEmail(admin, email)
      if (userId) await admin.auth.admin.updateUserById(userId, { password: senha, email_confirm: true })
    } else {
      return { ok: false, erro: `Não foi possível criar o usuário: ${criado.error.message}` }
    }
    if (!userId) return { ok: false, erro: 'Não foi possível localizar o usuário deste e-mail no Auth.' }

    // 2) Vínculo RBAC (cliente de SESSÃO — banco valida o admin do chamador).
    const supabase = await getServerClient()
    const { error: erroRegistro } = await supabase.rpc('admin_registrar_usuario', {
      p_user_id: userId, p_email: email, p_nome: nome, p_role_id: input.roleId,
    })
    if (erroRegistro) return { ok: false, erro: traduzirErro(erroRegistro.message) }

    // 3) Força a troca da senha no 1º acesso.
    await supabase.rpc('admin_marcar_trocar_senha', { p_user_id: userId })

    return { ok: true, email, senha }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  } finally {
    revalidatePath('/admin/acessos')
  }
}

/**
 * Reseta a senha de um usuário: gera nova senha provisória, força a troca no
 * próximo acesso e devolve a senha para o admin repassar. ("Esqueci a senha".)
 */
export async function resetarSenha(userId: string): Promise<ResultadoSenha> {
  await requireAreaAction('admin/acessos')
  try {
    const senha = senhaProvisoria()
    const { error } = await getAdminClient().auth.admin.updateUserById(userId, { password: senha })
    if (error) return { ok: false, erro: comoErro(error) }
    const supabase = await getServerClient()
    const { error: e2 } = await supabase.rpc('admin_marcar_trocar_senha', { p_user_id: userId })
    if (e2) return { ok: false, erro: traduzirErro(e2.message) }
    revalidatePath('/admin/acessos')
    return { ok: true, senha }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  }
}

/**
 * Aprova uma solicitação de acesso: cria o usuário (senha provisória) e marca a
 * solicitação como aprovada. Devolve a senha provisória para repassar.
 */
export async function aprovarSolicitacao(input: {
  id: number
  email: string
  nome?: string
  roleId: number
}): Promise<ResultadoCriarUsuario> {
  await requireAreaAction('admin/acessos')
  const r = await criarUsuario({ email: input.email, nome: input.nome, roleId: input.roleId })
  if (!r.ok) return r
  try {
    const supabase = await getServerClient()
    await supabase.rpc('admin_decidir_solicitacao', { p_id: input.id, p_aprovar: true })
  } catch (err) {
    console.error('[aprovarSolicitacao] usuário criado, mas falhou ao marcar a solicitação:', err)
  }
  // Revalida apenas no caminho de sucesso (usuário criado — mesmo que marcar a
  // solicitação tenha falhado, o dado relevante mudou e o re-render é correto aqui).
  revalidatePath('/admin/acessos')
  return r
}

export async function rejeitarSolicitacao(id: number): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_decidir_solicitacao', { p_id: id, p_aprovar: false })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
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
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  }
}

export async function criarRole(input: {
  nome: string
  descricao: string
  permissoes: string[]
}): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  const nome = input.nome.trim()
  if (!nome) return { ok: false, erro: 'Informe o nome da permissão.' }
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_criar_role', {
      p_nome:       nome,
      p_descricao:  input.descricao.trim(),
      p_permissoes: input.permissoes,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
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
  if (!nome) return { ok: false, erro: 'Informe o nome da permissão.' }
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_atualizar_role', {
      p_role_id:    input.id,
      p_nome:       nome,
      p_descricao:  input.descricao.trim(),
      p_permissoes: input.permissoes,
    })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  }
}

export async function excluirRole(id: number): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { error } = await supabase.rpc('admin_excluir_role', { p_role_id: id })
    if (error) return { ok: false, erro: traduzirErro(error.message) }
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  }
}

/**
 * Exclui um usuário de vez (auth.users → CASCADE remove o vínculo RBAC).
 * Anti-lockout: ninguém exclui a si mesmo. Diferente de «desativar», é
 * irreversível — a UI confirma antes. Usa o service role (auth.admin), após o
 * guard de admin/acessos do CHAMADOR.
 */
export async function excluirUsuario(userId: string): Promise<ResultadoAcao> {
  await requireAreaAction('admin/acessos')
  try {
    const supabase = await getServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user && user.id === userId) {
      return { ok: false, erro: 'Você não pode excluir a si mesmo.' }
    }
    // Revogação ATIVA de sessão (best-effort) antes de deletar: encerra os
    // refresh tokens vivos para fechar a janela do JWT já emitido. A sessão
    // cairia de qualquer forma com a exclusão; o try/catch evita abortar por isso.
    try { await getAdminClient().auth.admin.signOut(userId) } catch { /* sessão cai com a exclusão */ }
    const { error } = await getAdminClient().auth.admin.deleteUser(userId)
    if (error) return { ok: false, erro: comoErro(error) }
    revalidatePath('/admin/acessos')
    return { ok: true }
  } catch (err) {
    return { ok: false, erro: comoErro(err) }
  }
}
