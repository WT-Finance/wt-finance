import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Errata 4(b)/(c) do contrato de ingestão v1 (v6.1.0/M2-B): o conjunto de operações da base viva
// × o do arquivo, `puladas`, e os dois alarmes novos. Aqui `processarCarga` roda DE PONTA A PONTA
// para Lançamentos por Operação, com o parser REAL (a matriz do CSV é montada na mão e entregue
// por um `lerMatriz` falso) e só o que toca rede/banco mockado: o cliente admin (RPCs), o Storage,
// `aplicarCarga` e o disparo do alarme (`dispararAlarmeDeEvento` — o e-mail em si é provado em
// `email/alarme-ingestao.test.ts`). O que o teste afirma é a DECISÃO: qual alarme, com que
// conteúdo, e o que fica gravado em `ingestao.carga` — inclusive quando a carga não aplica.
vi.mock('server-only', () => ({}))

const { rpcMock, aplicarCargaMock, dispararAlarmeMock, lerMatrizMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  aplicarCargaMock: vi.fn(),
  dispararAlarmeMock: vi.fn(),
  lerMatrizMock: vi.fn(),
}))

vi.mock('@/lib/api-externa/http', () => ({ autenticarChamada: vi.fn() }))
vi.mock('@/lib/auth/sessao', () => ({ requireAreaApi: vi.fn() }))

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

import {
  processarCarga, ErroCarga, lerOperacoesVigentes, compararConjuntoDeOperacoes, operacoesDoArquivo,
  type EntradaCarga,
} from './carga'
import { CargaRejeitada, PromocaoIncerta } from './aplicar'
import type { LinhaCarga } from './log'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // Só `Date` é fake (mesmo cuidado de carga.test.ts). O grafo exige Aberto aplicado HOJE (SP).
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-25T15:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

// ── Andaime ──────────────────────────────────────────────────────────────────────────────────

function linhaCarga(overrides: Partial<LinhaCarga> = {}): LinhaCarga {
  return {
    carga_id: 'c', base: 'lancamentos-operacao', origem: 'rpa-pad', chave_id: null, usuario_id: null,
    idempotencia: null, extraido_em: null, recebido_em: '2026-09-25T14:00:00Z',
    concluido_em: null, arquivos: [], linhas: null, somas: null,
    checksums_conferidos: null, checksums_falhos: null, rejeitadas_por_data: null, pares_novos: null,
    diff: null, status: 'aberta', erro: null, duracao_ms: null, resposta: null, observacao: null,
    ...overrides,
  }
}

type Resp = { data: unknown; error: { message: string } | null }
let antesDaPromocao: { operacao: string; operacao_id: string | null }[] | undefined

/** Programa o `rpcMock` POR NOME (fila por nome). Padrões: replay sem carga prévia; grafo com Aberto
 *  aplicado hoje; abrir/concluir devolvem uma linha válida; o status da base tem 3 linhas. */
function programarRpc(extra: Record<string, Resp[]> = {}) {
  const previa = extra.ingestao_operacoes_vigentes?.[0]?.data
  antesDaPromocao = Array.isArray(previa) ? (previa as { operacao: string; operacao_id: string | null }[]) : undefined
  const filas: Record<string, Resp[]> = {
    ingestao_carga_ultima: [{
      data: linhaCarga({ base: 'lancamentos-aberto', status: 'aplicada', concluido_em: '2026-09-25T10:00:00Z' }),
      error: null,
    }],
    ingestao_carga_abrir: [{ data: { ...linhaCarga(), existente: false }, error: null }],
    ingestao_carga_concluir: [{ data: linhaCarga({ status: 'aplicada' }), error: null }],
    get_upload_status: [{ data: { lancamentos: { total: 3 } }, error: null }],
    ...extra,
  }
  rpcMock.mockImplementation(async (nome: string) => {
    const fila = filas[nome]
    if (fila && fila.length > 0) return fila.shift()
    if (nome === 'ingestao_carga_obter') return { data: null, error: null }
    return { data: null, error: { message: `rpc ${nome} sem resposta programada no teste` } }
  })
}

