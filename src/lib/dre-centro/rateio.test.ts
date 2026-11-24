import { describe, it, expect } from 'vitest'
import type { DreLinha } from '@/lib/dre/schemas'
import {
  PCTS_IGUAIS, categoriaTravada, chaveCategoria, chaveGrupo, estadoAplicacao, estadoInicial, gruposDaArvore, lerPct, montarItens,
  preencherVazios, rateioCscSchema, temRateio, validarLinha,
} from './rateio'

const linha = (p: Partial<DreLinha> & Pick<DreLinha, 't' | 'rotulo'>): DreLinha =>
  ({ estrela: false, meses: Array.from({ length: 12 }, () => 0), venc: 0, total: 0, ...p }) as DreLinha

const ARVORE: DreLinha[] = [
  linha({ t: 'blocoH', chave: 'DESP_H', rotulo: '(−) DESPESAS' }),
  linha({ t: 'sub', chave: 'ADM', rotulo: '(−) Despesas Administrativas' }),
  linha({ t: 'cat', g: 'ADM', categoria_id: 10, rotulo: 'Aluguel' }),
  linha({ t: 'cat', g: 'ADM', categoria_id: 11, rotulo: 'Energia' }),
  linha({ t: 'sub', chave: 'RH', rotulo: '(−) Despesas Operacionais RH' }),
  linha({ t: 'cat', g: 'RH', categoria_id: 20, rotulo: 'Salários' }),
  linha({ t: 'tot', chave: 'REX', rotulo: '(=) RESULTADO' }),
]
const GRUPOS = gruposDaArvore(ARVORE)

describe('gruposDaArvore', () => {
  it('lista os grupos com categorias, na ordem da DRE, com o rótulo do grupo', () => {
    expect(GRUPOS).toEqual([
      { chave: 'ADM', rotulo: '(−) Despesas Administrativas', categorias: [{ categoria_id: 10, rotulo: 'Aluguel' }, { categoria_id: 11, rotulo: 'Energia' }] },
      { chave: 'RH', rotulo: '(−) Despesas Operacionais RH', categorias: [{ categoria_id: 20, rotulo: 'Salários' }] },
    ])
  })
})

describe('lerPct / validarLinha', () => {
  it('lê percentual em pt-BR e recusa lixo', () => {
    expect(lerPct(' 33,33 ')).toBe(33.33)
    expect(lerPct('50')).toBe(50)
    expect(lerPct('')).toBeNull()
    expect(lerPct('abc')).toBeNaN()
    expect(lerPct('-5')).toBeNaN()
    expect(lerPct('1,23456')).toBeNaN()
    // 3 casas seriam lidas como milhar pela coerção canônica ("33,333" → 33333): o formato barra antes
    expect(lerPct('33,333')).toBeNaN()
    expect(lerPct('1.234')).toBeNaN()
    expect(lerPct('33.33')).toBe(33.33)
  })

  it('vazia, completa (Σ = 100, campo vazio = 0) ou com erro nomeado', () => {
    expect(validarLinha(undefined)).toEqual({ tipo: 'vazia' })
    expect(validarLinha({ trips: '', weddings: ' ', corp: '' })).toEqual({ tipo: 'vazia' })
    expect(validarLinha({ trips: '33,33', weddings: '33,33', corp: '33,34' })).toEqual({ tipo: 'ok', pcts: { trips: 33.33, weddings: 33.33, corp: 33.34 } })
    expect(validarLinha({ trips: '100', weddings: '', corp: '' })).toEqual({ tipo: 'ok', pcts: { trips: 100, weddings: 0, corp: 0 } })
    expect(validarLinha({ trips: '50', weddings: '30', corp: '10' })).toMatchObject({ tipo: 'erro', msg: expect.stringContaining('90%') })
    expect(validarLinha({ trips: '150', weddings: '', corp: '' })).toMatchObject({ tipo: 'erro' })
    expect(validarLinha({ trips: 'x', weddings: '', corp: '' })).toMatchObject({ tipo: 'erro' })
  })
})

describe('estadoAplicacao — o véu "Aplicando o rateio…" some quando os dados novos chegam', () => {
  const antes = { itens: [], atualizado_em: null }
  it('aplicando enquanto o rateio na tela é o MESMO objeto do clique; ocioso quando chega o novo', () => {
    expect(estadoAplicacao(null, antes)).toBe('ocioso')
    expect(estadoAplicacao({ ref: antes, erro: null }, antes)).toBe('aplicando')
    // a página nova traz um objeto novo, mesmo com conteúdo igual (ex.: salvou o que já estava)
    expect(estadoAplicacao({ ref: antes, erro: null }, { itens: [], atualizado_em: null })).toBe('ocioso')
    expect(estadoAplicacao({ ref: antes, erro: 'Rateio: falhou' }, antes)).toBe('erro')
  })
})

