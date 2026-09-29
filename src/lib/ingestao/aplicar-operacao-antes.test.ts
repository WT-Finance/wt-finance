import { describe, it, expect, vi, beforeEach } from 'vitest'

// v6.1.0 (migration 0288): `promover_carga_operacao` devolve `operacoes_antes` — o conjunto que a
// base viva tinha DENTRO da transação, antes do TRUNCATE. `aplicarCarga` o repassa validado
// (`operacoesAntes`), e `null` quando falta ou vem fora do formato. E a mensagem de erro da promoção
// só afirma "base preservada" quando o erro veio do Postgres.
vi.mock('server-only', () => ({}))

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

/** `rpc` de PROTÓTIPO, como o SDK real: `.bind(supabase)` em `aplicar.ts` tem de funcionar. */
class ClienteIngestorFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    void this.rest
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/ingestor', () => ({ getIngestorClient: async () => new ClienteIngestorFake() }))
vi.mock('@/lib/carga/metas', () => ({ loadMetas: vi.fn() }))

import { aplicarCarga, CargaRejeitada } from './aplicar'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'

const LINHA: LancamentoOperacaoCru = {
  linha_origem: 2, lancamento_numero: '1', venda_numero: '1', pessoa: 'p', descricao: 'd',
  liquidacao: '2026-09-10', vencimento: null, valor: 100, operacao: 'W - Alpha', tipo: 'Entrada',
  data_final: '2026-09-10', operacaoId: null,
}
const OPCOES = { arquivoOrigem: 'a.csv', cargaId: 'carga-1', checksums: [] }

type Resp = { data: unknown; error: { message: string; code?: string | null } | null }

/** Tudo ok até a promoção; a promoção devolve `promocao`. */
function programar(promocao: Resp) {
  rpcMock.mockImplementation(async (fn: string) => {
    if (fn === 'validar_carga_operacao') return { data: { ok: true, total: 1, erros: [] }, error: null }
    if (fn === 'promover_carga_operacao') return promocao
    return { data: null, error: null } // limpar_staging_operacao, inserir_lote_staging_operacao
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('aplicarCarga(lancamentos-operacao) — operacoes_antes da promoção', () => {
  it('repassa operacoes_antes validado (operacao_id pode ser null)', async () => {
    programar({
      data: {
        linhas: 1, avisos: [],
        operacoes_antes: [{ operacao: 'W - Alpha', operacao_id: null }, { operacao: 'W - Beta', operacao_id: 'id-b' }],
      },
      error: null,
    })
    const r = await aplicarCarga('lancamentos-operacao', [LINHA], OPCOES)
    expect(r.operacoesAntes).toEqual([
      { operacao: 'W - Alpha', operacao_id: null }, { operacao: 'W - Beta', operacao_id: 'id-b' },
    ])
  })

  it('lista vazia legítima (base vazia) é repassada como [], não como null', async () => {
    programar({ data: { linhas: 1, avisos: [], operacoes_antes: [] }, error: null })
    expect((await aplicarCarga('lancamentos-operacao', [LINHA], OPCOES)).operacoesAntes).toEqual([])
  })

  it.each([
    ['chave ausente (função anterior à 0288)', { linhas: 1, avisos: [] }],
    ['null', { linhas: 1, avisos: [], operacoes_antes: null }],
    ['item sem operacao', { linhas: 1, avisos: [], operacoes_antes: [{ operacao_id: 'x' }] }],
    ['não é array', { linhas: 1, avisos: [], operacoes_antes: { operacao: 'W - Alpha' } }],
    ['operacao_id ausente (não null)', { linhas: 1, avisos: [], operacoes_antes: [{ operacao: 'W - Alpha' }] }],
  ])('%s ⇒ operacoesAntes null (nunca [] por engano)', async (_nome, data) => {
    programar({ data, error: null })
    const r = await aplicarCarga('lancamentos-operacao', [LINHA], OPCOES)
    expect(r.operacoesAntes).toBeNull()
  })
})

describe('aplicarCarga(lancamentos-operacao) — erro ao promover', () => {
  it('erro do POSTGRES (com code) ⇒ afirma "base anterior preservada"', async () => {
    programar({ data: null, error: { message: 'CHECKSUM_FALHOU', code: 'P0001' } })
    const erro = await aplicarCarga('lancamentos-operacao', [LINHA], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada)
    expect((erro as CargaRejeitada).etapa).toBe('promover_carga_operacao')
    expect((erro as CargaRejeitada).message).toContain('a base anterior foi preservada')
    expect((erro as CargaRejeitada).message).toContain('CHECKSUM_FALHOU')
  })

  it.each([
    ['sem code', { message: 'TypeError: fetch failed' }],
    ['code vazio (falha de transporte do SDK)', { message: 'TypeError: fetch failed', code: '' }],
  ])('falha de TRANSPORTE (%s) ⇒ "estado incerto", não afirma "preservada"', async (_nome, error) => {
    programar({ data: null, error })
    const erro = await aplicarCarga('lancamentos-operacao', [LINHA], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada) // mesmo tipo de erro ⇒ mesmo HTTP
    const msg = (erro as CargaRejeitada).message
    expect(msg).toContain('estado incerto')
    expect(msg).toContain('ingestao.promocao')
    expect(msg).not.toContain('foi preservada')
  })
})
