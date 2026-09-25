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
  processarCarga,
  type ArquivoDeclarado, type EntradaCarga,
} from './carga'
import { LIMITE_BYTES_ARQUIVO, LIMITE_BYTES_CARGA } from './storage'
import type { ParseErro } from './parsers/comum'
import type { ChaveResolvida } from '@/lib/api-externa/http'
import type { Sessao } from '@/lib/auth/sessao'
import type { LinhaCarga } from './log'

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

// ── processarCarga — grafo de dependência (§2.3 passo 3, §5; anexo v6.0.0/M7a) ──────────────
//
// Só o que dá para provar SEM mockar `storage.ts`/`aplicar.ts`/os parsers (fora do escopo desta
// missão levantar esse andaime): o check roda ANTES de `abrirCarga` — então, para provar que
// ele passou ("com Aberto do dia"), basta fazer `abrirCarga` falhar de propósito (mock de
// `ingestao_carga_abrir` com erro) e confirmar que o código devolvido é `ERRO_INTERNO` (o
// próximo passo do fluxo), não `DEPENDENCIA_AUSENTE`. Isso evita entrar em
// `executarParse`/`aplicarCarga` — que exigiriam mockar `storage.ts` e os parsers, um andaime
// bem maior do que o que esta missão pede.

function linhaCargaAplicada(overrides: Partial<LinhaCarga> = {}): LinhaCarga {
  return {
    carga_id: 'c-aberto', base: 'lancamentos-aberto', origem: 'rpa-pad', chave_id: null, usuario_id: null,
    idempotencia: null, extraido_em: null, recebido_em: '2026-09-25T14:00:00Z',
    concluido_em: '2026-09-25T14:00:00Z', arquivos: [], linhas: 100, somas: null,
    checksums_conferidos: 1, checksums_falhos: 0, rejeitadas_por_data: 0, pares_novos: null,
    diff: null, status: 'aplicada', erro: null, duracao_ms: 100, resposta: null, observacao: null,
    ...overrides,
  }
}

function entradaOperacao(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
  return {
    base: 'lancamentos-operacao', cargaId: 'carga-teste',
    arquivos: [{ path: 'lancamentos-operacao/2026/09/carga-teste-1-a.csv', nome: 'a.csv', sha256: 'a'.repeat(64) }],
    extraidoEm: null, observacao: null, origem: 'manual', idempotencia: null, confirmar: true,
    chaveId: null, usuarioId: null,
    ...overrides,
  }
}

/** `processarCarga` sempre lança `ErroCarga` em rejeição — este helper captura e TIPA (em vez
 *  de `.catch((e) => e)`, que deixaria `erro` como `unknown` e o `tsc` reprovaria o acesso a
 *  `.codigo`/`.http`/`.detalhe` abaixo). Falha o teste se a promise resolver OU rejeitar com
 *  algo que não seja `ErroCarga`. */
async function capturarErroCarga(p: Promise<unknown>): Promise<ErroCarga> {
  try {
    await p
  } catch (e) {
    if (e instanceof ErroCarga) return e
    throw e
  }
  throw new Error('esperava que processarCarga rejeitasse com ErroCarga')
}

/**
 * Programa o `rpcMock` POR NOME de RPC (fila de respostas por nome), em vez de pela ordem global
 * das chamadas: `processarCarga` faz leituras diferentes conforme o caminho (replay prévio só com
 * `confirmar`, grafo só para bases com pré-requisito), e amarrar os testes à posição de cada
 * chamada quebrava todos a cada leitura nova. `ingestao_carga_obter` sem fila = carga inexistente
 * (é o que o PostgREST devolve: `data: null`).
 */
function rpcPorNome(filas: Record<string, Array<{ data: unknown; error: { message: string } | null }>>) {
  rpcMock.mockImplementation(async (nome: string) => {
    const fila = filas[nome]
    if (fila && fila.length > 0) return fila.shift()
    if (nome === 'ingestao_carga_obter') return { data: null, error: null }
    return { data: null, error: { message: `rpc ${nome} sem resposta programada no teste` } }
  })
}

