import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// v6.4.0 — `processarCarga` DE PONTA A PONTA para a base `contas-receber` (parser REAL; a matriz de
// cada arquivo é entregue por um `lerMatriz` falso) e, desde a v6.5.0, a regressão de que aplicar
// `lancamentos-aberto` NÃO chama mais `registrar_foto_prazos`. Só o que toca rede/banco é mockado: o
// cliente admin (RPCs), o Storage, `aplicarCarga` e o disparo do alarme. O que se afirma é a DECISÃO
// do fluxo: o que é aplicado e o que reprova antes de aplicar. Dados fictícios.
vi.mock('server-only', () => ({}))

const { rpcMock, aplicarCargaMock, dispararAlarmeMock, lerMatrizMock, parseCategoriaMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  aplicarCargaMock: vi.fn(),
  dispararAlarmeMock: vi.fn(),
  lerMatrizMock: vi.fn(),
  parseCategoriaMock: vi.fn(),
}))

vi.mock('@/lib/api-externa/http', () => ({ autenticarChamada: vi.fn() }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaApi: vi.fn() }))

/** `rpc` no PROTÓTIPO e tocando `this` (skill `contrato-rpc-front` §1): um `vi.fn()` solto passaria
 *  com o `this` destacado — e o código de produção chama `.rpc` direto no client. */
class ClienteAdminFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    void alcance
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/admin', () => ({ getAdminClient: () => new ClienteAdminFake() }))

vi.mock('./storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storage')>()),
  ehCaminhoDaCarga: () => true,
  baixarCru: async () => new Uint8Array([1]),
  sha256Confere: () => true,
}))
vi.mock('./matriz', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./matriz')>()),
  lerMatriz: lerMatrizMock,
}))
vi.mock('./aplicar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./aplicar')>()),
  aplicarCarga: aplicarCargaMock,
}))
vi.mock('./alarme', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./alarme')>()),
  somaPorAno: async () => ({}),
  dispararAlarmeDeEvento: dispararAlarmeMock,
}))
// Só o Aberto usa este parser — o teste de regressão do Aberto não precisa montar um outline de Excel.
vi.mock('./parsers/lancamentos-categoria', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./parsers/lancamentos-categoria')>()),
  parseLancamentosCategoriaRows: parseCategoriaMock,
}))

import { processarCarga, ErroCarga, reconciliarContasReceber, statusAtualDaBase, type EntradaCarga } from './carga'
import type { LinhaCarga } from './log'

