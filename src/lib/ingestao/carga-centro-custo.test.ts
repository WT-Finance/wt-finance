import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// v6.5.1 — `processarCarga` DE PONTA A PONTA para a base `lancamentos-centro-custo`. O PARSER é falso
// (o real tem teste e oráculo próprios): o que se afirma aqui é a DECISÃO do fluxo — 1 arquivo, o que
// vai a `aplicarCarga` (arquivoOrigem + checksums por centro), a soma do arquivo, o "antes" do diff e o
// que reprova antes de aplicar. Só o que toca rede/banco é mockado: cliente admin (RPCs), Storage,
// `aplicarCarga` e o disparo do alarme. Dados fictícios.
vi.mock('server-only', () => ({}))

const { rpcMock, aplicarCargaMock, dispararAlarmeMock, lerMatrizMock, parseCentroMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  aplicarCargaMock: vi.fn(),
  dispararAlarmeMock: vi.fn(),
  lerMatrizMock: vi.fn(),
  parseCentroMock: vi.fn(),
}))

vi.mock('@/lib/api-externa/http', () => ({ autenticarChamada: vi.fn() }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaApi: vi.fn() }))

/** `rpc` no PROTÓTIPO e tocando `this` (skill `contrato-rpc-front` §1). */
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
vi.mock('./parsers/lancamentos-centro-custo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./parsers/lancamentos-centro-custo')>()),
  parseLancamentosCentroCustoRows: parseCentroMock,
}))

import { processarCarga, ErroCarga, statusAtualDaBase, validarArquivosDeclarados, type EntradaCarga } from './carga'
import type { LinhaCarga } from './log'

beforeEach(() => {
  vi.clearAllMocks()
  lerMatrizMock.mockReset()
  aplicarCargaMock.mockReset()
  parseCentroMock.mockReset()
  rpcMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-06T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

// ── Andaime ──────────────────────────────────────────────────────────────────────────────────

function linhaCarga(overrides: Partial<LinhaCarga> = {}): LinhaCarga {
  return {
    carga_id: 'c', base: 'lancamentos-centro-custo', origem: 'manual', chave_id: null, usuario_id: 'u',
    idempotencia: null, extraido_em: null, recebido_em: '2026-11-06T14:00:00Z',
    concluido_em: null, arquivos: [], linhas: null, somas: null,
    checksums_conferidos: null, checksums_falhos: null, rejeitadas_por_data: null, pares_novos: null,
    diff: null, status: 'aberta', erro: null, duracao_ms: null, resposta: null, observacao: null,
    ...overrides,
  }
}

type Resp = { data: unknown; error: { message: string } | null }

function programarRpc(extra: Record<string, Resp[]> = {}) {
  const filas: Record<string, Resp[]> = {
    ingestao_carga_ultima: [{
      data: linhaCarga({ status: 'aplicada', concluido_em: '2026-11-05T10:00:00Z', linhas: 5 }), error: null,
    }],
    ingestao_carga_abrir: [{ data: { ...linhaCarga(), existente: false }, error: null }],
    ingestao_carga_concluir: [{ data: linhaCarga({ status: 'aplicada' }), error: null }],
    ...extra,
  }
  rpcMock.mockImplementation(async (nome: string) => {
    const fila = filas[nome]
    if (fila && fila.length > 0) return fila.shift()
    if (nome === 'ingestao_carga_obter') return { data: null, error: null }
    return { data: null, error: { message: `rpc ${nome} sem resposta programada no teste` } }
  })
}

const CHECKSUMS = [
  { escopo: 'centro', chave: ['WG - Corp'], campo: 'valor_centro_custo', linhasDeclaradas: 2, centavosDeclarados: -15000, linhasApuradas: 2, centavosApurados: -15000, centavosArredondados: -15000 },
  { escopo: 'centro', chave: [''], campo: 'valor_centro_custo', linhasDeclaradas: 1, centavosDeclarados: 0, linhasApuradas: 1, centavosApurados: 0, centavosArredondados: 0 },
]
const LINHAS = [
  { linha_origem: 3, numero: '1', centro_custo: 'WG - Corp', valor_centro_custo: -100 },
  { linha_origem: 4, numero: '2', centro_custo: 'WG - Corp', valor_centro_custo: -50.5 },
  { linha_origem: 6, numero: '3', centro_custo: null, valor_centro_custo: 0 },
]

function parseOk(overrides: Record<string, unknown> = {}) {
  return { ok: true, linhas: LINHAS, checksums: CHECKSUMS, datasRejeitadas: [], diagnostico: { outlines: 2 }, ...overrides }
}

function entradaCentro(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
  return {
    base: 'lancamentos-centro-custo', cargaId: 'carga-cc',
    arquivos: [{ path: 'lancamentos-centro-custo/2026/11/carga-cc-0-cc.xlsx', nome: 'cc.xlsx', sha256: 'a'.repeat(64) }],
    extraidoEm: null, observacao: null, origem: 'manual', idempotencia: null, confirmar: true,
    chaveId: null, usuarioId: 'u',
    ...overrides,
  }
}

const aplicacaoOk = (linhas: number) => ({
  linhas, avisos: [] as string[], checksumsConferidos: 2, checksumsNaoConferiveis: 0,
})

const chamadasA = (nome: string) => rpcMock.mock.calls.filter((c) => c[0] === nome)

// ── Lançamentos por Centro de Custo: 1 arquivo, 1 checksum por outline ───────────────────────

describe('processarCarga (Lançamentos por Centro de Custo)', () => {
  beforeEach(() => {
    lerMatrizMock.mockReturnValue([['x']])
  })

  it('APLICAÇÃO: arquivoOrigem único, checksums por centro repassados e Σ do arquivo em parse.soma', async () => {
    programarRpc()
    parseCentroMock.mockReturnValue(parseOk())
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk(3))

    const r = await processarCarga(entradaCentro())

    expect(r.status).toBe('aplicada')
    expect(r.arquivos.map((a) => [a.nome, a.linhas, a.checksums_conferidos])).toEqual([['cc.xlsx', 3, 2]])
    expect(r.parse.linhas).toBe(3)
    expect(r.parse.soma).toBe(-150.5)
    // O "antes" é a contagem da última carga aplicada (5): 3 − 5. Sem `status_*` ⇒ `diff.soma` nulo.
    expect(r.diff.linhas).toBe(-2)
    expect(r.diff.soma).toBeNull()

    expect(aplicarCargaMock).toHaveBeenCalledTimes(1)
    const [base, linhas, opcoes] = aplicarCargaMock.mock.calls[0]
    expect(base).toBe('lancamentos-centro-custo')
    expect(linhas).toHaveLength(3)
    expect(opcoes.cargaId).toBe('carga-cc')
    expect(opcoes.arquivoOrigem).toBe('cc.xlsx')
    expect(opcoes.checksums.map((c: { chave: string[] }) => c.chave)).toEqual([['WG - Corp'], ['']])
  })

  it('CONFERÊNCIA: parseia e confere sem aplicar e sem abrir carga', async () => {
    programarRpc()
    parseCentroMock.mockReturnValue(parseOk())

    const r = await processarCarga(entradaCentro({ confirmar: false }))

    expect(r.status).toBe('conferida')
    expect(r.promocao).toBeNull()
    expect(aplicarCargaMock).not.toHaveBeenCalled()
    expect(chamadasA('ingestao_carga_abrir')).toHaveLength(0)
  })

  it('mutante: checksum que não fecha (o parser devolve CHECKSUM_FALHOU) ⇒ 422 e nada aplicado', async () => {
    programarRpc()
    parseCentroMock.mockReturnValue({
      ok: false, codigo: 'CHECKSUM_FALHOU', mensagem: 'O centro "WG - Corp" não fecha: esperado 3, lido 2.',
    })

    const erro = await processarCarga(entradaCentro()).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroCarga)
    expect((erro as ErroCarga).codigo).toBe('CHECKSUM_FALHOU')
    expect((erro as ErroCarga).http).toBe(422)
    expect(aplicarCargaMock).not.toHaveBeenCalled()
  })

  it('mutante: grupo recolhido (ESTRUTURA_INESPERADA) ⇒ 422 e nada aplicado', async () => {
    programarRpc()
    parseCentroMock.mockReturnValue({
      ok: false, codigo: 'ESTRUTURA_INESPERADA', mensagem: 'O grupo "WG - CSC" está recolhido — exporte com todos os grupos abertos.',
    })

    const erro = await processarCarga(entradaCentro()).catch((e: unknown) => e)

    expect((erro as ErroCarga).codigo).toBe('ESTRUTURA_INESPERADA')
    expect(aplicarCargaMock).not.toHaveBeenCalled()
  })
})