describe('preencherVazios', () => {
  it('categorias vazias de grupo sem % recebem 33,33/33,33/33,34 (soma 100); grupo travado e linhas digitadas ficam', () => {
    const antes = {
      [chaveGrupo('RH')]: { trips: '100', weddings: '', corp: '' },        // RH travado: Salários não é tocada
      [chaveCategoria(10)]: { trips: '50', weddings: '50', corp: '' },     // já definida: fica
      [chaveCategoria(11)]: { trips: '7', weddings: '', corp: '' },        // rascunho inválido: fica
    }
    const depois = preencherVazios(antes, GRUPOS)
    expect(depois[chaveCategoria(10)]).toEqual(antes[chaveCategoria(10)])
    expect(depois[chaveCategoria(11)]).toEqual(antes[chaveCategoria(11)])
    expect(depois[chaveCategoria(20)]).toBeUndefined()
    expect(depois[chaveGrupo('ADM')]).toBeUndefined() // a linha do grupo nunca é preenchida
    const tudoVazio = preencherVazios({}, GRUPOS)
    expect(tudoVazio[chaveCategoria(10)]).toEqual(PCTS_IGUAIS)
    expect(tudoVazio[chaveCategoria(20)]).toEqual(PCTS_IGUAIS)
    expect(validarLinha(PCTS_IGUAIS)).toEqual({ tipo: 'ok', pcts: { trips: 33.33, weddings: 33.33, corp: 33.34 } })
    // e o resultado salva sem erro
    expect(montarItens(tudoVazio, GRUPOS).erros).toEqual({})
  })
})

describe('trava e montagem', () => {
  it('grupo preenchido trava as categorias dele (mesmo em edição); grupo vazio não', () => {
    expect(categoriaTravada({ [chaveGrupo('ADM')]: { trips: '50', weddings: '', corp: '' } }, 'ADM')).toBe(true)
    expect(categoriaTravada({}, 'ADM')).toBe(false)
  })

  it('monta grupo e categorias; categoria de grupo travado também vai (fica guardada)', () => {
    const r = montarItens({
      [chaveGrupo('ADM')]: { trips: '50', weddings: '30', corp: '20' },
      [chaveCategoria(10)]: { trips: '100', weddings: '', corp: '' },
      [chaveCategoria(20)]: { trips: '', weddings: '100', corp: '' },
    }, GRUPOS)
    expect(r.erros).toEqual({})
    expect(r.itens).toEqual([
      { bloco_chave: 'ADM', pct_trips: 50, pct_weddings: 30, pct_corp: 20 },
      { categoria_id: 10, pct_trips: 100, pct_weddings: 0, pct_corp: 0 },
      { categoria_id: 20, pct_trips: 0, pct_weddings: 100, pct_corp: 0 },
    ])
  })

  it('erro de soma bloqueia; rascunho inválido numa categoria travada NÃO bloqueia', () => {
    const r = montarItens({
      [chaveGrupo('ADM')]: { trips: '50', weddings: '30', corp: '20' },
      [chaveCategoria(11)]: { trips: '10', weddings: '', corp: '' }, // travada (ADM preenchido)
      [chaveCategoria(20)]: { trips: '60', weddings: '', corp: '' }, // livre e somando 60
    }, GRUPOS)
    expect(Object.keys(r.erros)).toEqual([chaveCategoria(20)])
  })

  it('estado inicial a partir do salvo, e "tem rateio" só com itens', () => {
    const salvo = rateioCscSchema.parse({
      itens: [
        { categoria_id: null, bloco_chave: 'RH', pct_trips: '33.3300', pct_weddings: 33.33, pct_corp: 33.34 },
        { categoria_id: 10, bloco_chave: null, pct_trips: 100, pct_weddings: 0, pct_corp: 0 },
      ],
      atualizado_em: '2026-11-23T10:00:00Z',
    })
    expect(estadoInicial(salvo)).toEqual({
      [chaveGrupo('RH')]: { trips: '33,33', weddings: '33,33', corp: '33,34' },
      [chaveCategoria(10)]: { trips: '100', weddings: '0', corp: '0' },
    })
    expect(temRateio(salvo)).toBe(true)
    expect(temRateio({ itens: [], atualizado_em: null })).toBe(false)
    expect(temRateio(null)).toBe(false)
  })
})
