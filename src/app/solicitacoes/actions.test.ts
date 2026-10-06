import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// v6.2.1 — GUARD dos anexos da abertura de solicitação.
//
// O bug real (12/08 a 05/10/2026, 25 de 141 anexos): quando `criar_solicitacao` recusava (valor
// "1.234,56" num campo moeda, campo obrigatório vazio), `criarSolicitacao` APAGAVA do Storage os
// anexos já enviados. O modal seguia com os metadados na mão; o usuário corrigia, reenviava, e a
// solicitação nascia apontando para arquivos que não existiam mais — o move para `sol/<id>/`
// falhava em silêncio e o download dava "Não foi possível gerar o link do anexo".
//
// Por isso o Storage abaixo GUARDA objetos: um `vi.fn()` que só registra chamadas provaria
// "remove não foi chamado", mas não provaria o que importa — que o arquivo da primeira tentativa
// ainda está lá para a segunda, e termina em `sol/<id>/`.

vi.mock('server-only', () => ({}))

type Resposta = { data: unknown; error: { message: string } | null }

/** `rpc` como método de PROTÓTIPO, igual ao supabase-js (ver solicitar-acesso/actions.test.ts:
 *  um dublê com função solta passaria mesmo se a action destacasse o método). */
class ClienteSessaoFake {
  readonly rest = { marcador: 'postgrest' }
  readonly chamadas: { fn: string; args: Record<string, unknown> }[] = []
  private respostas = new Map<string, Resposta[]>()

  /** Enfileira respostas: cada chamada consome a próxima; a última se repete. */
  responder(fn: string, ...r: Resposta[]) { this.respostas.set(fn, r); return this }

  rpc(fn: string, args: Record<string, unknown> = {}): Promise<Resposta> {
    void this.rest
    this.chamadas.push({ fn, args })
    const fila = this.respostas.get(fn) ?? []
    const r = fila.length > 1 ? fila.shift()! : (fila[0] ?? { data: null, error: null })
    return Promise.resolve(r)
  }
}

/** Bucket com estado. Como o SDK real, NÃO lança em falha de API — resolve com `{ error }`. */
class BucketFake {
  readonly objetos = new Set<string>()
  readonly removidos: string[] = []
  falharMove = false

  async upload(path: string) { this.objetos.add(path); return { data: { path }, error: null } }
  async remove(paths: string[]) {
    for (const p of paths) { this.objetos.delete(p); this.removidos.push(p) }
    return { data: [], error: null }
  }
  async move(de: string, para: string) {
    if (this.falharMove || !this.objetos.has(de)) return { data: null, error: { message: 'Object not found', statusCode: '404' } }
    this.objetos.delete(de); this.objetos.add(para)
    return { data: { message: 'ok' }, error: null }
  }
  async createSignedUrl(path: string) {
    if (!this.objetos.has(path)) return { data: null, error: { message: 'Object not found', statusCode: '404' } }
    return { data: { signedUrl: `https://assinado/${path}` }, error: null }
  }
}

let sessao: ClienteSessaoFake
let bucket: BucketFake

vi.mock('@/lib/supabase/server', () => ({ getServerClient: async () => sessao }))
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => ({ storage: { from: () => bucket } }) }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaAction: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))
vi.mock('@/lib/solicitacoes/rpc', () => ({ getDetalhe: async () => null, getEmailsEnvolvidos: async () => null }))
vi.mock('@/lib/email', () => ({ enviarNotificacaoSolicitacao: async () => true }))

const { criarSolicitacao, anexoUrl } = await import('./actions')

const TMP = 'tmp/0b6f1a52-2c1e-4f0e-9d7a-5d1f3c7b9a10/comprovante.pdf'
const META = { campo_id: 67, storage_path: TMP, nome_arquivo: 'comprovante.pdf', mime: 'application/pdf', tamanho_bytes: 1000 }
const INPUT = {
  tipo_id: 1, destinatario_user_id: null, destinatario_role_id: 2, data_limite: '2026-10-10',
  descricao: '', respostas: { '10': '1234,56' }, anexos: [META],
}
const ERRO = (message: string): Resposta => ({ data: null, error: { message } })

let consoleError: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  sessao = new ClienteSessaoFake()
  bucket = new BucketFake()
  bucket.objetos.add(TMP)                      // o upload do modal já aconteceu
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => consoleError.mockRestore())