const CABECALHO = ['Lançamento N°', 'Venda', 'Pessoa', 'Descrição', 'Liquidação', 'Valor', 'Operacao', 'Tipo']

/** Matriz do CSV: uma linha de lançamento por operação. `comId` acrescenta a coluna `Operacao_Id`. */
function matrizDoCsv(ops: readonly { nome: string; id?: string }[], comId: boolean): unknown[][] {
  const linhas = ops.map((o, i) => [
    String(1000 + i), '10', 'Fulano', 'descrição', '10/09/2026', 'R$ 100,00', o.nome, 'Entrada',
    ...(comId ? [o.id ?? ''] : []),
  ])
  return [comId ? [...CABECALHO, 'Operacao_Id'] : CABECALHO, ...linhas]
}

function entrada(overrides: Partial<EntradaCarga> = {}): EntradaCarga {
  return {
    base: 'lancamentos-operacao', cargaId: 'carga-op',
    arquivos: [{ path: 'lancamentos-operacao/2026/09/carga-op-1-a.csv', nome: 'a.csv', sha256: 'a'.repeat(64) }],
    extraidoEm: null, observacao: null, origem: 'rpa-pad', idempotencia: null, confirmar: true,
    chaveId: 7, usuarioId: null,
    ...overrides,
  }
}

const ALPHA = 'W - Alpha'
const BETA = 'W - Beta'
const GAMA = 'W - Gama'
const antesPorNome = (...nomes: string[]): Resp => ({
  data: nomes.map((operacao) => ({ operacao, operacao_id: null })), error: null,
})
/** O que a promoção devolve por padrão: a MESMA base que a leitura prévia viu (`antesDaPromocao`,
 *  gravado por `programarRpc`) — o caminho normal, sem retentativa nem carga intercalada. */
const aplicacaoOk = () => ({
  linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1,
  operacoesAntes: antesDaPromocao,
})

/** O `p_diff` que `ingestao_carga_concluir` recebeu (a última chamada). */
function diffGravado(): Record<string, unknown> | null {
  const chamadasConcluir = rpcMock.mock.calls.filter((c) => c[0] === 'ingestao_carga_concluir')
  const args = chamadasConcluir.at(-1)?.[1] as { p_diff?: Record<string, unknown> | null } | undefined
  return args?.p_diff ?? null
}
const statusGravado = () =>
  (rpcMock.mock.calls.filter((c) => c[0] === 'ingestao_carga_concluir').at(-1)?.[1] as { p_status?: string } | undefined)?.p_status

// ── Aplicação × conferência ──────────────────────────────────────────────────────────────────

