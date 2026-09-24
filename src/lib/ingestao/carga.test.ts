import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// `carga.ts` (e o que ele importa: `storage.ts`, `aplicar.ts`, `log.ts`) é `server-only` —
// neutralizado no vitest, mesmo molde de `storage.test.ts`/`aplicar.test.ts`. Este arquivo
// prova só as PARTES TESTÁVEIS SEM REDE que a delegação pede: a validação do passo 1, a
// tradução de cada falha do §2.3 para o código do §2.4, a reconciliação de Vendas, a forma do
// envelope de erro, o lock em memória e a autenticação de duas portas — tudo mockando o que
// toca rede (`autenticarChamada`, `requireAreaApi`, `getAdminClient`).
vi.mock('server-only', () => ({}))

const { autenticarChamadaMock, requireAreaApiMock, rpcMock } = vi.hoisted(() => ({
  autenticarChamadaMock: vi.fn(),
  requireAreaApiMock: vi.fn(),
  rpcMock: vi.fn(),
}))

vi.mock('@/lib/api-externa/http', () => ({
  autenticarChamada: autenticarChamadaMock,
}))
vi.mock('@/lib/auth/sessao', () => ({
  requireAreaApi: requireAreaApiMock,
}))

/** Molde de `admin/acessos/actions.test.ts`: `rpc` é método de PROTÓTIPO (não arrow property),
 *  para que `.bind(supabase)` em `carga.ts` se comporte como em produção. */
class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    void alcance
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))

import {
  validarArquivosDeclarados, reconciliarVendas, traduzirFalhaParse, ErroCarga, respostaErroCarga,
  tentarTravarBase, destravarBase, autenticarIngestao, calcularDiff, statusAtualDaBase,
  type ArquivoDeclarado,
} from './carga'
import { LIMITE_BYTES_ARQUIVO, LIMITE_BYTES_CARGA } from './storage'
import type { ParseErro } from './parsers/comum'
import type { ChaveResolvida } from '@/lib/api-externa/http'
import type { Sessao } from '@/lib/auth/sessao'

function reqComChave(chave: string | null): Request {
  return { headers: { get: (k: string) => (k.toLowerCase() === 'x-api-key' ? chave : null) } } as unknown as Request
}

function chaveResolvida(overrides: Partial<ChaveResolvida> = {}): ChaveResolvida {
  return { id: 7, plataforma: 'rpa-pad', robo_user_id: 'user-1', escopo_bases: ['vendas-produto'], ...overrides }
}

function sessaoAtiva(overrides: Partial<Sessao> = {}): Sessao {
  return {
    logado: true, registrado: true, ativo: true, userId: 'uid-1', email: 'a@b.com', nome: 'Fulano',
    role: 'admin', permissoes: ['admin/uploads'], isAdmin: false, precisaTrocarSenha: false, ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
})

// ── validarArquivosDeclarados — passo 1 do contrato (§2.1) ──────────────────────────────────

