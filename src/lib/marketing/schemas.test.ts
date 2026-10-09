import { describe, expect, it } from 'vitest'
import { gerarLancamentos, montarDadosFixture } from './fixture'
import {
  fornecedoresMarketingSchema,
  lancamentosMarketingSchema,
  resumoMarketingSchema,
} from './schemas'

// Os schemas validam o retorno REAL das 3 RPCs (0292). A prova contra a RPC viva é do
// `src/lib/rpc-contrato.test.ts`; aqui, o que dá para provar sem banco: o formato que a fixture
// (que espelha o contrato de `tipos.ts`) produz passa, e o formato que o Postgres de fato
// serializa — timestamptz com offset, chaves com `null`, arrays vazios — também.
//
// A página só LÊ `resumo` e `fornecedores` (um par por ano selecionado); o schema de lançamentos
// segue coberto porque `rpc-contrato.test.ts` o usa contra a RPC viva.

const HOJE = '2026-10-08'

describe('schemas das RPCs de Gastos de Marketing', () => {
  const d = montarDadosFixture({ anos: [2025, 2026], hoje: HOJE, estado: null })

  it('o payload da fixture (mesmo contrato de tipos.ts) passa nos três schemas', () => {
    for (const leitura of d.porAno) {
      if (!leitura.resumo.ok || !leitura.fornecedores.ok) throw new Error('fixture deveria carregar tudo')
      expect(resumoMarketingSchema.safeParse(leitura.resumo.dados).success).toBe(true)
      expect(fornecedoresMarketingSchema.safeParse(leitura.fornecedores.dados).success).toBe(true)
    }
    expect(lancamentosMarketingSchema.safeParse(gerarLancamentos(2026, HOJE)).success).toBe(true)
  })

  it('resumo: ultimaCarga aceita ISO COM offset; ano vazio traz cobertura null e arrays []', () => {
    const vazio = {
      ano: 2026,
      anosDisponiveis: [],
      porMesCategoria: [],
      cobertura: null,
      ultimaCarga: '2026-10-08T11:42:00.123456-03:00',
      ultimaDataCartao: null,
    }
    expect(resumoMarketingSchema.safeParse(vazio).success).toBe(true)
  })

  it('resumo: chave AUSENTE reprova (drift), em vez de passar como undefined', () => {
    const resumo = d.porAno[1].resumo
    if (!resumo.ok) throw new Error('fixture deveria carregar')
    for (const chave of ['ultimaDataCartao', 'anosDisponiveis', 'cobertura', 'ultimaCarga']) {
      const copia: Record<string, unknown> = { ...resumo.dados }
      delete copia[chave]
      expect(resumoMarketingSchema.safeParse(copia).success, `sem ${chave}`).toBe(false)
    }
  })

  it('fornecedor null (sem fornecedor) e mês fora de 1..12', () => {
    const linha = { mes: 3, fornecedor: null, valor: -10.5, qtd: 1 }
    expect(fornecedoresMarketingSchema.safeParse({ ano: 2026, porMesFornecedor: [linha] }).success).toBe(true)
    expect(fornecedoresMarketingSchema.safeParse({ ano: 2026, porMesFornecedor: [{ ...linha, mes: 13 }] }).success).toBe(false)
  })

  it('lançamento: descricao/documento/fornecedor aceitam null; valor positivo (estorno) passa', () => {
    const l = {
      id: 1, data: '2026-03-14', categoria: 'Anúncios',
      fornecedor: null, descricao: null, documento: null, valor: 125.4,
    }
    expect(lancamentosMarketingSchema.safeParse([l]).success).toBe(true)
    expect(lancamentosMarketingSchema.safeParse([{ ...l, valor: '125.4' }]).success).toBe(false)
  })
})