describe('processarCarga (Operação) — conjunto de operações', () => {
  it('APLICAÇÃO com uma operação a menos ⇒ operacoes_removidas na resposta, no log e alarme operacoes_removidas', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada())

    expect(r.status).toBe('aplicada')
    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    expect(r.diff.operacoes_novas).toEqual([])
    expect(r.diff.puladas).toEqual([])
    // O "antes" é lido ANTES da promoção — a promoção trunca raw e fato.
    const idxVigentes = rpcMock.mock.calls.findIndex((c) => c[0] === 'ingestao_operacoes_vigentes')
    expect(idxVigentes).toBeGreaterThan(-1)
    expect(rpcMock.mock.invocationCallOrder[idxVigentes]).toBeLessThan(aplicarCargaMock.mock.invocationCallOrder[0])
    expect(dispararAlarmeMock).toHaveBeenCalledTimes(1)
    expect(dispararAlarmeMock).toHaveBeenCalledWith(
      { tipo: 'operacoes_removidas', cargaId: 'carga-op', operacoes: [GAMA] },
      'lancamentos-operacao:carga-op',
    )
    // O diff (com os três campos) vai para a linha de carga.
    expect(diffGravado()).toMatchObject({
      operacoes_removidas: [{ operacao: GAMA, operacao_id: null }], operacoes_novas: [], puladas: [],
    })
  })

  it('CONFERÊNCIA com a mesma operação a menos ⇒ os campos vêm na resposta; NENHUM alarme, NENHUMA linha', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))

    const r = await processarCarga(entrada({ confirmar: false, chaveId: 7 }))

    expect(r.status).toBe('conferida')
    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    expect(r.diff.operacoes_novas).toEqual([])
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
    expect(aplicarCargaMock).not.toHaveBeenCalled()
    const nomes = rpcMock.mock.calls.map((c) => c[0] as string)
    expect(nomes).not.toContain('ingestao_carga_abrir')
    expect(nomes).not.toContain('ingestao_carga_concluir')
  })

  it('operação NOVA aparece em operacoes_novas e não alarma; espaço duplo no nome do "antes" não gera falsa remoção', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome('W -  Alpha')] }) // legado com espaço duplo
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([])
    expect(r.diff.operacoes_novas).toEqual([{ operacao: BETA, operacao_id: null }])
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })

  it('puladas NÃO vazia ⇒ alarme operacoes_puladas (nomes e motivos) e puladas ecoadas em diff', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())
    const puladas = [{ operacao: 'W - Delta', ids: ['id-1', 'id-2'], motivo: 'nome ambíguo no dropdown' }]

    const r = await processarCarga(entrada({ puladas }))

    expect(r.diff.puladas).toEqual(puladas)
    expect(r.diff.operacoes_removidas).toEqual([]) // nada sumiu: só puladas
    expect(dispararAlarmeMock).toHaveBeenCalledTimes(1)
    expect(dispararAlarmeMock).toHaveBeenCalledWith(
      { tipo: 'operacoes_puladas', cargaId: 'carga-op', puladas: [{ operacao: 'W - Delta', motivo: 'nome ambíguo no dropdown' }] },
      'lancamentos-operacao:carga-op',
    )
    expect(diffGravado()).toMatchObject({ puladas })
  })

  it('operação removida que CONSTA em puladas ⇒ os DOIS alarmes (a remoção não é engolida pela causa)', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    await processarCarga(entrada({ puladas: [{ operacao: GAMA, ids: [], motivo: 'ausente no dropdown' }] }))

    const tipos = dispararAlarmeMock.mock.calls.map((c) => (c[0] as { tipo: string }).tipo)
    expect(tipos).toEqual(['operacoes_puladas', 'operacoes_removidas'])
    expect(dispararAlarmeMock.mock.calls[1][0]).toMatchObject({ operacoes: [GAMA] })
  })

  it('puladas na CONFERÊNCIA aparecem só na resposta — nenhum alarme', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    const puladas = [{ operacao: 'W - Delta', ids: [], motivo: 'x' }]

    const r = await processarCarga(entrada({ confirmar: false, puladas }))

    expect(r.diff.puladas).toEqual(puladas)
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })
})

// ── Critério: operacao_id × nome ─────────────────────────────────────────────────────────────