beforeEach(() => {
  vi.clearAllMocks()
  // `clearAllMocks` não esvazia a fila de `mockReturnValueOnce` — um teste que lança antes de
  // consumi-la vazaria matrizes para o seguinte.
  lerMatrizMock.mockReset()
  aplicarCargaMock.mockReset()
  parseCategoriaMock.mockReset()
  rpcMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

// ── Andaime ──────────────────────────────────────────────────────────────────────────────────

function linhaCarga(overrides: Partial<LinhaCarga> = {}): LinhaCarga {
  return {
    carga_id: 'c', base: 'contas-receber', origem: 'manual', chave_id: null, usuario_id: 'u',
    idempotencia: null, extraido_em: null, recebido_em: '2026-10-15T14:00:00Z',
    concluido_em: null, arquivos: [], linhas: null, somas: null,
    checksums_conferidos: null, checksums_falhos: null, rejeitadas_por_data: null, pares_novos: null,
    diff: null, status: 'aberta', erro: null, duracao_ms: null, resposta: null, observacao: null,
    ...overrides,
  }
}

type Resp = { data: unknown; error: { message: string } | null }

/** Programa o `rpcMock` POR NOME (fila por nome). */
function programarRpc(extra: Record<string, Resp[]> = {}) {
  const filas: Record<string, Resp[]> = {
    ingestao_carga_ultima: [{
      data: linhaCarga({ status: 'aplicada', concluido_em: '2026-10-14T10:00:00Z', linhas: 5 }), error: null,
    }],
    ingestao_carga_abrir: [{ data: { ...linhaCarga(), existente: false }, error: null }],
    ingestao_carga_concluir: [{ data: linhaCarga({ status: 'aplicada' }), error: null }],
    status_titulos_em_aberto: [{ data: { total: 10 }, error: null }],
    ...extra,
  }
  rpcMock.mockImplementation(async (nome: string) => {
    const fila = filas[nome]
    if (fila && fila.length > 0) return fila.shift()
    if (nome === 'ingestao_carga_obter') return { data: null, error: null }
    return { data: null, error: { message: `rpc ${nome} sem resposta programada no teste` } }
  })
}

const CABECALHO = ['Número', 'Emissão', 'Pessoa', 'Descrição', 'Vencimento', 'Liquidação', 'Valor Final', 'Conferido', 'Operação Própria']

function titulo(numero: string, vencimento: Date, valor: number, emissao: Date = new Date(2026, 0, 5)): unknown[] {
  return [numero, emissao, 'Cliente Ficticio', 'Pagamento venda', vencimento, null, valor, null, null]
}
/** Arquivo coerente: cabeçalho + títulos + a linha de total que fecha. */
function matriz(titulos: unknown[][]): unknown[][] {
  const soma = titulos.reduce((s, t) => s + (t[6] as number), 0)
  return [CABECALHO, ...titulos, [titulos.length, null, null, null, null, null, soma, null, null]]
}

function entradaContas(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
  return {
    base: 'contas-receber', cargaId: 'carga-cr',
    arquivos: [
      { path: 'contas-receber/2026/10/carga-cr-0-24.xlsx', nome: '24.xlsx', sha256: 'a'.repeat(64) },
      { path: 'contas-receber/2026/10/carga-cr-1-25.xlsx', nome: '25.xlsx', sha256: 'b'.repeat(64) },
    ],
    extraidoEm: null, observacao: null, origem: 'manual', idempotencia: null, confirmar: true,
    chaveId: null, usuarioId: 'u',
    ...overrides,
  }
}

const aplicacaoOk = (linhas: number) => ({
  linhas, avisos: [] as string[], checksumsConferidos: 2, checksumsNaoConferiveis: 0,
})

const chamadasA = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome)

// ── Contas a receber: N arquivos, 1 checksum por arquivo ─────────────────────────────────────

describe('processarCarga (Contas a receber)', () => {
  function programarDoisArquivos() {
    lerMatrizMock
      .mockReturnValueOnce(matriz([titulo('1', new Date(2024, 0, 10), 100), titulo('2', new Date(2024, 11, 31), 50.5)]))
      .mockReturnValueOnce(matriz([titulo('3', new Date(2025, 0, 1), 200)]))
  }

  it('APLICAÇÃO com 2 arquivos: 1 checksum por arquivo, linhas unidas, sem arquivoOrigem único', async () => {
    programarRpc()
    programarDoisArquivos()
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk(3))

    const r = await processarCarga(entradaContas())

    expect(r.status).toBe('aplicada')
    expect(r.arquivos.map((a) => [a.nome, a.linhas, a.checksums_conferidos])).toEqual([['24.xlsx', 2, 1], ['25.xlsx', 1, 1]])
    expect(r.parse.linhas).toBe(3)
    expect(r.parse.soma).toBe(350.5)
    // O "antes" do diff é a contagem da última carga aplicada (5): 3 − 5.
    expect(r.diff.linhas).toBe(-2)
    expect(r.diff.soma).toBeNull()

    expect(aplicarCargaMock).toHaveBeenCalledTimes(1)
    const [base, linhas, opcoes] = aplicarCargaMock.mock.calls[0]
    expect(base).toBe('contas-receber')
    expect(linhas).toHaveLength(3)
    expect(opcoes.cargaId).toBe('carga-cr')
    expect(opcoes.arquivoOrigem).toBeUndefined()
    expect(opcoes.checksums.map((c: { chave: string[] }) => c.chave)).toEqual([['24.xlsx'], ['25.xlsx']])
  })

  it('CONFERÊNCIA: parseia e confere sem aplicar e sem abrir carga; Emissão inválida chega em alarmes', async () => {
    programarRpc()
    lerMatrizMock
      .mockReturnValueOnce(matriz([titulo('1', new Date(2024, 0, 10), 100, new Date(1899, 11, 30))]))
      .mockReturnValueOnce(matriz([titulo('3', new Date(2025, 0, 1), 200)]))

    const r = await processarCarga(entradaContas({ confirmar: false }))

    expect(r.status).toBe('conferida')
    expect(r.promocao).toBeNull()
    expect(r.parse.rejeitadas_por_data).toBe(1)
    expect(r.alarmes.some((a) => a.startsWith('1 título(s) com Emissão inválida'))).toBe(true)
    expect(aplicarCargaMock).not.toHaveBeenCalled()
    expect(chamadasA('ingestao_carga_abrir')).toHaveLength(0)
  })

  it('lacuna entre as faixas de vencimento vira aviso e NÃO bloqueia a aplicação', async () => {
    programarRpc()
    lerMatrizMock
      .mockReturnValueOnce(matriz([titulo('1', new Date(2024, 0, 1), 10), titulo('2', new Date(2024, 11, 31), 10)]))
      .mockReturnValueOnce(matriz([titulo('3', new Date(2025, 2, 1), 10)]))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk(3))

    const r = await processarCarga(entradaContas())

    expect(r.status).toBe('aplicada')
    expect(r.alarmes.some((a) => a.startsWith('Lacuna entre as faixas de vencimento'))).toBe(true)
  })

  it('mutante: Número repetido ENTRE arquivos ⇒ 422 CONJUNTO_NAO_RECONCILIA, nada aplicado, carga gravada como rejeitada', async () => {
    programarRpc()
    lerMatrizMock
      .mockReturnValueOnce(matriz([titulo('7', new Date(2024, 5, 1), 10), titulo('8', new Date(2024, 5, 2), 10)]))
      .mockReturnValueOnce(matriz([titulo('7', new Date(2025, 0, 1), 10)]))

    const erro = await processarCarga(entradaContas()).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroCarga)
    const e = erro as ErroCarga
    expect(e.codigo).toBe('CONJUNTO_NAO_RECONCILIA')
    expect(e.http).toBe(422)
    expect(e.message).toContain('1 "Número"')
    expect(e.message).toContain('1 em mais de um arquivo')
    expect(aplicarCargaMock).not.toHaveBeenCalled()
    const concluir = chamadasA('ingestao_carga_concluir').at(-1)?.[1] as { p_status?: string } | undefined
    expect(concluir?.p_status).toBe('rejeitada')
  })

  it('mutante: checksum de um arquivo não fecha ⇒ 422 CHECKSUM_FALHOU e nada aplicado', async () => {
    programarRpc()
    const ruim = matriz([titulo('1', new Date(2024, 0, 10), 100)])
    ruim[ruim.length - 1][6] = 1
    lerMatrizMock.mockReturnValueOnce(ruim).mockReturnValueOnce(matriz([titulo('3', new Date(2025, 0, 1), 200)]))

    const erro = await processarCarga(entradaContas()).catch((e: unknown) => e)

    expect((erro as ErroCarga).codigo).toBe('CHECKSUM_FALHOU')
    expect(aplicarCargaMock).not.toHaveBeenCalled()
  })
})

