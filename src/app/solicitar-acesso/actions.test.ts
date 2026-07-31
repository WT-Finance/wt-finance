import { describe, it, expect, beforeEach, vi } from 'vitest'

// v5.3.5 — GUARD do fluxo público de solicitação de acesso.
//
// O bug real (13/07 a 31/07, 18 dias em produção): a action fazia
//   const rpc = supabase.rpc as unknown as AdminRpc
// Isso DESTACA o método do cliente. `SupabaseClient.rpc` é método de PROTÓTIPO e faz
// `return this.rest.rpc(...)`; destacado, o `this` é `undefined` em ESM/strict e a chamada
// estoura `TypeError: Cannot read properties of undefined (reading 'rest')`. O catch
// anti-enumeração engolia o erro e a tela dizia "pedido enviado" — 18 pedidos perdidos só
// na janela de log da Vercel, ZERO linhas criadas na base desde 13/07 11h26.
//
// Por isso o dublê abaixo NÃO é um `vi.fn()`: um mock com função solta passa mesmo com o
// método destacado e não guardaria nada. Ele replica a armadilha — `rpc` é método de
// protótipo (classe) que TOCA `this.rest`. Chamada destacada ⇒ mesmo TypeError da produção.

vi.mock('server-only', () => ({}))

type Resposta = { data: unknown; error: { message: string } | null }

class ClienteSupabaseFake {
  /** O que `SupabaseClient.rpc` lê de `this` — a peça que falta quando o método é destacado. */
  readonly rest = { marcador: 'postgrest' }
  readonly chamadas: { fn: string; args: Record<string, unknown> }[] = []
  private respostas = new Map<string, Resposta>()

  responder(fn: string, r: Resposta) { this.respostas.set(fn, r); return this }

  // Método de PROTÓTIPO de propósito (classe ⇒ prototype), igual ao supabase-js.
  rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resposta> {
    const alcance = this.rest   // ← se `this` for undefined, estoura AQUI, como em produção
    void alcance
    this.chamadas.push({ fn, args })
    return Promise.resolve(this.respostas.get(fn) ?? { data: null, error: null })
  }
}

let cliente: ClienteSupabaseFake
const enviarNotificacao = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => cliente }))
vi.mock('@/lib/email', () => ({
  enviarNotificacaoAcessoSolicitado: (...a: unknown[]) => enviarNotificacao(...a),
}))
// `redirect()` do Next LANÇA internamente; o dublê preserva esse contrato para que o teste
// possa afirmar o destino sem que a action "continue" depois dele.
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw Object.assign(new Error('NEXT_REDIRECT'), { url }) },
}))

const { solicitarAcesso } = await import('./actions')

/** Roda a action e devolve o destino do redirect (o único efeito observável de fora). */
async function submeter(campos: Record<string, string>): Promise<string> {
  const fd = new FormData()
  for (const [k, v] of Object.entries(campos)) fd.set(k, v)
  try {
    await solicitarAcesso(fd)
  } catch (err) {
    const url = (err as { url?: string }).url
    if (url) return url
    throw err
  }
  throw new Error('a action deveria ter redirecionado')
}