describe('processarCarga (Operação) — critério por operacao_id × por nome', () => {
  it('arquivo COM Operacao_Id e "antes" com id em todo item ⇒ compara por id: renomeação NÃO é remoção', async () => {
    programarRpc({
      ingestao_operacoes_vigentes: [{
        data: [
          { operacao: ALPHA, operacao_id: 'AAAA-1' }, // maiúsculas no id: normaliza
          { operacao: BETA, operacao_id: 'bbbb-2' },
        ],
        error: null,
      }],
    })
    lerMatrizMock.mockReturnValue(matrizDoCsv([
      { nome: 'W - Alpha Renomeada', id: 'aaaa-1' }, { nome: BETA, id: 'bbbb-2' },
    ], true))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([])
    expect(r.diff.operacoes_novas).toEqual([])
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })

  it('arquivo COM Operacao_Id, mas o "antes" NÃO tem id (carga anterior sem a coluna) ⇒ compara por NOME', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([
      { nome: 'W - Alpha Renomeada', id: 'aaaa-1' }, { nome: BETA, id: 'bbbb-2' },
    ], true))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada())

    // Por nome, a renomeação vira "removida + nova" — e o `operacao_id` da nova já sai preenchido.
    expect(r.diff.operacoes_removidas).toEqual([{ operacao: ALPHA, operacao_id: null }])
    expect(r.diff.operacoes_novas).toEqual([{ operacao: 'W - Alpha Renomeada', operacao_id: 'aaaa-1' }])
    expect(dispararAlarmeMock).toHaveBeenCalledWith(
      { tipo: 'operacoes_removidas', cargaId: 'carga-op', operacoes: [ALPHA] }, expect.any(String),
    )
  })

  it('por id: operação cujo id SUMIU do arquivo é removida, mesmo que o nome exista com outro id', async () => {
    programarRpc({
      ingestao_operacoes_vigentes: [{
        data: [{ operacao: ALPHA, operacao_id: 'id-a' }, { operacao: BETA, operacao_id: 'id-b' }], error: null,
      }],
    })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA, id: 'id-a' }, { nome: BETA, id: 'id-b-novo' }], true))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([{ operacao: BETA, operacao_id: 'id-b' }])
    expect(r.diff.operacoes_novas).toEqual([{ operacao: BETA, operacao_id: 'id-b-novo' }])
  })
})

// ── Falha ao ler o "antes" ───────────────────────────────────────────────────────────────────

describe('processarCarga (Operação) — falha ao ler o conjunto "antes"', () => {
  it('APLICAÇÃO ⇒ NÃO aplica: 500 ERRO_INTERNO, carga gravada como `erro` (diff com null + puladas), sem alarme', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [{ data: null, error: { message: 'PGRST202 função ausente' } }] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    const puladas = [{ operacao: 'W - Delta', ids: [], motivo: 'x' }]

    const erro = await processarCarga(entrada({ puladas })).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroCarga)
    expect(erro).toMatchObject({ codigo: 'ERRO_INTERNO', http: 500 })
    expect(aplicarCargaMock).not.toHaveBeenCalled()
    expect(statusGravado()).toBe('erro')
    expect(diffGravado()).toMatchObject({ operacoes_removidas: null, operacoes_novas: null, puladas })
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })

  it('CONFERÊNCIA ⇒ campos null + aviso "não medido" em alarmes; puladas ecoadas; nada aplicado', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [{ data: null, error: { message: 'timeout' } }] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    const puladas = [{ operacao: 'W - Delta', ids: [], motivo: 'x' }]

    const r = await processarCarga(entrada({ confirmar: false, puladas }))

    expect(r.status).toBe('conferida')
    expect(r.diff.operacoes_removidas).toBeNull()
    expect(r.diff.operacoes_novas).toBeNull()
    expect(r.diff.puladas).toEqual(puladas)
    expect(r.alarmes.some((a) => a.includes('não medido') || a.includes('não medidos'))).toBe(true)
    expect(aplicarCargaMock).not.toHaveBeenCalled()
  })

  it('resposta fora do formato (data null / item sem operacao) NUNCA vira "lista vazia"', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [{ data: null, error: null }] })
    expect(await lerOperacoesVigentes()).toBeNull()
    programarRpc({ ingestao_operacoes_vigentes: [{ data: [{ operacao_id: 'x' }], error: null }] })
    expect(await lerOperacoesVigentes()).toBeNull()
    programarRpc({ ingestao_operacoes_vigentes: [{ data: { operacao: 'não é array' }, error: null }] })
    expect(await lerOperacoesVigentes()).toBeNull()
  })

  it('RPC que LANÇA (rede) também devolve null, nunca propaga nem vira []', async () => {
    rpcMock.mockRejectedValueOnce(new Error('ECONNRESET'))
    expect(await lerOperacoesVigentes()).toBeNull()
  })

  it('lista válida (inclusive vazia) é devolvida como veio', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [{ data: [], error: null }] })
    expect(await lerOperacoesVigentes()).toEqual([])
    programarRpc({ ingestao_operacoes_vigentes: [{ data: [{ operacao: ALPHA, operacao_id: null }], error: null }] })
    expect(await lerOperacoesVigentes()).toEqual([{ operacao: ALPHA, operacao_id: null }])
  })
})