describe('reconciliarContasReceber', () => {
  it('sem repetição ⇒ null; repetido dentro de um mesmo arquivo também reprova (e é contado à parte)', () => {
    expect(reconciliarContasReceber([
      { numero: '1', arquivo_origem: 'a' }, { numero: '2', arquivo_origem: 'a' }, { numero: '3', arquivo_origem: 'b' },
    ])).toBeNull()
    const e = reconciliarContasReceber([
      { numero: '1', arquivo_origem: 'a' }, { numero: '1', arquivo_origem: 'a' }, { numero: '2', arquivo_origem: 'a' },
      { numero: '2', arquivo_origem: 'b' }, { numero: '3', arquivo_origem: 'b' },
    ])
    expect(e?.codigo).toBe('CONJUNTO_NAO_RECONCILIA')
    expect(e?.message).toContain('2 "Número"')
    expect(e?.message).toContain('1 em mais de um arquivo')
    expect(e?.message).toContain('1 repetido(s) dentro de um mesmo arquivo')
  })

  it('o detalhe nunca carrega mais do que Número e nome de arquivo', () => {
    const e = reconciliarContasReceber([
      { numero: '9', arquivo_origem: 'a' }, { numero: '9', arquivo_origem: 'b' },
    ])
    expect(e?.detalhe).toEqual({ repetidos: [{ numero: '9', arquivos: ['a', 'b'] }], total: 1, entre_arquivos: 1 })
  })
})

