import { describe, it, expect, vi, beforeEach } from 'vitest'

// v6.5.1 — o aplicador de Lançamentos por Centro de Custo: o payload que a RPC lê (contrato
// `docs/specs/v6-5-1-m2-base-centro-custo.md` §3), o checksum por CENTRO (o grupo sem centro vira
// `centro_custo: null`) e a sequência limpar → lotes → validar → promover, com o cliente do `ingestor`
// falso (rpc de PROTÓTIPO tocando `this`, como o SDK real — `.bind(supabase)` em `aplicar.ts` tem de
// funcionar). Dados fictícios.
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
  aplicarCarga, adaptarCentroCusto, serializarChecksumsCentroCusto, CargaRejeitada, PromocaoIncerta,
} from './aplicar'
import type { LancamentoCentroCustoCru } from './parsers/lancamentos-centro-custo'
import type { Checksum } from './parsers/comum'

function lanc(overrides: Partial<LancamentoCentroCustoCru> = {}): LancamentoCentroCustoCru {
  return {
    linha_origem: 3, numero: '1001-2', emissao: '2026-01-05', vencimento: '2026-02-10', movimentacao: '2026-02-11',
    centro_custo: 'WG - Corp', pct_centro: 50, valor_movimentacao: -200, valor_centro_custo: -100,
    ...overrides,
  }
}

function checksum(overrides: Partial<Checksum> = {}): Checksum {
  return {
    escopo: 'centro', chave: ['WG - Corp'], campo: 'valor_centro_custo', linhasDeclaradas: 2,
    centavosDeclarados: -20000, linhasApuradas: 2, centavosApurados: -20000, centavosArredondados: -20000,
    ...overrides,
  }
}

// As chaves de `p_linhas` do contrato §3 (a RPC lê `x->>'<chave>'`; chave com outro nome seria NULL em silêncio).
const CHAVES_CONTRATO = [
  'arquivo_origem', 'linha_origem', 'numero', 'emissao', 'vencimento', 'movimentacao',
  'centro_custo', 'pct_centro', 'valor_movimentacao', 'valor_centro_custo',
].sort()

describe('adaptarCentroCusto', () => {
  it('produz exatamente as chaves do p_linhas do contrato §3 — nenhuma a mais (Pessoa/Descrição nunca saem)', () => {
    expect(Object.keys(adaptarCentroCusto(lanc(), 'cc.xlsx')).sort()).toEqual(CHAVES_CONTRATO)
  })

  it('anexa o arquivo_origem e não transforma o resto', () => {
    expect(adaptarCentroCusto(lanc(), 'cc.xlsx')).toEqual({
      arquivo_origem: 'cc.xlsx', linha_origem: 3, numero: '1001-2', emissao: '2026-01-05',
      vencimento: '2026-02-10', movimentacao: '2026-02-11', centro_custo: 'WG - Corp', pct_centro: 50,
      valor_movimentacao: -200, valor_centro_custo: -100,
    })
  })

  it('nulo continua nulo: sem centro, % vazio e datas fora da faixa não viram string vazia nem zero', () => {
    const p = adaptarCentroCusto(lanc({ centro_custo: null, pct_centro: null, emissao: null, vencimento: null, movimentacao: null }), 'cc.xlsx')
    expect(p.centro_custo).toBeNull()
    expect(p.pct_centro).toBeNull()
    expect(p.emissao).toBeNull()
    expect(p.vencimento).toBeNull()
    expect(p.movimentacao).toBeNull()
  })
})