// ── Rejeição depois do diff ──────────────────────────────────────────────────────────────────

describe('processarCarga (Operação) — carga REJEITADA depois de calcular o diff', () => {
  it('o diff (conjunto + puladas) é gravado também na rejeição; nenhum alarme de operação', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockRejectedValue(new CargaRejeitada('validacao', 'linhas inválidas'))
    const puladas = [{ operacao: BETA, ids: [], motivo: 'ausente no dropdown' }]

    const erro = await processarCarga(entrada({ puladas })).catch((e: unknown) => e)

    expect(erro).toMatchObject({ codigo: 'ESTRUTURA_INESPERADA', http: 422 })
    expect(statusGravado()).toBe('rejeitada')
    expect(diffGravado()).toMatchObject({
      operacoes_removidas: [{ operacao: BETA, operacao_id: null }], puladas,
    })
    // Os alarmes de operação são da carga APLICADA; a rejeição alarma como `checksum_falho`.
    const tipos = dispararAlarmeMock.mock.calls.map((c) => (c[0] as { tipo: string }).tipo)
    expect(tipos).toEqual(['checksum_falho'])
  })
})

// ── O "antes" que vale é o da PROMOÇÃO (0288) ────────────────────────────────────────────────

describe('processarCarga (Operação) — o conjunto "antes" vem da promoção', () => {
  it('RETENTATIVA depois de promoção JÁ commitada: o pré-lido já é a base nova, a promoção devolve o ORIGINAL ⇒ removida + alarme', async () => {
    // A 1ª tentativa trocou o fato e o processo morreu antes de alarmar/concluir. Na repetição, a
    // leitura prévia vê a base NOVA (igual ao arquivo ⇒ "nenhuma removida"); `promover_carga_operacao`
    // devolve o `operacoes_antes` guardado em `ingestao.promocao` — com a operação que sumiu.
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockResolvedValue({
      linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1,
      operacoesAntes: [
        { operacao: ALPHA, operacao_id: null }, { operacao: BETA, operacao_id: null }, { operacao: GAMA, operacao_id: null },
      ],
    })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    expect(dispararAlarmeMock).toHaveBeenCalledTimes(1)
    expect(dispararAlarmeMock).toHaveBeenCalledWith(
      { tipo: 'operacoes_removidas', cargaId: 'carga-op', operacoes: [GAMA] }, 'lancamentos-operacao:carga-op',
    )
    expect(diffGravado()).toMatchObject({ operacoes_removidas: [{ operacao: GAMA, operacao_id: null }] })
    expect(r.alarmes.some((a) => a.includes(GAMA) && a.includes('NÃO estão no arquivo'))).toBe(true)
    // Com `operacoes_antes` presente não há aviso de fallback.
    expect(r.alarmes.some((a) => a.includes('operacoes_antes'))).toBe(false)
  })

  it('a promoção também manda no critério: operação NOVA no arquivo segundo o "antes" da promoção', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockResolvedValue({
      linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1,
      operacoesAntes: [{ operacao: ALPHA, operacao_id: null }],
    })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_novas).toEqual([{ operacao: BETA, operacao_id: null }])
    expect(r.diff.operacoes_removidas).toEqual([])
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })

  it.each([['undefined', undefined], ['null', null]])(
    'promoção sem operacoes_antes (%s) ⇒ usa o pré-lido, alarma por ele e AVISA em alarmes[]', async (_n, antes) => {
      programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA, GAMA)] })
      lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
      aplicarCargaMock.mockResolvedValue({
        linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1, operacoesAntes: antes,
      })

      const r = await processarCarga(entrada())

      expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
      expect(dispararAlarmeMock).toHaveBeenCalledWith(
        { tipo: 'operacoes_removidas', cargaId: 'carga-op', operacoes: [GAMA] }, expect.any(String),
      )
      expect(r.alarmes.some((a) => a.includes('operacoes_antes'))).toBe(true)
    },
  )
})