/** Nomes das RPCs chamadas, em ordem — o que os testes afirmam, sem depender de índice. */
const chamadas = () => rpcMock.mock.calls.map((c) => c[0] as string)

describe('processarCarga — grafo de dependência', () => {
  // Só `Date` é fake — os testes daqui são `async`/`await` em cascata, e faking `setTimeout`
  // junto arrisca prender uma microtask/timer interno do runtime de teste (vitest 5).
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-25T15:00:00Z'))
  })

  it('Operação SEM Aberto do dia (nunca aplicada) ⇒ 409 DEPENDENCIA_AUSENTE; abrirCarga NÃO é chamado; lock liberado', async () => {
    rpcPorNome({ ingestao_carga_ultima: [{ data: null, error: null }] })

    await expect(processarCarga(entradaOperacao({ cargaId: 'carga-409-a' })))
      .rejects.toMatchObject({ codigo: 'DEPENDENCIA_AUSENTE', http: 409 })

    expect(chamadas()).toEqual(['ingestao_carga_obter', 'ingestao_carga_ultima'])
    expect(rpcMock).toHaveBeenCalledWith('ingestao_carga_ultima', { p_base: 'lancamentos-aberto' })
    // Lock liberado pelo `finally` — outra carga da MESMA base consegue travar.
    expect(tentarTravarBase('lancamentos-operacao', 'outra-carga')).toBe(true)
    destravarBase('lancamentos-operacao', 'outra-carga')
  })

  it('Operação com Aberto aplicado ONTEM (não hoje) ⇒ também 409 DEPENDENCIA_AUSENTE', async () => {
    rpcPorNome({ ingestao_carga_ultima: [{ data: linhaCargaAplicada({ concluido_em: '2026-09-24T14:00:00Z' }), error: null }] })

    const erro = await capturarErroCarga(processarCarga(entradaOperacao({ cargaId: 'carga-409-b' })))
    expect(erro.codigo).toBe('DEPENDENCIA_AUSENTE')
    expect(erro.detalhe).toMatchObject({
      faltando: [{ base: 'lancamentos-aberto', ultima_carga_aplicada_em: '2026-09-24T14:00:00Z' }],
    })
    expect(chamadas()).not.toContain('ingestao_carga_abrir')
  })

  it('vale também na CONFERÊNCIA (confirmar:false) — o operador vê o 409 antes de aplicar', async () => {
    rpcPorNome({ ingestao_carga_ultima: [{ data: null, error: null }] })

    await expect(processarCarga(entradaOperacao({ cargaId: 'carga-409-c', confirmar: false })))
      .rejects.toMatchObject({ codigo: 'DEPENDENCIA_AUSENTE', http: 409 })
    // Conferência não faz replay (não há o que repetir) nem abre carga — só o grafo.
    expect(chamadas()).toEqual(['ingestao_carga_ultima'])
  })

  it('Operação COM Aberto aplicado HOJE ⇒ passa do grafo (chega a abrirCarga, não é DEPENDENCIA_AUSENTE)', async () => {
    rpcPorNome({
      ingestao_carga_ultima: [{ data: linhaCargaAplicada({ concluido_em: '2026-09-25T10:00:00Z' }), error: null }],
      ingestao_carga_abrir: [{ data: null, error: { message: 'boom' } }], // falha de propósito: não é o que testamos
    })

    const erro = await capturarErroCarga(processarCarga(entradaOperacao({ cargaId: 'carga-200-a' })))
    expect(erro.codigo).not.toBe('DEPENDENCIA_AUSENTE')
    expect(erro.codigo).toBe('ERRO_INTERNO') // o próximo passo do fluxo (abrirCarga) é quem falhou

    // `abrirCarga` falhou ANTES de marcar `cargaAberta` — `concluirCarga` não é chamado para uma
    // linha que nunca chegou a existir.
    expect(chamadas()).toEqual(['ingestao_carga_obter', 'ingestao_carga_ultima', 'ingestao_carga_abrir'])
    expect(tentarTravarBase('lancamentos-operacao', 'outra-carga-2')).toBe(true)
    destravarBase('lancamentos-operacao', 'outra-carga-2')
  })

  it('leitura da última carga de Aberto FALHA (RPC com erro) ⇒ 500 ERRO_INTERNO, fail-closed; nada aplicado', async () => {
    rpcPorNome({ ingestao_carga_ultima: [{ data: null, error: { message: 'timeout do banco' } }] })

    const erro = await capturarErroCarga(processarCarga(entradaOperacao({ cargaId: 'carga-500-a' })))
    expect(erro.codigo).toBe('ERRO_INTERNO')
    expect(erro.http).toBe(500)
    expect(erro.codigo).not.toBe('DEPENDENCIA_AUSENTE') // "não sei" nunca vira "está lá" nem "não está lá"

    expect(chamadas()).not.toContain('ingestao_carga_abrir') // nada além das leituras rodou
    expect(tentarTravarBase('lancamentos-operacao', 'outra-carga-3')).toBe(true)
    destravarBase('lancamentos-operacao', 'outra-carga-3')
  })

  it('bases SEM pré-requisito bloqueante não leem o grafo', async () => {
    rpcPorNome({ ingestao_carga_abrir: [{ data: null, error: { message: 'boom' } }] }) // falha de propósito

    const erro = await capturarErroCarga(processarCarga(entradaOperacao({
      base: 'demonstrativo-competencia', cargaId: 'carga-sem-grafo',
      arquivos: [{ path: 'demonstrativo-competencia/2026/09/carga-sem-grafo-1-a.xlsx', nome: 'a.xlsx', sha256: 'b'.repeat(64) }],
    })))
    expect(erro.codigo).toBe('ERRO_INTERNO')
    expect(chamadas()).toEqual(['ingestao_carga_obter', 'ingestao_carga_abrir'])
  })

  // Contrato §2.3: idempotência é o passo 1, grafo é o passo 3 — o replay vem ANTES do grafo.
  it('retry de uma Operação JÁ APLICADA, num dia SEM Aberto ⇒ replay 200 idempotente, NÃO 409', async () => {
    const respostaOriginal = { carga_id: 'carga-ontem', base: 'lancamentos-operacao', status: 'aplicada', alarmes: [] }
    rpcPorNome({
      ingestao_carga_obter: [{
        data: linhaCargaAplicada({ carga_id: 'carga-ontem', base: 'lancamentos-operacao', resposta: respostaOriginal }),
        error: null,
      }],
      ingestao_carga_ultima: [{ data: null, error: null }], // Aberto nunca aplicado — o grafo reprovaria
    })

    const resultado = await processarCarga(entradaOperacao({ cargaId: 'carga-ontem' }))
    expect(resultado).toMatchObject({ ...respostaOriginal, idempotente: true })
    // Nem grafo, nem abertura: só a leitura do replay.
    expect(chamadas()).toEqual(['ingestao_carga_obter'])
  })

  it('carga prévia REJEITADA não é repetida: segue para o grafo (e o grafo decide)', async () => {
    rpcPorNome({
      ingestao_carga_obter: [{
        data: linhaCargaAplicada({ carga_id: 'carga-rej', base: 'lancamentos-operacao', status: 'rejeitada', resposta: null }),
        error: null,
      }],
      ingestao_carga_ultima: [{ data: null, error: null }],
    })

    await expect(processarCarga(entradaOperacao({ cargaId: 'carga-rej' })))
      .rejects.toMatchObject({ codigo: 'DEPENDENCIA_AUSENTE', http: 409 })
    expect(chamadas()).toEqual(['ingestao_carga_obter', 'ingestao_carga_ultima'])
  })
})