describe('statusAtualDaBase (Contas a receber)', () => {
  it('lê a contagem da última carga aplicada; base sem carga ⇒ 0; falha de leitura ⇒ null (diff degradado)', async () => {
    programarRpc()
    expect(await statusAtualDaBase('contas-receber')).toEqual({ linhas: 5, somaCentavos: null })

    programarRpc({ ingestao_carga_ultima: [{ data: null, error: null }] })
    expect(await statusAtualDaBase('contas-receber')).toEqual({ linhas: 0, somaCentavos: null })

    programarRpc({ ingestao_carga_ultima: [{ data: null, error: { message: 'BASE_INVALIDA' } }] })
    expect(await statusAtualDaBase('contas-receber')).toBeNull()
  })
})

// ── Regressão v6.5.0: aplicar `lancamentos-aberto` não grava mais a foto de prazos ───────────

describe('lancamentos-aberto — sem foto de prazos (v6.5.0)', () => {
  const LINHA_ABERTO = { numero: '1', valor: 10 }
  function entradaAberto(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
    return {
      ...entradaContas({ base: 'lancamentos-aberto', cargaId: 'carga-ab' }),
      arquivos: [{ path: 'lancamentos-aberto/2026/10/carga-ab-0-a.xlsx', nome: 'a.xlsx', sha256: 'c'.repeat(64) }],
      ...overrides,
    }
  }
  beforeEach(() => {
    lerMatrizMock.mockReturnValue([['x']])
    parseCategoriaMock.mockReturnValue({
      ok: true, linhas: [LINHA_ABERTO], checksums: [], datasRejeitadas: [], diagnostico: {},
    })
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk(1))
  })

  it('aplicou: NENHUMA chamada a registrar_foto_prazos e nenhum aviso de prazos em alarmes (a série foi removida do banco)', async () => {
    programarRpc()
    const r = await processarCarga(entradaAberto())

    // Prova de que o fluxo aplicou de verdade (e não saiu cedo): promoção feita e carga concluída.
    expect(r.status).toBe('aplicada')
    expect(aplicarCargaMock).toHaveBeenCalledTimes(1)
    const concluir = chamadasA('ingestao_carga_concluir').at(-1)?.[1] as { p_status: string; p_resposta: { alarmes: string[] } }
    expect(concluir.p_status).toBe('aplicada')

    // O que torna a migration destrutiva segura: o código no ar não chama a RPC que ela derruba.
    expect(chamadasA('registrar_foto_prazos')).toHaveLength(0)
    expect(r.alarmes.some((a) => /prazo/i.test(a))).toBe(false)
    expect(concluir.p_resposta.alarmes.some((a) => /prazo/i.test(a))).toBe(false)
  })
})