describe('validarArquivosDeclarados', () => {
  const ARQUIVO_XLSX: ArquivoDeclarado = { nome: 'a.xlsx', bytes: 1000, sha256: 'a'.repeat(64) }
  const ARQUIVO_CSV: ArquivoDeclarado = { nome: 'a.csv', bytes: 1000, sha256: 'b'.repeat(64) }

  it('lista vazia é rejeitada (FORMATO_INVALIDO)', () => {
    const erro = validarArquivosDeclarados('vendas-produto', [])
    expect(erro?.codigo).toBe('FORMATO_INVALIDO')
    expect(erro?.http).toBe(422)
  })

  it('Vendas aceita mais de um arquivo; as demais bases aceitam só 1', () => {
    expect(validarArquivosDeclarados('vendas-produto', [ARQUIVO_XLSX, { ...ARQUIVO_XLSX, nome: 'b.xlsx' }])).toBeNull()
    const erro = validarArquivosDeclarados('demonstrativo-competencia', [ARQUIVO_XLSX, { ...ARQUIVO_XLSX, nome: 'b.xlsx' }])
    expect(erro?.codigo).toBe('FORMATO_INVALIDO')
    expect(erro?.message).toContain('aceita exatamente 1')
  })

  it('extensão errada por base é rejeitada — só lancamentos-operacao aceita .csv', () => {
    expect(validarArquivosDeclarados('vendas-produto', [ARQUIVO_CSV])?.codigo).toBe('FORMATO_INVALIDO')
    expect(validarArquivosDeclarados('lancamentos-operacao', [ARQUIVO_XLSX])?.codigo).toBe('FORMATO_INVALIDO')
    expect(validarArquivosDeclarados('lancamentos-operacao', [ARQUIVO_CSV])).toBeNull()
  })

  it('bytes não-positivo é rejeitado', () => {
    expect(validarArquivosDeclarados('vendas-produto', [{ ...ARQUIVO_XLSX, bytes: 0 }])?.codigo).toBe('FORMATO_INVALIDO')
    expect(validarArquivosDeclarados('vendas-produto', [{ ...ARQUIVO_XLSX, bytes: -5 }])?.codigo).toBe('FORMATO_INVALIDO')
  })

  it('acima do limite POR ARQUIVO — 413 ACIMA_DO_LIMITE', () => {
    const erro = validarArquivosDeclarados('vendas-produto', [{ ...ARQUIVO_XLSX, bytes: LIMITE_BYTES_ARQUIVO + 1 }])
    expect(erro?.codigo).toBe('ACIMA_DO_LIMITE')
    expect(erro?.http).toBe(413)
  })

  it('dentro do limite por arquivo, mas acima do limite POR CARGA (soma) — 413', () => {
    // Cada arquivo fica NO TETO por arquivo (não o excede) e são vários: nenhum reprova
    // sozinho, mas a SOMA ultrapassa o teto da carga. É o que isola o check de soma do check
    // por arquivo. A quantidade é DERIVADA dos dois limites, não escrita à mão: com o número
    // fixo em 5, trocar qualquer um dos dois tetos faria este teste continuar verde testando
    // outra coisa (ou o caso por arquivo, ou nada).
    const quantos = Math.floor(LIMITE_BYTES_CARGA / LIMITE_BYTES_ARQUIVO) + 1
    const arquivos: ArquivoDeclarado[] = Array.from({ length: quantos }, (_, i) => ({
      nome: `v${i + 1}.xlsx`, bytes: LIMITE_BYTES_ARQUIVO, sha256: `${i % 10}`.repeat(64),
    }))
    const erro = validarArquivosDeclarados('vendas-produto', arquivos)
    expect(erro?.codigo).toBe('ACIMA_DO_LIMITE')
    expect(erro?.http).toBe(413)
    expect(erro?.message).toContain('carga soma')
  })

  it('sha256 fora do formato hex-64 é rejeitado', () => {
    expect(validarArquivosDeclarados('vendas-produto', [{ ...ARQUIVO_XLSX, sha256: 'nao-e-hex' }])?.codigo).toBe('FORMATO_INVALIDO')
    expect(validarArquivosDeclarados('vendas-produto', [{ ...ARQUIVO_XLSX, sha256: 'a'.repeat(63) }])?.codigo).toBe('FORMATO_INVALIDO')
  })

  it('arquivo(s) válido(s) devolve null', () => {
    expect(validarArquivosDeclarados('lancamentos-aberto', [ARQUIVO_XLSX])).toBeNull()
  })
})

// ── reconciliarVendas — §2.3 passo 7 ─────────────────────────────────────────────────────────

describe('reconciliarVendas', () => {
  it('sem repetição entre arquivos devolve null', () => {
    expect(reconciliarVendas([
      { venda_numero: '1', arquivo_origem: '24.xlsx' },
      { venda_numero: '2', arquivo_origem: '24.xlsx' },
      { venda_numero: '3', arquivo_origem: '25.xlsx' },
    ])).toBeNull()
  })

  it('repetir a MESMA venda várias vezes DENTRO do mesmo arquivo é normal (item de venda)', () => {
    expect(reconciliarVendas([
      { venda_numero: '1', arquivo_origem: '24.xlsx' },
      { venda_numero: '1', arquivo_origem: '24.xlsx' },
      { venda_numero: '1', arquivo_origem: '24.xlsx' },
    ])).toBeNull()
  })

  it('venda_numero nulo é ignorado (linha de totais já removida, mas defensivo)', () => {
    expect(reconciliarVendas([
      { venda_numero: null, arquivo_origem: '24.xlsx' },
      { venda_numero: null, arquivo_origem: '25.xlsx' },
    ])).toBeNull()
  })

  it('a MESMA venda em DOIS arquivos diferentes reprova (VENDA_REPETIDA_ENTRE_ARQUIVOS)', () => {
    const erro = reconciliarVendas([
      { venda_numero: '100', arquivo_origem: '24.xlsx' },
      { venda_numero: '100', arquivo_origem: '25.xlsx' },
      { venda_numero: '200', arquivo_origem: '25.xlsx' },
    ])
    expect(erro?.codigo).toBe('VENDA_REPETIDA_ENTRE_ARQUIVOS')
    expect(erro?.http).toBe(422)
    expect((erro?.detalhe as { total: number }).total).toBe(1)
  })
})