describe('serializarChecksumsCentroCusto', () => {
  it('escopo "centro": chave vira {centro_custo}; linhas e centavos (arredondados) presentes', () => {
    expect(serializarChecksumsCentroCusto([checksum()])).toEqual([
      { escopo: 'centro', chave: { centro_custo: 'WG - Corp' }, campo: 'valor_centro_custo', linhas: 2, centavos: -20000 },
    ])
  })

  it('o grupo SEM centro (chave "") sai com centro_custo null — o "" nunca chega ao banco', () => {
    const r = serializarChecksumsCentroCusto([checksum({ chave: [''], linhasDeclaradas: 1, centavosArredondados: 0 })])
    expect(r[0].chave).toEqual({ centro_custo: null })
    expect(r[0]).toMatchObject({ linhas: 1, centavos: 0 })
  })

  it('um por centro, na ordem recebida', () => {
    const r = serializarChecksumsCentroCusto([checksum(), checksum({ chave: ['WG - CSC'] }), checksum({ chave: [''] })])
    expect(r.map((c) => (c.chave as { centro_custo: string | null }).centro_custo)).toEqual(['WG - Corp', 'WG - CSC', null])
  })

  it('centavos sai de centavosArredondados, NUNCA de centavosApurados', () => {
    expect(serializarChecksumsCentroCusto([checksum({ centavosApurados: 1, centavosArredondados: 2 })])[0].centavos).toBe(2)
  })

  it('sem centavosArredondados ⇒ PARA cedo (a promoção abortaria em toda carga)', () => {
    expect(() => serializarChecksumsCentroCusto([checksum({ centavosArredondados: undefined })])).toThrow(CargaRejeitada)
  })

  it('contagem não declarada ⇒ PARA (a RPC exige "linhas")', () => {
    expect(() => serializarChecksumsCentroCusto([checksum({ linhasDeclaradas: null })])).toThrow(CargaRejeitada)
  })

  it('escopo diferente de "centro" ⇒ PARA em vez de mandar o que a RPC recusaria', () => {
    expect(() => serializarChecksumsCentroCusto([checksum({ escopo: 'arquivo', chave: ['cc.xlsx'] })])).toThrow(/escopo/)
  })
})

