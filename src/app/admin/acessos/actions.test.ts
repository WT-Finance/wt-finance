import { describe, it, expect, beforeEach, vi } from 'vitest'

// v5.10.0/D5-002 e D5-003 — GUARD do caminho de ERRO das RPCs de criação de acesso.
//
// O defeito (auditoria da v5, achados D5-002 e D5-003): duas chamadas de RPC tinham o
// retorno DESCARTADO —
//   await supabase.rpc('admin_marcar_trocar_senha', ...)         // criarUsuario
//   await supabase.rpc('admin_decidir_solicitacao', ...)         // aprovarSolicitacao
// O SDK do Supabase NÃO LANÇA: ele devolve `{ data, error }`. Logo o `try/catch` em volta
// só pegava exceção de TRANSPORTE, e um erro retornado no payload (negação de RBAC,
// timeout do statement, violação de constraint) passava calado. Efeito de negócio real:
// a solicitação ficava PENDENTE para sempre, o usuário nascia sem a obrigação de trocar a
// senha provisória, e a tela declarava sucesso limpo — ninguém era avisado.
//
// Este teste exercita exatamente o caminho de erro: a RPC responde `{ error }` (não lança)
// e a action tem de (a) seguir devolvendo ok:true — o usuário FOI criado e a senha está na
// tela, desfazer seria pior — e (b) sinalizar em `avisoParcial`. Vista vermelha antes da
// correção: sem ela, `avisoParcial` é `undefined` nos dois casos.

vi.mock('server-only', () => ({}))

type Resposta = { data: unknown; error: { message: string } | null }

/** Dublê no molde do usado em `solicitar-acesso/actions.test.ts` (v5.3.5): `rpc` é método
 *  de PROTÓTIPO que toca `this.rest`, para que uma chamada destacada estoure como em
 *  produção em vez de passar silenciosamente. */
class ClienteSupabaseFake {
  readonly rest = { marcador: 'postgrest' }
  readonly chamadas: { fn: string; args: Record<string, unknown> }[] = []
  private respostas = new Map<string, Resposta>()

  responder(fn: string, r: Resposta) { this.respostas.set(fn, r); return this }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resposta> {
    const alcance = this.rest
    void alcance
    this.chamadas.push({ fn, args })
    return Promise.resolve(this.respostas.get(fn) ?? { data: null, error: null })
  }
}

/** Só o ramo de Auth do cliente admin (service role) que a action usa. */
class ClienteAdminFake {
  readonly auth = {
    admin: {
      createUser: () =>
        Promise.resolve({ data: { user: { id: 'user-uuid-1' } }, error: null }),
      updateUserById: () => Promise.resolve({ data: null, error: null }),
      listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
    },
  }
}

let cliente: ClienteSupabaseFake

vi.mock('@/lib/supabase/server', () => ({ getServerClient: () => Promise.resolve(cliente) }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaAction: () => Promise.resolve(undefined) }))
vi.mock('@/lib/email', () => ({ enviarSenhaProvisoria: () => Promise.resolve(true) }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

const { criarUsuario, aprovarSolicitacao } = await import('./actions')

const ENTRADA = { email: 'novo@welcometrips.com.br', nome: 'Novo', roleId: 3 }

describe('criarUsuario — erro de admin_marcar_trocar_senha não passa calado (D5-003)', () => {
  beforeEach(() => {
    cliente = new ClienteSupabaseFake()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('a RPC responde { error } SEM LANÇAR e o usuário sai com avisoParcial', async () => {
    cliente
      .responder('admin_registrar_usuario', { data: null, error: null })
      .responder('admin_marcar_trocar_senha', { data: null, error: { message: 'permissão negada' } })

    const r = await criarUsuario(ENTRADA)

    // O usuário foi criado: não se desfaz por causa de um passo acessório.
    expect(r.ok).toBe(true)
    // E o erro NÃO é engolido — é o que faltava antes da correção.
    expect(r.ok && r.avisoParcial).toMatch(/troca da senha/i)
    // Prova de que a chamada aconteceu de verdade (com o `this` do cliente).
    expect(cliente.chamadas.map(c => c.fn)).toContain('admin_marcar_trocar_senha')
  })

  it('caminho feliz não inventa aviso', async () => {
    cliente
      .responder('admin_registrar_usuario', { data: null, error: null })
      .responder('admin_marcar_trocar_senha', { data: null, error: null })

    const r = await criarUsuario(ENTRADA)

    expect(r.ok).toBe(true)
    expect(r.ok && r.avisoParcial).toBeUndefined()
  })

  it('erro de admin_registrar_usuario continua BLOQUEANDO (não é aviso, é falha)', async () => {
    cliente.responder('admin_registrar_usuario', { data: null, error: { message: 'role inexistente' } })

    const r = await criarUsuario(ENTRADA)

    expect(r.ok).toBe(false)
  })
})

describe('aprovarSolicitacao — erro de admin_decidir_solicitacao não passa calado (D5-002)', () => {
  beforeEach(() => {
    cliente = new ClienteSupabaseFake()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('a solicitação ficaria PENDENTE em silêncio; agora volta avisoParcial', async () => {
    cliente
      .responder('admin_registrar_usuario', { data: null, error: null })
      .responder('admin_marcar_trocar_senha', { data: null, error: null })
      .responder('admin_decidir_solicitacao', { data: null, error: { message: 'RLS: not authorized' } })

    const r = await aprovarSolicitacao({ id: 42, ...ENTRADA })

    expect(r.ok).toBe(true)
    expect(r.ok && r.avisoParcial).toMatch(/pendente/i)
    expect(cliente.chamadas.map(c => c.fn)).toContain('admin_decidir_solicitacao')
  })

  it('caminho feliz aprova sem aviso', async () => {
    cliente
      .responder('admin_registrar_usuario', { data: null, error: null })
      .responder('admin_marcar_trocar_senha', { data: null, error: null })
      .responder('admin_decidir_solicitacao', { data: null, error: null })

    const r = await aprovarSolicitacao({ id: 42, ...ENTRADA })

    expect(r.ok).toBe(true)
    expect(r.ok && r.avisoParcial).toBeUndefined()
    // A decisão foi de APROVAÇÃO (p_aprovar: true) — o argumento importa.
    const decidir = cliente.chamadas.find(c => c.fn === 'admin_decidir_solicitacao')
    expect(decidir?.args).toMatchObject({ p_id: 42, p_aprovar: true })
  })
})