describe('processarCarga (Operação) — RETENTATIVA sem operacoes_antes (o pré-lido pode já ser a base nova)', () => {
  const abrirExistente = (status: string): Record<string, Resp[]> => ({
    ingestao_carga_abrir: [{ data: { ...linhaCarga({ status: status as LinhaCarga['status'] }), existente: true }, error: null }],
  })

  it.each([['undefined', undefined], ['null', null]])(
    'linha de carga JÁ existente + operacoes_antes %s ⇒ removidas/novas null ("não medido") na resposta e no log; NUNCA []; sem alarme de remoção', async (_n, antes) => {
      // Pré-lido = arquivo (a 1ª tentativa já trocou a base): usá-lo daria [] — o silêncio proibido.
      programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)], ...abrirExistente('aberta') })
      lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
      aplicarCargaMock.mockResolvedValue({
        linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1, operacoesAntes: antes,
      })

      const r = await processarCarga(entrada())

      expect(r.status).toBe('aplicada')
      expect(r.diff.operacoes_removidas).toBeNull()
      expect(r.diff.operacoes_novas).toBeNull()
      expect(diffGravado()).toMatchObject({ operacoes_removidas: null, operacoes_novas: null })
      expect(r.alarmes.some((a) => a.includes('não medido') && a.includes('conferir manualmente as operações da base'))).toBe(true)
      expect(dispararAlarmeMock).not.toHaveBeenCalled()
    },
  )

  it('retentativa de carga `rejeitada`/`erro` anterior (existente, não aplicada) segue a mesma regra', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA)], ...abrirExistente('erro') })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockResolvedValue({ linhas: 1, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1 })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toBeNull()
    expect(r.diff.operacoes_novas).toBeNull()
  })

  it('carga NOVA (existente:false) + operacoes_antes ausente ⇒ usa o pré-lido + aviso (não vira null)', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockResolvedValue({ linhas: 1, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1 })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    expect(dispararAlarmeMock).toHaveBeenCalledTimes(1)
    expect(r.alarmes.some((a) => a.includes('operacoes_antes'))).toBe(true)
  })

  it('retentativa COM operacoes_antes presente segue valendo o da promoção (não vira null)', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA)], ...abrirExistente('aberta') })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockResolvedValue({
      linhas: 1, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1,
      operacoesAntes: [{ operacao: ALPHA, operacao_id: null }, { operacao: GAMA, operacao_id: null }],
    })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    expect(dispararAlarmeMock).toHaveBeenCalledTimes(1)
  })
})

