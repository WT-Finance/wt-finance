'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getServerClient } from '@/lib/supabase/server'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { gerarSegredo, hashSegredo } from '@/lib/api-externa/segredo'
import { listarLogApi } from '@/lib/api-externa/rpc'
import type { ResultadoAcao, ResultadoCriarChave, LogChamada } from '@/components/admin/chaves-api/tipos'

// v5.4.0/M2 — server actions de Chaves de API. Guard de superfície
// (requireAreaAction('solicitacoes')) + RPC com o cliente DE SESSÃO — o banco
// revalida a área do CHAMADOR (exigir_acesso, 0211); o guard da UI é
// conveniência, o do banco é o backstop (mesmo padrão de admin/acessos).
// O cliente ADMIN (service role) é usado só para o Auth (criar/remover o
// usuário-robô), nunca para as RPCs api_*.

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function rpcSessao(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  const sb = await getServerClient()
  return (sb.rpc as unknown as BoundRpc).bind(sb)(fn, args)
}

/** Prefixos de erro do guard interno do banco (PREFIXO:detalhe) → mensagem legível. */
const ERROS_BANCO: ReadonlyArray<readonly [string, string]> = [
  ['PLATAFORMA_OBRIGATORIA', 'Informe o nome da plataforma.'],
  ['PLATAFORMA_EM_USO',      'Já existe uma chave registrada para esta plataforma.'],
  ['EMAIL_OBRIGATORIO',      'Não foi possível determinar o e-mail do usuário-robô.'],
  ['EMAIL_EM_USO',           'Já existe um usuário com este e-mail — tente outro nome de plataforma.'],
  ['SEGREDO_OBRIGATORIO',    'Falha ao gerar o segredo — tente novamente.'],
  ['TIPO_INVALIDO',          'Um dos tipos selecionados na whitelist não existe mais. Recarregue a página.'],
  ['NAO_ENCONTRADA',         'Chave não encontrada.'],
  ['JA_REVOGADA',            'Esta chave já está revogada.'],
  ['CHAVE_REVOGADA',         'Uma chave revogada não pode ser editada — crie uma chave nova.'],
  ['PERMISSAO_NEGADA',       'Você não tem permissão para gerenciar chaves de API.'],
  ['AUTH_NECESSARIA',        'Sessão necessária.'],
]

function traduzir(mensagem: string): string {
  for (const [prefixo, texto] of ERROS_BANCO) {
    if (mensagem.includes(prefixo)) return texto
  }
  return mensagem.replace(/^[A-Z_]+:\s*/, '')
}

/** Slug ASCII kebab-case a partir do nome da plataforma (compõe o e-mail do robô).
 *  NFD decompõe acento em base+marca combinante; o replace remove tudo que não é
 *  ASCII (0x00-0x7F) — inclui as marcas combinantes, sem depender de um range
 *  Unicode literal na regex (mais simples de auditar/editar). */
function slugPlataforma(nome: string): string {
  const semAcentos = nome.normalize('NFD').replace(/[^\x00-\x7F]/g, '')
  const slug = semAcentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'integracao'
}

/** Senha do usuário-robô: NUNCA usada para login de verdade — o robô nasce com
 *  ativo=false em app.rbac_usuarios (api_robo_registrar) e por isso jamais
 *  passa em app.exigir_acesso. Só existe para satisfazer o requisito do Auth. */
function senhaRoboAleatoria(): string {
  return randomBytes(24).toString('base64url')
}

export async function criarChaveApi(input: {
  plataforma:      string
  callbackUrl:     string
  callbackSegredo: string | null
  whitelist:       number[]
}): Promise<ResultadoCriarChave> {
  await requireAreaAction('solicitacoes')
  const plataforma = input.plataforma.trim()
  if (!plataforma) return { ok: false, erro: 'Informe o nome da plataforma.' }

  const admin = getAdminClient()
  const email = `integracao-${slugPlataforma(plataforma)}@janus.internal`

  // 1) Usuário-robô no Auth — a conta em si nunca é usada para logar (ver nota
  //    de ativo=false no passo 2). email_confirm evita a jornada de confirmação.
  const criado = await admin.auth.admin.createUser({
    email, password: senhaRoboAleatoria(), email_confirm: true,
  })
  if (criado.error || !criado.data.user) {
    return { ok: false, erro: `Não foi possível criar o usuário-robô: ${criado.error?.message ?? 'erro desconhecido'}` }
  }
  const userId = criado.data.user.id

  // 2) Vínculo RBAC do robô (cliente de SESSÃO — o banco valida a área do
  //    CHAMADOR). ativo=false: o robô nunca passa em exigir_acesso.
  const { error: erroRobo } = await rpcSessao('api_robo_registrar', {
    p_user_id: userId, p_email: email, p_nome: `Integração ${plataforma}`,
  })
  if (erroRobo) {
    // Best-effort: remove o robô órfão do Auth (CASCADE também limparia o
    // rbac_usuarios, mas aqui o INSERT do passo 2 nem chegou a acontecer).
    try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
    return { ok: false, erro: traduzir(erroRobo.message) }
  }

  // 3) A chave em si — só o HASH do segredo é persistido; o segredo em claro é
  //    devolvido UMA VEZ para a UI mostrar (nunca mais recuperável depois disso).
  const segredo = gerarSegredo()
  const { error: erroChave } = await rpcSessao('api_chave_registrar', {
    p_plataforma:       plataforma,
    p_segredo_hash:     hashSegredo(segredo),
    p_callback_url:     input.callbackUrl.trim() || null,
    p_callback_segredo: input.callbackSegredo,
    p_whitelist:        input.whitelist,
    p_robo_user_id:     userId,
  })
  if (erroChave) {
    // Best-effort: se a chave falhar DEPOIS do robô criado, remove o robô órfão
    // (o CASCADE de app.rbac_usuarios.user_id → auth.users(id) limpa o RBAC junto).
    try { await admin.auth.admin.deleteUser(userId) } catch { /* best-effort */ }
    return { ok: false, erro: traduzir(erroChave.message) }
  }

  revalidatePath('/admin/chaves-api')
  return { ok: true, segredo, plataforma }
}

export async function revogarChaveApi(id: number): Promise<ResultadoAcao> {
  await requireAreaAction('solicitacoes')
  const { error } = await rpcSessao('api_chave_revogar', { p_id: id })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/admin/chaves-api')
  return { ok: true }
}

export async function atualizarChaveApi(input: {
  id:              number
  callbackUrl:     string
  callbackSegredo: string | null
  whitelist:       number[]
}): Promise<ResultadoAcao> {
  await requireAreaAction('solicitacoes')
  const { error } = await rpcSessao('api_chave_atualizar', {
    p_id:               input.id,
    p_callback_url:     input.callbackUrl.trim() || null,
    p_callback_segredo: input.callbackSegredo,
    p_whitelist:        input.whitelist,
  })
  if (error) return { ok: false, erro: traduzir(error.message) }
  revalidatePath('/admin/chaves-api')
  return { ok: true }
}

/** Gera um segredo novo para o campo "Callback — segredo de saída" do formulário
 *  (o botão "Gerar" do modal chama esta action — o gerador vive server-only). */
export async function gerarSegredoCallbackAction(): Promise<string> {
  await requireAreaAction('solicitacoes')
  return gerarSegredo()
}

/** Últimas chamadas de uma chave (modal "Ver log"). null = falha ao carregar. */
export async function listarLogChaveApi(chaveId: number): Promise<LogChamada[] | null> {
  await requireAreaAction('solicitacoes')
  return listarLogApi(chaveId)
}
