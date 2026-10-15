import { describe, it, expect, vi, beforeEach } from 'vitest'

// v6.4.0 — o aplicador de Contas a receber: o payload que a RPC lê, o checksum por arquivo e a
// sequência limpar → lotes → validar → promover, com o cliente do `ingestor` falso (rpc de PROTÓTIPO
// tocando `this`, como o SDK real — `.bind(supabase)` em `aplicar.ts` tem de funcionar).
vi.mock('server-only', () => ({}))

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

class ClienteIngestorFake {
  readonly rest = { marcador: 'postgrest' }
  rpc(fn: string, args?: Record<string, unknown>) {
    const alcance = this.rest
    void alcance
    return rpcMock(fn, args)
  }
}
vi.mock('@/lib/supabase/ingestor', () => ({ getIngestorClient: async () => new ClienteIngestorFake() }))
vi.mock('@/lib/carga/metas', () => ({ loadMetas: vi.fn() }))

import {
  aplicarCarga, adaptarContaReceber, serializarChecksumsContasReceber, CargaRejeitada, PromocaoIncerta,
} from './aplicar'
import type { ContaReceberCru } from './parsers/contas-receber'
import type { Checksum } from './parsers/comum'

function conta(overrides: Partial<ContaReceberCru> = {}): ContaReceberCru {
  return {
    arquivo_origem: '24.xlsx', linha_origem: 2, numero: '1001', emissao: '2024-01-05',
    pessoa: 'Cliente Ficticio', descricao: 'Pagamento venda', vencimento: '2024-02-10', liquidacao: null,
    valor_final: 100.5, conferido: null, operacao_propria: null,
    ...overrides,
  }
}

function checksum(overrides: Partial<Checksum> = {}): Checksum {
  return {
    escopo: 'arquivo', chave: ['24.xlsx'], campo: 'valor_final', linhasDeclaradas: 2,
    centavosDeclarados: 15050, linhasApuradas: 2, centavosApurados: 15050, centavosArredondados: 15050,
    ...overrides,
  }
}

// As colunas REAIS do INSERT de `inserir_lote_staging_contas_receber` (migration 0295).
const COLUNAS_STAGING = [
  'arquivo_origem', 'linha_origem', 'numero', 'emissao', 'pessoa', 'descricao', 'vencimento',
  'liquidacao', 'valor_final', 'conferido', 'operacao_propria',
].sort()

describe('adaptarContaReceber', () => {
  it('produz exatamente as colunas da staging (0295) — nenhuma a mais, nenhuma a menos', () => {
    expect(Object.keys(adaptarContaReceber(conta())).sort()).toEqual(COLUNAS_STAGING)
  })

  it('não renomeia nem transforma: valor, datas ISO, conferido e arquivo chegam como o parser emitiu', () => {
    const p = adaptarContaReceber(conta({ conferido: 'Inadimplente', liquidacao: '2024-03-01', valor_final: 188.62 }))
    expect(p).toMatchObject({
      arquivo_origem: '24.xlsx', linha_origem: 2, numero: '1001', vencimento: '2024-02-10',
      liquidacao: '2024-03-01', valor_final: 188.62, conferido: 'Inadimplente',
    })
  })

  it('campo nulo continua nulo — não vira string vazia nem zero', () => {
    const p = adaptarContaReceber(conta({ emissao: null, pessoa: null, descricao: null, operacao_propria: null }))
    expect(p.emissao).toBeNull()
    expect(p.pessoa).toBeNull()
    expect(p.descricao).toBeNull()
    expect(p.operacao_propria).toBeNull()
  })
})

describe('serializarChecksumsContasReceber', () => {
  it('escopo "arquivo": chave vira {arquivo_origem}; linhas e centavos presentes (a RPC os exige)', () => {
    expect(serializarChecksumsContasReceber([checksum()])).toEqual([
      { escopo: 'arquivo', chave: { arquivo_origem: '24.xlsx' }, campo: 'valor_final', linhas: 2, centavos: 15050 },
    ])
  })

  it('um por arquivo, na ordem recebida', () => {
    const r = serializarChecksumsContasReceber([checksum(), checksum({ chave: ['25.xlsx'], linhasDeclaradas: 5 })])
    expect(r.map((c) => (c.chave as { arquivo_origem: string }).arquivo_origem)).toEqual(['24.xlsx', '25.xlsx'])
  })

  it('centavos sai de centavosArredondados, NUNCA de centavosApurados (o gravado é arredondado linha a linha)', () => {
    expect(serializarChecksumsContasReceber([checksum({ centavosApurados: 1, centavosArredondados: 2 })])[0].centavos).toBe(2)
  })

  it('contagem não declarada ⇒ PARA (a RPC exige "linhas"; sem ela a contagem não seria conferida)', () => {
    expect(() => serializarChecksumsContasReceber([checksum({ linhasDeclaradas: null })])).toThrow(CargaRejeitada)
  })

  it('escopo diferente de "arquivo" ⇒ PARA em vez de mandar o que a RPC recusaria', () => {
    expect(() => serializarChecksumsContasReceber([checksum({ escopo: 'total-arquivo', chave: [] })])).toThrow(/escopo/)
  })
})