describe('processarCarga (Operação) — promoção de resultado INCERTO (falha de transporte)', () => {
  it('PromocaoIncerta ⇒ 500 ERRO_INTERNO, linha `erro` (não `rejeitada`), SEM alarme checksum_falho', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockRejectedValue(new PromocaoIncerta('promover_carga_operacao', 'estado incerto: conferir ingestao.promocao'))

    const erro = await processarCarga(entrada()).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroCarga)
    expect(erro).toMatchObject({ codigo: 'ERRO_INTERNO', http: 500 })
    expect((erro as ErroCarga).message).toContain('estado incerto')
    expect(statusGravado()).toBe('erro')
    expect(dispararAlarmeMock).not.toHaveBeenCalled()
  })

  it('CargaRejeitada segue 422 ESTRUTURA_INESPERADA, linha `rejeitada` e alarme checksum_falho (Postgres respondeu)', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockRejectedValue(new CargaRejeitada('promover_carga_operacao', 'base preservada'))

    const erro = await processarCarga(entrada()).catch((e: unknown) => e)

    expect(erro).toMatchObject({ codigo: 'ESTRUTURA_INESPERADA', http: 422 })
    expect(statusGravado()).toBe('rejeitada')
    expect(dispararAlarmeMock.mock.calls.map((c) => (c[0] as { tipo: string }).tipo)).toEqual(['checksum_falho'])
  })

  it('RETENTATIVA que falha depois do diff: a linha de log leva operacoes_* = null, NUNCA o [] do pré-lido', async () => {
    // Pré-lido = arquivo (a tentativa anterior já trocou a base) ⇒ o comparado seria [] / [].
    programarRpc({
      ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)],
      ingestao_carga_abrir: [{ data: { ...linhaCarga({ status: 'erro' }), existente: true }, error: null }],
    })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockRejectedValue(new PromocaoIncerta('promover_carga_operacao', 'estado incerto'))
    const puladas = [{ operacao: 'W - Delta', ids: [], motivo: 'x' }]

    await processarCarga(entrada({ puladas })).catch(() => undefined)

    expect(diffGravado()).toMatchObject({ operacoes_removidas: null, operacoes_novas: null, puladas })
  })

  it('carga NOVA que falha depois do diff: a linha de log segue com o comparado (o [] é medido)', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockRejectedValue(new PromocaoIncerta('promover_carga_operacao', 'estado incerto'))

    await processarCarga(entrada()).catch(() => undefined)

    expect(diffGravado()).toMatchObject({ operacoes_removidas: [], operacoes_novas: [] })
  })
})

describe('processarCarga (Operação) — divergência entre o pré-lido e o "antes" da promoção', () => {
  it('diverge ⇒ console.warn com as contagens; o resultado NÃO muda (vale a promoção)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockResolvedValue({
      linhas: 2, avisos: [], checksumsConferidos: 0, checksumsNaoConferiveis: 1,
      operacoesAntes: [
        { operacao: ALPHA, operacao_id: null }, { operacao: BETA, operacao_id: null }, { operacao: GAMA, operacao_id: null },
      ],
    })

    const r = await processarCarga(entrada())

    expect(r.diff.operacoes_removidas).toEqual([{ operacao: GAMA, operacao_id: null }])
    const msg = warn.mock.calls.map((c) => String(c[0])).find((m) => m.includes('diverge')) ?? ''
    expect(msg).toContain('(2)') // pré-lido
    expect(msg).toContain('(3)') // promoção
    expect(msg).toContain('1 só na promoção')
  })

  it('iguais ⇒ nenhum warn', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }, { nome: BETA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    await processarCarga(entrada())

    expect(warn.mock.calls.some((c) => String(c[0]).includes('diverge'))).toBe(false)
  })
})

// ── O modal só renderiza alarmes[]: o que some/foi pulado tem de estar escrito ali ───────────