// ── traduzirFalhaParse — 1:1 com o §2.4 ──────────────────────────────────────────────────────

describe('traduzirFalhaParse', () => {
  it('preserva codigo/mensagem/detalhe do parser, sempre HTTP 422', () => {
    const falha: ParseErro = { ok: false, codigo: 'CHECKSUM_FALHOU', mensagem: 'não fechou', detalhe: { x: 1 } }
    const erro = traduzirFalhaParse(falha)
    expect(erro.codigo).toBe('CHECKSUM_FALHOU')
    expect(erro.http).toBe(422)
    expect(erro.message).toBe('não fechou')
    expect(erro.detalhe).toEqual({ x: 1 })
  })

  it.each(['FORMATO_INVALIDO', 'ESTRUTURA_INESPERADA', 'CHECKSUM_FALHOU'] as const)(
    'o codigo %s do parser vira o MESMO codigo em ErroCarga', (codigo) => {
      const erro = traduzirFalhaParse({ ok: false, codigo, mensagem: 'x' })
      expect(erro.codigo).toBe(codigo)
    },
  )
})

// ── Envelope de erro (§2.4: {ok:false, erro:{codigo,mensagem,detalhe?}}) ────────────────────

describe('envelope de erro — respostaErroCarga / ErroCarga.resposta()', () => {
  it('sem detalhe: {ok:false, erro:{codigo,mensagem}}', async () => {
    const resp = respostaErroCarga('BASE_DESCONHECIDA', 'não existe', 404)
    expect(resp.status).toBe(404)
    const corpo = await resp.json()
    expect(corpo).toEqual({ ok: false, erro: { codigo: 'BASE_DESCONHECIDA', mensagem: 'não existe' } })
  })

  it('com detalhe: a chave "detalhe" aparece no envelope', async () => {
    const resp = respostaErroCarga('SHA256_DIVERGE', 'diverge', 422, { nome: 'a.xlsx' })
    const corpo = await resp.json()
    expect(corpo).toEqual({ ok: false, erro: { codigo: 'SHA256_DIVERGE', mensagem: 'diverge', detalhe: { nome: 'a.xlsx' } } })
  })

  it('ErroCarga.resposta() produz o MESMO envelope, com o HTTP guardado na instância', async () => {
    const erro = new ErroCarga('CARGA_EM_ANDAMENTO', 409, 'já em andamento')
    const resp = erro.resposta()
    expect(resp.status).toBe(409)
    expect(await resp.json()).toEqual({ ok: false, erro: { codigo: 'CARGA_EM_ANDAMENTO', mensagem: 'já em andamento' } })
  })
})

// ── Lock em memória — 409 CARGA_EM_ANDAMENTO ────────────────────────────────────────────────