describe('aplicarCarga — contas-receber', () => {
  type Resp = { data: unknown; error: { message: string; code?: string } | null }
  let respostas: Record<string, Resp>

  beforeEach(() => {
    vi.clearAllMocks()
    respostas = {
      limpar_staging_contas_receber: { data: null, error: null },
      inserir_lote_staging_contas_receber: { data: null, error: null },
      validar_carga_contas_receber: { data: { ok: true, total: 2, erros: [] }, error: null },
      promover_carga_contas_receber: {
        data: {
          linhas: 2, checksums_conferidos: 1, checksums_nao_conferiveis: 0, avisos: ['aviso da RPC'],
          foto: { data_posicao: '2026-10-15', em_aberto: 1, inadimplente_n: 0, inadimplente_valor: 0 },
        },
        error: null,
      },
    }
    rpcMock.mockImplementation(async (nome: string) => respostas[nome] ?? { data: null, error: { message: `sem resposta: ${nome}` } })
  })

  const nomesChamados = () => rpcMock.mock.calls.map((c) => c[0] as string)
  const OPCOES = { cargaId: 'carga-1', checksums: [checksum()] }

  it('sequência: limpar → lote → validar → promover(p_checksums, p_carga_id); devolve o conferido e os avisos da RPC', async () => {
    const r = await aplicarCarga('contas-receber', [conta(), conta({ numero: '1002' })], OPCOES)

    expect(nomesChamados()).toEqual([
      'limpar_staging_contas_receber', 'inserir_lote_staging_contas_receber',
      'validar_carga_contas_receber', 'promover_carga_contas_receber',
    ])
    const promover = rpcMock.mock.calls[3][1] as { p_checksums: unknown[]; p_carga_id: string }
    expect(promover.p_carga_id).toBe('carga-1')
    expect(promover.p_checksums).toHaveLength(1)
    expect(r).toMatchObject({ linhas: 2, checksumsConferidos: 1, checksumsNaoConferiveis: 0, avisos: ['aviso da RPC'] })
  })

  it('lotes de 1.000: 2.500 títulos ⇒ 3 chamadas de inserir, a limpeza uma vez só, antes de todas', async () => {
    const muitas = Array.from({ length: 2500 }, (_, i) => conta({ numero: String(i) }))
    await aplicarCarga('contas-receber', muitas, OPCOES)
    const nomes = nomesChamados()
    expect(nomes.filter((n) => n === 'limpar_staging_contas_receber')).toHaveLength(1)
    expect(nomes[0]).toBe('limpar_staging_contas_receber')
    const lotes = rpcMock.mock.calls.filter((c) => c[0] === 'inserir_lote_staging_contas_receber')
    expect(lotes.map((c) => (c[1] as { p_linhas: unknown[] }).p_linhas.length)).toEqual([1000, 1000, 500])
  })

  it('sem carga_id ⇒ recusa ANTES de tocar o banco', async () => {
    await expect(aplicarCarga('contas-receber', [conta()], { checksums: [checksum()] })).rejects.toThrow(CargaRejeitada)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('validação reprovada ⇒ CargaRejeitada com a mensagem da RPC e NENHUMA promoção', async () => {
    respostas.validar_carga_contas_receber = {
      data: { ok: false, total: 2, erros: ['1 número(s) de título repetido(s) na carga'] }, error: null,
    }
    const erro = await aplicarCarga('contas-receber', [conta()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada)
    expect((erro as CargaRejeitada).message).toContain('número(s) de título repetido(s)')
    expect(nomesChamados()).not.toContain('promover_carga_contas_receber')
  })

  it('erro do POSTGRES na promoção (22023 CHECKSUM_FALHOU) ⇒ CargaRejeitada: a base anterior está de pé', async () => {
    respostas.promover_carga_contas_receber = { data: null, error: { message: 'CHECKSUM_FALHOU: 1 de 1', code: '22023' } }
    const erro = await aplicarCarga('contas-receber', [conta()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada)
    expect((erro as CargaRejeitada).message).toContain('CHECKSUM_FALHOU')
  })

  it('falha de TRANSPORTE na promoção (sem code) ⇒ PromocaoIncerta, nunca "base preservada"', async () => {
    respostas.promover_carga_contas_receber = { data: null, error: { message: 'fetch failed' } }
    const erro = await aplicarCarga('contas-receber', [conta()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(PromocaoIncerta)
    expect((erro as PromocaoIncerta).message).not.toContain('foi preservada')
  })

  it('erro ao inserir um lote ⇒ CargaRejeitada (só a staging foi tocada) e nada de validar/promover', async () => {
    respostas.inserir_lote_staging_contas_receber = { data: null, error: { message: 'invalid input syntax for type date', code: '22007' } }
    await expect(aplicarCarga('contas-receber', [conta()], OPCOES)).rejects.toThrow(CargaRejeitada)
    expect(nomesChamados()).toEqual(['limpar_staging_contas_receber', 'inserir_lote_staging_contas_receber'])
  })
})