describe('aplicarCarga — lancamentos-centro-custo', () => {
  type Resp = { data: unknown; error: { message: string; code?: string } | null }
  let respostas: Record<string, Resp>

  beforeEach(() => {
    vi.clearAllMocks()
    respostas = {
      limpar_staging_centro_custo: { data: null, error: null },
      inserir_lote_staging_centro_custo: { data: null, error: null },
      validar_carga_centro_custo: { data: { ok: true, total: 2, erros: [] }, error: null },
      promover_carga_centro_custo: {
        data: {
          linhas: 2, checksums_conferidos: 1, checksums_nao_conferiveis: 0, avisos: ['aviso da RPC'],
          rateio: { numeros: 1, multicentro: 0, partes_iguais: 0, por_centro: { corp: 1 } },
        },
        error: null,
      },
    }
    rpcMock.mockImplementation(async (nome: string) => respostas[nome] ?? { data: null, error: { message: `sem resposta: ${nome}` } })
  })

  const nomesChamados = () => rpcMock.mock.calls.map((c) => c[0] as string)
  const OPCOES = { cargaId: 'carga-1', arquivoOrigem: 'cc.xlsx', checksums: [checksum()] }

  it('sequência: limpar → lote → validar → promover(p_checksums, p_carga_id); lote com as chaves do contrato', async () => {
    const r = await aplicarCarga('lancamentos-centro-custo', [lanc(), lanc({ linha_origem: 4 })], OPCOES)

    expect(nomesChamados()).toEqual([
      'limpar_staging_centro_custo', 'inserir_lote_staging_centro_custo',
      'validar_carga_centro_custo', 'promover_carga_centro_custo',
    ])
    const lote = (rpcMock.mock.calls[1][1] as { p_linhas: Record<string, unknown>[] }).p_linhas
    expect(lote).toHaveLength(2)
    expect(Object.keys(lote[0]).sort()).toEqual(CHAVES_CONTRATO)
    expect(lote[0].arquivo_origem).toBe('cc.xlsx')

    const promover = rpcMock.mock.calls[3][1] as { p_checksums: unknown[]; p_carga_id: string }
    expect(promover.p_carga_id).toBe('carga-1')
    expect(promover.p_checksums).toEqual([
      { escopo: 'centro', chave: { centro_custo: 'WG - Corp' }, campo: 'valor_centro_custo', linhas: 2, centavos: -20000 },
    ])
    expect(r).toMatchObject({ linhas: 2, checksumsConferidos: 1, checksumsNaoConferiveis: 0, avisos: ['aviso da RPC'] })
  })

  it('o checksum do grupo sem centro viaja com centro_custo null até a promoção', async () => {
    await aplicarCarga('lancamentos-centro-custo', [lanc({ centro_custo: null })], {
      ...OPCOES, checksums: [checksum(), checksum({ chave: [''], linhasDeclaradas: 1 })],
    })
    const promover = rpcMock.mock.calls.find((c) => c[0] === 'promover_carga_centro_custo')?.[1] as { p_checksums: { chave: unknown }[] }
    expect(promover.p_checksums.map((c) => c.chave)).toEqual([{ centro_custo: 'WG - Corp' }, { centro_custo: null }])
  })

  it('lotes de 1.000: 2.500 linhas ⇒ 3 chamadas de inserir, a limpeza uma vez só, antes de todas', async () => {
    const muitas = Array.from({ length: 2500 }, (_, i) => lanc({ linha_origem: i + 2 }))
    await aplicarCarga('lancamentos-centro-custo', muitas, OPCOES)
    const nomes = nomesChamados()
    expect(nomes.filter((n) => n === 'limpar_staging_centro_custo')).toHaveLength(1)
    expect(nomes[0]).toBe('limpar_staging_centro_custo')
    const lotes = rpcMock.mock.calls.filter((c) => c[0] === 'inserir_lote_staging_centro_custo')
    expect(lotes.map((c) => (c[1] as { p_linhas: unknown[] }).p_linhas.length)).toEqual([1000, 1000, 500])
  })

  it('sem carga_id ou sem arquivoOrigem ⇒ recusa ANTES de tocar o banco', async () => {
    await expect(aplicarCarga('lancamentos-centro-custo', [lanc()], { arquivoOrigem: 'cc.xlsx', checksums: [checksum()] })).rejects.toThrow(CargaRejeitada)
    await expect(aplicarCarga('lancamentos-centro-custo', [lanc()], { cargaId: 'carga-1', checksums: [checksum()] })).rejects.toThrow(CargaRejeitada)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('validação reprovada (centro desconhecido) ⇒ CargaRejeitada com a mensagem da RPC e NENHUMA promoção', async () => {
    respostas.validar_carga_centro_custo = {
      data: { ok: false, total: 2, erros: ['1 centro(s) de custo desconhecido(s): WG - Novo'] }, error: null,
    }
    const erro = await aplicarCarga('lancamentos-centro-custo', [lanc()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada)
    expect((erro as CargaRejeitada).message).toContain('WG - Novo')
    expect(nomesChamados()).not.toContain('promover_carga_centro_custo')
  })

  it('erro do POSTGRES na promoção (22023 CHECKSUM_FALHOU) ⇒ CargaRejeitada: a base anterior está de pé', async () => {
    respostas.promover_carga_centro_custo = { data: null, error: { message: 'CHECKSUM_FALHOU: 1 de 1', code: '22023' } }
    const erro = await aplicarCarga('lancamentos-centro-custo', [lanc()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(CargaRejeitada)
    expect((erro as CargaRejeitada).message).toContain('CHECKSUM_FALHOU')
  })

  it('falha de TRANSPORTE na promoção (sem code) ⇒ PromocaoIncerta, nunca "base preservada"', async () => {
    respostas.promover_carga_centro_custo = { data: null, error: { message: 'fetch failed' } }
    const erro = await aplicarCarga('lancamentos-centro-custo', [lanc()], OPCOES).catch((e: unknown) => e)
    expect(erro).toBeInstanceOf(PromocaoIncerta)
    expect((erro as PromocaoIncerta).message).not.toContain('foi preservada')
  })

  it('erro ao inserir um lote ⇒ CargaRejeitada (só a staging foi tocada) e nada de validar/promover', async () => {
    respostas.inserir_lote_staging_centro_custo = { data: null, error: { message: 'LOTE_LINHA_INVALIDA', code: '22023' } }
    await expect(aplicarCarga('lancamentos-centro-custo', [lanc()], OPCOES)).rejects.toThrow(CargaRejeitada)
    expect(nomesChamados()).toEqual(['limpar_staging_centro_custo', 'inserir_lote_staging_centro_custo'])
  })

  // O que este caso prova é só o lado do APP: a retentativa reenvia o MESMO p_carga_id. O "devolve o
  // resultado guardado" é da RPC (replay por ingestao.promocao) e está provado contra o banco no ensaio
  // revertido da 0304 — aqui o mock responderia igual de qualquer jeito (achado do revisor na M2).
  it('replay: reenviar com o MESMO carga_id manda o mesmo p_carga_id à promoção', async () => {
    await aplicarCarga('lancamentos-centro-custo', [lanc(), lanc({ linha_origem: 4 })], OPCOES)
    await aplicarCarga('lancamentos-centro-custo', [lanc(), lanc({ linha_origem: 4 })], OPCOES)
    const ids = rpcMock.mock.calls
      .filter((c) => c[0] === 'promover_carga_centro_custo')
      .map((c) => (c[1] as { p_carga_id: string }).p_carga_id)
    expect(ids).toEqual(['carga-1', 'carga-1'])
  })
})