describe('tentarTravarBase / destravarBase', () => {
  it('primeira carga da base trava; segunda carga_id DIFERENTE é recusada', () => {
    expect(tentarTravarBase('vendas-produto', 'carga-A')).toBe(true)
    expect(tentarTravarBase('vendas-produto', 'carga-B')).toBe(false)
    destravarBase('vendas-produto', 'carga-A') // limpeza — não afeta outros testes
  })

  // Este caso já foi o OPOSTO: "o próprio dono pode travar de novo". Era o furo — chamada
  // duplicada tem, por definição, o MESMO carga_id (retry de rede, duplo-clique, RPA reenviando
  // o passo 3 após timeout), e abrir exceção para ele deixava as duas entrarem em `aplicarCarga`
  // ao mesmo tempo. Nas quatro bases não-Vendas não há lock no banco: dois TRUNCATE+INSERT
  // intercalados misturam duas cargas na mesma tabela. Achado ALTO do `revisor`.
  it('o MESMO carga_id TAMBÉM é recusado enquanto a base está travada (é o caso do retry)', () => {
    expect(tentarTravarBase('vendas-produto', 'carga-C')).toBe(true)
    expect(tentarTravarBase('vendas-produto', 'carga-C')).toBe(false)
    destravarBase('vendas-produto', 'carga-C')
  })

  it('destravar com carga_id ERRADO não libera o lock de outra carga', () => {
    expect(tentarTravarBase('vendas-produto', 'carga-D')).toBe(true)
    destravarBase('vendas-produto', 'carga-ERRADA')
    expect(tentarTravarBase('vendas-produto', 'carga-E')).toBe(false)
    destravarBase('vendas-produto', 'carga-D') // limpeza real
  })

  it('destravar com o carga_id CERTO libera, e a próxima carga consegue travar', () => {
    expect(tentarTravarBase('vendas-produto', 'carga-F')).toBe(true)
    destravarBase('vendas-produto', 'carga-F')
    expect(tentarTravarBase('vendas-produto', 'carga-G')).toBe(true)
    destravarBase('vendas-produto', 'carga-G')
  })

  it('bases DIFERENTES nunca disputam o mesmo lock', () => {
    expect(tentarTravarBase('vendas-produto', 'carga-H')).toBe(true)
    expect(tentarTravarBase('demonstrativo-competencia', 'carga-I')).toBe(true)
    destravarBase('vendas-produto', 'carga-H')
    destravarBase('demonstrativo-competencia', 'carga-I')
  })

  it('TTL expira o lock — depois da janela, outra carga consegue travar sem destravar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    expect(tentarTravarBase('lancamentos-aberto', 'carga-J')).toBe(true)
    // ainda dentro da janela: continua recusando
    vi.setSystemTime(new Date('2026-01-01T00:05:00Z'))
    expect(tentarTravarBase('lancamentos-aberto', 'carga-K')).toBe(false)
    // além de 10 min: expira, e uma carga NOVA consegue travar
    vi.setSystemTime(new Date('2026-01-01T00:10:01Z'))
    expect(tentarTravarBase('lancamentos-aberto', 'carga-K')).toBe(true)
    destravarBase('lancamentos-aberto', 'carga-K')
  })
})

// ── Autenticação — duas portas (chave x-api-key OU sessão) ───────────────────────────────────

describe('autenticarIngestao', () => {
  it('x-api-key presente + escopo cobre a base ⇒ ok via chave', async () => {
    autenticarChamadaMock.mockResolvedValueOnce({ ok: true, chave: chaveResolvida({ escopo_bases: ['vendas-produto'] }) })
    const r = await autenticarIngestao(reqComChave('segredo'), 'vendas-produto')
    expect(r).toEqual({ ok: true, via: 'chave', chave: chaveResolvida({ escopo_bases: ['vendas-produto'] }) })
    expect(requireAreaApiMock).not.toHaveBeenCalled()
  })

  it('x-api-key presente + escopo NÃO cobre a base ⇒ 403 ESCOPO_INSUFICIENTE, com chaveId', async () => {
    autenticarChamadaMock.mockResolvedValueOnce({ ok: true, chave: chaveResolvida({ id: 42, escopo_bases: ['lancamentos-aberto'] }) })
    const r = await autenticarIngestao(reqComChave('segredo'), 'vendas-produto')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
    expect(r.viaChave).toBe(true)
    expect(r.chaveId).toBe(42)
    expect((await r.resposta.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
  })

  it('x-api-key presente e INVÁLIDA ⇒ repassa a resposta de autenticarChamada (401 AUTH_INVALIDA)', async () => {
    const respostaOriginal = respostaErroCarga('AUTH_INVALIDA', 'chave inválida', 401)
    autenticarChamadaMock.mockResolvedValueOnce({ ok: false, resposta: respostaOriginal })
    const r = await autenticarIngestao(reqComChave('segredo-errado'), 'vendas-produto')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta).toBe(respostaOriginal)
    expect(r.viaChave).toBe(true)
    expect(r.chaveId).toBeNull()
  })

  it('sem x-api-key + sessão válida com admin/uploads ⇒ ok via sessão, NUNCA chama autenticarChamada', async () => {
    requireAreaApiMock.mockResolvedValueOnce(sessaoAtiva())
    const r = await autenticarIngestao(reqComChave(null), 'vendas-produto')
    expect(r).toEqual({ ok: true, via: 'sessao', sessao: sessaoAtiva() })
    expect(autenticarChamadaMock).not.toHaveBeenCalled()
  })

  it('sem x-api-key + sem sessão nenhuma (401 do guard) ⇒ AUTH_AUSENTE, viaChave:false', async () => {
    requireAreaApiMock.mockResolvedValueOnce(Response.json({ error: 'AUTH_NECESSARIA' }, { status: 401 }))
    const r = await autenticarIngestao(reqComChave(null), 'vendas-produto')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(401)
    expect(r.viaChave).toBe(false)
    expect(r.chaveId).toBeNull()
    expect((await r.resposta.json()).erro.codigo).toBe('AUTH_AUSENTE')
  })

  it('sem x-api-key + sessão SEM a área admin/uploads (403 do guard) ⇒ ESCOPO_INSUFICIENTE', async () => {
    requireAreaApiMock.mockResolvedValueOnce(Response.json({ error: 'PERMISSAO_NEGADA' }, { status: 403 }))
    const r = await autenticarIngestao(reqComChave(null), 'vendas-produto')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.resposta.status).toBe(403)
    expect((await r.resposta.json()).erro.codigo).toBe('ESCOPO_INSUFICIENTE')
  })
})