describe('validarArquivosDeclarados (Lançamentos por Centro de Custo)', () => {
  const ARQ = { nome: 'cc.xlsx', bytes: 1000, sha256: 'a'.repeat(64) }

  it('1 arquivo .xlsx passa; 2 arquivos ou .csv reprovam (base de 1 arquivo, só xlsx)', () => {
    expect(validarArquivosDeclarados('lancamentos-centro-custo', [ARQ])).toBeNull()
    expect(validarArquivosDeclarados('lancamentos-centro-custo', [ARQ, { ...ARQ, nome: 'b.xlsx' }])?.codigo).toBe('FORMATO_INVALIDO')
    expect(validarArquivosDeclarados('lancamentos-centro-custo', [{ ...ARQ, nome: 'cc.csv' }])?.codigo).toBe('FORMATO_INVALIDO')
  })
})

describe('statusAtualDaBase (Lançamentos por Centro de Custo)', () => {
  it('lê a contagem da última carga aplicada; base sem carga ⇒ 0; falha de leitura ⇒ null (diff degradado)', async () => {
    programarRpc()
    expect(await statusAtualDaBase('lancamentos-centro-custo')).toEqual({ linhas: 5, somaCentavos: null })

    programarRpc({ ingestao_carga_ultima: [{ data: null, error: null }] })
    expect(await statusAtualDaBase('lancamentos-centro-custo')).toEqual({ linhas: 0, somaCentavos: null })

    programarRpc({ ingestao_carga_ultima: [{ data: null, error: { message: 'BASE_INVALIDA' } }] })
    expect(await statusAtualDaBase('lancamentos-centro-custo')).toBeNull()
  })
})