describe('solicitarAcesso — o pedido CHEGA no banco (guard do bind, v5.3.5)', () => {
  beforeEach(() => {
    cliente = new ClienteSupabaseFake()
    enviarNotificacao.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('chama solicitar_acesso_admin de verdade (com o `this` do cliente) e redireciona a sucesso', async () => {
    cliente.responder('solicitar_acesso_admin', { data: { inserida: true, emails: [] }, error: null })
    const destino = await submeter({ email: 'novo@welcometrips.com.br', nome: 'Pessoa Nova' })
    // O CORAÇÃO DO GUARD: com o método destacado, `chamadas` fica VAZIO (estourou antes de
    // registrar) e este expect reprova.
    expect(cliente.chamadas.map(c => c.fn)).toEqual(['solicitar_acesso_admin'])
    expect(cliente.chamadas[0].args).toEqual({ p_email: 'novo@welcometrips.com.br', p_nome: 'Pessoa Nova' })
    expect(destino).toBe('/solicitar-acesso?enviado=1')
  })

  it('normaliza o e-mail (trim + minúsculas) e manda nome vazio como null', async () => {
    cliente.responder('solicitar_acesso_admin', { data: { inserida: true, emails: [] }, error: null })
    await submeter({ email: '  Pessoa@Welcometrips.COM.BR  ', nome: '   ' })
    expect(cliente.chamadas[0].args).toEqual({ p_email: 'pessoa@welcometrips.com.br', p_nome: null })
  })

  it('pedido NOVO com admins → notifica os administradores', async () => {
    cliente.responder('solicitar_acesso_admin', {
      data: { inserida: true, emails: ['a@x.com', 'b@x.com'] }, error: null,
    })
    await submeter({ email: 'novo@x.com', nome: 'N' })
    expect(enviarNotificacao).toHaveBeenCalledTimes(1)
    expect(enviarNotificacao.mock.calls[0][0]).toMatchObject({
      paras: ['a@x.com', 'b@x.com'], emailSolicitante: 'novo@x.com', nomeSolicitante: 'N',
    })
  })

  it('reenvio/duplicata (inserida=false) → NÃO notifica ninguém', async () => {
    cliente.responder('solicitar_acesso_admin', { data: { inserida: false, emails: [] }, error: null })
    await submeter({ email: 'repetido@x.com' })
    expect(cliente.chamadas.map(c => c.fn)).toEqual(['solicitar_acesso_admin'])
    expect(enviarNotificacao).not.toHaveBeenCalled()
  })

  it('RPC nova indisponível → cai no legado solicitar_acesso (o pedido não se perde)', async () => {
    cliente.responder('solicitar_acesso_admin', { data: null, error: { message: 'function does not exist' } })
    const destino = await submeter({ email: 'novo@x.com' })
    expect(cliente.chamadas.map(c => c.fn)).toEqual(['solicitar_acesso_admin', 'solicitar_acesso'])
    expect(cliente.chamadas[1].args).toEqual({ p_email: 'novo@x.com', p_nome: null })
    expect(destino).toBe('/solicitar-acesso?enviado=1')
  })

  it('os DOIS caminhos falhando → loga PEDIDO PERDIDO (nunca mais em silêncio)', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    cliente.responder('solicitar_acesso_admin', { data: null, error: { message: 'boom' } })
    cliente.responder('solicitar_acesso', { data: null, error: { message: 'boom legado' } })
    const destino = await submeter({ email: 'novo@x.com' })
    const linhas = erro.mock.calls.map(c => String(c[0])).join('\n')
    expect(linhas).toContain('PEDIDO PERDIDO')
    // Anti-enumeração preservada: a tela NÃO revela a falha.
    expect(destino).toBe('/solicitar-acesso?enviado=1')
  })

  it('e-mail inválido → erro na tela e NADA é tentado no banco', async () => {
    const destino = await submeter({ email: 'sem-arroba', nome: 'X' })
    expect(destino).toBe('/solicitar-acesso?erro=email')
    expect(cliente.chamadas).toEqual([])
    expect(enviarNotificacao).not.toHaveBeenCalled()
  })

  it('falha inesperada da camada de e-mail não derruba o pedido (best-effort)', async () => {
    cliente.responder('solicitar_acesso_admin', { data: { inserida: true, emails: ['a@x.com'] }, error: null })
    enviarNotificacao.mockRejectedValueOnce(new Error('SMTP fora'))
    const destino = await submeter({ email: 'novo@x.com' })
    expect(cliente.chamadas.map(c => c.fn)).toEqual(['solicitar_acesso_admin'])
    expect(destino).toBe('/solicitar-acesso?enviado=1')
  })
})