describe('processarCarga (Operação) — linhas legíveis em alarmes[]', () => {
  it('CONFERÊNCIA: removidas e puladas viram linhas escritas, com os nomes', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, BETA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))

    const r = await processarCarga(entrada({
      confirmar: false, puladas: [{ operacao: 'W - Delta', ids: [], motivo: 'x' }],
    }))

    expect(r.alarmes).toContain(`2 operação(ões) da base atual NÃO estão no arquivo: ${BETA}; ${GAMA}`)
    expect(r.alarmes).toContain('1 operação(ões) não extraída(s) pela RPA: W - Delta')
  })

  it('APLICAÇÃO: as mesmas linhas aparecem na resposta', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, GAMA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    aplicarCargaMock.mockImplementation(async () => aplicacaoOk())

    const r = await processarCarga(entrada({ puladas: [{ operacao: GAMA, ids: [], motivo: 'x' }] }))

    expect(r.alarmes).toContain(`1 operação(ões) da base atual NÃO estão no arquivo: ${GAMA}`)
    expect(r.alarmes).toContain(`1 operação(ões) não extraída(s) pela RPA: ${GAMA}`)
  })

  it('nada removido nem pulado ⇒ nenhuma linha extra', async () => {
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))
    const r = await processarCarga(entrada({ confirmar: false }))
    expect(r.alarmes).toEqual([])
  })

  it('mais de 20 nomes ⇒ 20 e "… e mais N"; a contagem é a real', async () => {
    const muitos = Array.from({ length: 25 }, (_, i) => `W - Op ${String(i + 1).padStart(2, '0')}`)
    programarRpc({ ingestao_operacoes_vigentes: [antesPorNome(ALPHA, ...muitos)] })
    lerMatrizMock.mockReturnValue(matrizDoCsv([{ nome: ALPHA }], false))

    const r = await processarCarga(entrada({ confirmar: false }))

    const linha = r.alarmes.find((a) => a.includes('NÃO estão no arquivo')) ?? ''
    expect(linha.startsWith('25 operação(ões)')).toBe(true)
    expect(linha).toContain('W - Op 20')
    expect(linha).not.toContain('W - Op 21')
    expect(linha).toContain('… e mais 5')
  })
})

// ── Funções puras ────────────────────────────────────────────────────────────────────────────

describe('operacoesDoArquivo / compararConjuntoDeOperacoes (puras)', () => {
  const cru = (over: Partial<LancamentoOperacaoCru>): LancamentoOperacaoCru => ({
    linha_origem: 2, lancamento_numero: '1', venda_numero: '1', pessoa: 'p', descricao: 'd',
    liquidacao: '2026-09-10', vencimento: null, valor: 100, operacao: ALPHA, tipo: 'Entrada',
    data_final: '2026-09-10', operacaoId: null,
    ...over,
  })

  it('linha-placeholder (valor nulo) NÃO é operação, mesmo com nome de aparência normal; distintas', () => {
    const ops = operacoesDoArquivo([
      cru({ operacao: ALPHA }),
      cru({ operacao: ALPHA, linha_origem: 3 }), // repetida
      cru({ operacao: 'Nada para mostrar', valor: null, tipo: null }),
    ])
    expect(ops).toEqual([{ operacao: ALPHA, operacao_id: null }])
  })

  it('normaliza nome (espaços) e id (trim + minúsculas)', () => {
    expect(operacoesDoArquivo([cru({ operacao: 'W -  Alpha  ', operacaoId: ' ABC-1 ' })]))
      .toEqual([{ operacao: 'W - Alpha', operacao_id: 'abc-1' }])
  })

  it('homônimos com ids distintos no "antes" colapsam por nome quando o critério é o nome', () => {
    const r = compararConjuntoDeOperacoes(
      [{ operacao: ALPHA, operacao_id: null }, { operacao: ALPHA, operacao_id: 'x' }, { operacao: BETA, operacao_id: null }],
      [{ operacao: ALPHA, operacao_id: null }],
      false,
    )
    expect(r.criterio).toBe('nome')
    expect(r.removidas).toEqual([{ operacao: BETA, operacao_id: null }])
  })

  it('arquivoDeclarouId:false ⇒ por nome, ainda que os dois lados tenham id', () => {
    const r = compararConjuntoDeOperacoes(
      [{ operacao: ALPHA, operacao_id: 'a' }], [{ operacao: 'Outra', operacao_id: 'a' }], false,
    )
    expect(r.criterio).toBe('nome')
    expect(r.removidas).toHaveLength(1)
    expect(r.novas).toHaveLength(1)
  })

  it('base vazia (1ª carga): tudo é novo, nada removido', () => {
    const r = compararConjuntoDeOperacoes([], [{ operacao: ALPHA, operacao_id: null }], false)
    expect(r.removidas).toEqual([])
    expect(r.novas).toEqual([{ operacao: ALPHA, operacao_id: null }])
  })
})