// ── Diff contra a base viva — §2.3 passo 8 ───────────────────────────────────────────────────

describe('statusAtualDaBase', () => {
  it('vendas-produto lê get_upload_status().vendas.total', async () => {
    rpcMock.mockResolvedValueOnce({ data: { vendas: { total: 48652 } }, error: null })
    expect(await statusAtualDaBase('vendas-produto')).toEqual({ linhas: 48652, somaCentavos: null })
    expect(rpcMock).toHaveBeenCalledWith('get_upload_status', undefined)
  })

  it('lancamentos-operacao lê get_upload_status().lancamentos.total', async () => {
    rpcMock.mockResolvedValueOnce({ data: { lancamentos: { total: 41745 } }, error: null })
    expect(await statusAtualDaBase('lancamentos-operacao')).toEqual({ linhas: 41745, somaCentavos: null })
  })

  it('demonstrativo-competencia traz total E soma_centavos', async () => {
    rpcMock.mockResolvedValueOnce({ data: { total: 3334, soma_centavos: 123456 }, error: null })
    expect(await statusAtualDaBase('demonstrativo-competencia')).toEqual({ linhas: 3334, somaCentavos: 123456 })
  })

  it('lancamentos-movimentacao/aberto leem status_* dedicadas', async () => {
    rpcMock.mockResolvedValueOnce({ data: { total: 100 }, error: null })
    expect(await statusAtualDaBase('lancamentos-movimentacao')).toEqual({ linhas: 100, somaCentavos: null })
    expect(rpcMock).toHaveBeenCalledWith('status_lancamentos_movimentacao', undefined)

    rpcMock.mockResolvedValueOnce({ data: { total: 200 }, error: null })
    expect(await statusAtualDaBase('lancamentos-aberto')).toEqual({ linhas: 200, somaCentavos: null })
    expect(rpcMock).toHaveBeenCalledWith('status_titulos_em_aberto', undefined)
  })

  it('falha na RPC degrada para null (nunca lança)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    expect(await statusAtualDaBase('vendas-produto')).toBeNull()
  })
})

describe('calcularDiff', () => {
  it('demonstrativo: soma em REAIS (não centavos) — subtração é feita em centavos internamente', async () => {
    rpcMock.mockResolvedValueOnce({ data: { total: 50, soma_centavos: 1_000_000 }, error: null }) // R$ 10.000,00
    const { diff, aviso } = await calcularDiff('demonstrativo-competencia', 60, 1_050_000) // novo: R$ 10.500,00
    expect(diff.linhas).toBe(10)
    expect(diff.soma).toBeCloseTo(500, 5) // (1_050_000 - 1_000_000)/100
    expect(aviso).toBeNull()
  })

  it('bases sem soma na RPC de status devolvem soma:null, mesmo com soma nova conhecida', async () => {
    rpcMock.mockResolvedValueOnce({ data: { vendas: { total: 100 } }, error: null })
    const { diff } = await calcularDiff('vendas-produto', 110, null)
    // `por_ano`/`anos_fechados_alterados` (M6) nascem `null` aqui: esta função mede contra o
    // TOTAL da base viva, não por ano — quem preenche os dois é `processarCarga`, via
    // `ingestao_soma_por_ano` (ver `alarme.ts`).
    expect(diff).toEqual({ linhas: 10, soma: null, por_ano: null, anos_fechados_alterados: null })
  })

  it('status indisponível degrada para {linhas:null, soma:null} com aviso — nunca aborta', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    const { diff, aviso } = await calcularDiff('vendas-produto', 100, null)
    expect(diff).toEqual({ linhas: null, soma: null, por_ano: null, anos_fechados_alterados: null })
    expect(aviso).toMatch(/não foi possível medir o diff/i)
  })
})