describe('criarSolicitacao — anexos sobrevivem à recusa (v6.2.1)', () => {
  it('recusa do banco NÃO apaga os anexos já enviados', async () => {
    sessao.responder('criar_solicitacao', ERRO('VALOR_INVALIDO: Valor deve ser numérico'))
    const r = await criarSolicitacao(INPUT)
    expect(r.ok).toBe(false)
    expect(bucket.removidos).toEqual([])
    expect(bucket.objetos.has(TMP)).toBe(true)
  })

  it('o caminho do bug: recusa → reenvio com os MESMOS metadados → o arquivo chega em sol/<id>/ e baixa', async () => {
    sessao
      .responder('criar_solicitacao', ERRO('CAMPO_OBRIGATORIO: Valor'), { data: { id: 2401 }, error: null })
      .responder('solic_promover_anexos', { data: 1, error: null })

    expect((await criarSolicitacao(INPUT)).ok).toBe(false)
    expect(await criarSolicitacao(INPUT)).toEqual({ ok: true, id: 2401 })

    const destino = `sol/2401/${TMP.slice('tmp/'.length)}`
    expect(bucket.objetos.has(destino)).toBe(true)
    const promover = sessao.chamadas.find(c => c.fn === 'solic_promover_anexos')
    expect(promover?.args).toEqual({ p_solicitacao_id: 2401, p_de_para: [{ de: TMP, para: destino }] })
    // Nenhum log do bloco de anexos — todos começam com este prefixo (o dublê de e-mail sem
    // envolvidos loga "notificação #2401", que é outro caminho e irrelevante aqui).
    expect(consoleError.mock.calls.some((c: unknown[]) => String(c[0]).startsWith('[solicitacoes] #2401:'))).toBe(false)
  })

  it('move que falha é LOGADO (antes era engolido) e não é registrado como promovido', async () => {
    sessao.responder('criar_solicitacao', { data: { id: 7 }, error: null })
    bucket.falharMove = true
    expect((await criarSolicitacao(INPUT)).ok).toBe(true)
    expect(sessao.chamadas.some(c => c.fn === 'solic_promover_anexos')).toBe(false)
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('anexo não promovido'), expect.anything())
  })

  it('promoção recusada pelo banco é LOGADA e os moves são DESFEITOS (banco e Storage concordam em tmp/)', async () => {
    sessao
      .responder('criar_solicitacao', { data: { id: 8 }, error: null })
      .responder('solic_promover_anexos', ERRO('PERMISSAO_NEGADA: somente o solicitante'))
    expect((await criarSolicitacao(INPUT)).ok).toBe(true)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('desfazendo os moves'), expect.stringContaining('PERMISSAO_NEGADA'))
    expect(bucket.objetos.has(TMP)).toBe(true)                               // o banco aponta para cá
    expect(bucket.objetos.has(`sol/8/${TMP.slice('tmp/'.length)}`)).toBe(false)
    // e o anexo continua baixável pelo caminho que o banco tem
    sessao.responder('solic_anexo_path', { data: { storage_path: TMP }, error: null })
    expect((await anexoUrl(1)).ok).toBe(true)
  })
})

describe('criarSolicitacao — a mensagem diz QUAL campo (v6.2.1)', () => {
  it.each([
    ['CAMPO_OBRIGATORIO: Valor', 'Preencha o campo obrigatório "Valor".'],
    ['VALOR_INVALIDO: Valor deve ser numérico', 'Valor deve ser numérico.'],
    ['VALOR_INVALIDO: Data do pagamento não admite data no passado', 'Data do pagamento não admite data no passado.'],
    ['VALOR_INVALIDO: opção inexistente em Forma de pagamento', 'Opção inexistente em Forma de pagamento.'],
    ['VALOR_INVALIDO:', 'Há um valor inválido em um dos campos.'],          // sem detalhe → dicionário
    ['DESTINATARIO_XOR: exatamente um', 'Escolha exatamente um destinatário (usuário OU permissão).'],
  ])('%s → %s', async (msg, esperado) => {
    sessao.responder('criar_solicitacao', ERRO(msg))
    expect(await criarSolicitacao(INPUT)).toEqual({ ok: false, erro: esperado })
  })
})

describe('anexoUrl — binário ausente é "indisponível", não erro genérico (v6.2.1)', () => {
  it('objeto inexistente no Storage → indisponivel: true', async () => {
    sessao.responder('solic_anexo_path', { data: { storage_path: 'tmp/sumiu/x.pdf' }, error: null })
    const r = await anexoUrl(163)
    expect(r).toMatchObject({ ok: false, indisponivel: true })
  })

  it('objeto presente → URL assinada', async () => {
    sessao.responder('solic_anexo_path', { data: { storage_path: TMP }, error: null })
    expect(await anexoUrl(1)).toEqual({ ok: true, url: `https://assinado/${TMP}` })
  })

  it('"Bucket not found" (também statusCode 404) NÃO é anexo indisponível — é falha de infraestrutura', async () => {
    sessao.responder('solic_anexo_path', { data: { storage_path: TMP }, error: null })
    bucket.createSignedUrl = async () => ({ data: null, error: { message: 'Bucket not found', statusCode: '404' } })
    expect(await anexoUrl(1)).toEqual({ ok: false, erro: 'Não foi possível gerar o link do anexo.' })
  })

  it('outra falha do Storage segue como erro genérico, sem marcar indisponível', async () => {
    sessao.responder('solic_anexo_path', { data: { storage_path: TMP }, error: null })
    bucket.createSignedUrl = async () => ({ data: null, error: { message: 'gateway timeout', statusCode: '504' } })
    const r = await anexoUrl(1)
    expect(r).toEqual({ ok: false, erro: 'Não foi possível gerar o link do anexo.' })
  })
})
