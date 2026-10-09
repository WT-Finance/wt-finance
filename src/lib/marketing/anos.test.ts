import { describe, it, expect } from 'vitest'
import {
  ANO_PISO, MAX_ANOS, alternarAno, anoBloqueado, anosDaUrl, resolverAnos, serializarAnos,
} from './anos'

const CORRENTE = 2026

describe('anosDaUrl — parse do `?anos=` / `?ano=`', () => {
  it('sem parâmetro: só o ano corrente', () => {
    expect(anosDaUrl({}, CORRENTE)).toEqual([2026])
  })

  it('lista separada por vírgula, devolvida em ordem crescente e sem repetição', () => {
    expect(anosDaUrl({ anos: '2025,2026' }, CORRENTE)).toEqual([2025, 2026])
    expect(anosDaUrl({ anos: '2026,2024,2025,2025' }, CORRENTE)).toEqual([2024, 2025, 2026])
    expect(anosDaUrl({ anos: ' 2025 , 2026 ' }, CORRENTE)).toEqual([2025, 2026])
  })

  it('o parâmetro repetido (`?anos=2025&anos=2026`) soma como a lista', () => {
    expect(anosDaUrl({ anos: ['2025', '2026'] }, CORRENTE)).toEqual([2025, 2026])
  })

  it('um ano só vale (1 é o mínimo)', () => {
    expect(anosDaUrl({ anos: '2025' }, CORRENTE)).toEqual([2025])
  })

  it('ignora o inválido e fica com o válido: fora da faixa, futuro, lixo, vazio', () => {
    expect(anosDaUrl({ anos: '1999,2025' }, CORRENTE)).toEqual([2025])
    expect(anosDaUrl({ anos: '2025,2027' }, CORRENTE)).toEqual([2025])
    expect(anosDaUrl({ anos: '2025,abc,,20x6,2025abc' }, CORRENTE)).toEqual([2025])
    expect(anosDaUrl({ anos: `${ANO_PISO - 1},${ANO_PISO}` }, CORRENTE)).toEqual([ANO_PISO])
  })

  it('"2025abc" NÃO é lido como 2025 (a forma inteira tem de ser um ano de 4 dígitos)', () => {
    expect(anosDaUrl({ anos: '2025abc' }, CORRENTE)).toEqual([2026]) // nada válido → default
  })

  it('nada válido (ou lista vazia) cai no default — nunca devolve lista vazia', () => {
    expect(anosDaUrl({ anos: '' }, CORRENTE)).toEqual([2026])
    expect(anosDaUrl({ anos: 'x,y' }, CORRENTE)).toEqual([2026])
    expect(anosDaUrl({ anos: '1900,2999' }, CORRENTE)).toEqual([2026])
  })

  it('compat com o antigo `?ano=`: vale como um ano só', () => {
    expect(anosDaUrl({ ano: '2025' }, CORRENTE)).toEqual([2025])
    expect(anosDaUrl({ ano: ['2024', '2025'] }, CORRENTE)).toEqual([2024]) // o primeiro, como antes
    expect(anosDaUrl({ ano: '2099' }, CORRENTE)).toEqual([2026])
    expect(anosDaUrl({ ano: 'abc' }, CORRENTE)).toEqual([2026])
  })

  it('`?anos=` válido vence o `?ano=`; `?anos=` sem nenhum válido deixa o `?ano=` valer', () => {
    expect(anosDaUrl({ anos: '2024,2025', ano: '2026' }, CORRENTE)).toEqual([2024, 2025])
    expect(anosDaUrl({ anos: 'lixo', ano: '2025' }, CORRENTE)).toEqual([2025])
  })

  it(`no máximo ${MAX_ANOS} anos: com mais, ficam os mais recentes`, () => {
    expect(anosDaUrl({ anos: '2023,2024,2025,2026' }, CORRENTE)).toEqual([2024, 2025, 2026])
    expect(anosDaUrl({ anos: '2020,2021,2022,2023' }, CORRENTE)).toEqual([2021, 2022, 2023])
  })
})

describe('resolverAnos — filtro pelos anos que têm pill', () => {
  const DISPONIVEIS = [2024, 2025, 2026]

  it('mantém os pedidos que têm pill, em ordem crescente', () => {
    expect(resolverAnos([2025, 2026], DISPONIVEIS, CORRENTE)).toEqual([2025, 2026])
  })

  it('ignora o ano fora de `anosDisponiveis` (ex.: 2010 e 2023 — antes da base)', () => {
    expect(resolverAnos([2010, 2025], DISPONIVEIS, CORRENTE)).toEqual([2025])
    expect(resolverAnos([2023, 2024], DISPONIVEIS, CORRENTE)).toEqual([2024])
  })

  it('nenhum pedido com pill → o ano corrente (sempre há ao menos um)', () => {
    expect(resolverAnos([2010], DISPONIVEIS, CORRENTE)).toEqual([2026])
    expect(resolverAnos([], DISPONIVEIS, CORRENTE)).toEqual([2026])
  })

  it('sem a lista da base (todas as leituras falharam), vale o pedido', () => {
    expect(resolverAnos([2010, 2025], null, CORRENTE)).toEqual([2010, 2025])
  })
})

describe('alternarAno — clique numa pill', () => {
  it('liga um ano novo, mantendo a lista crescente', () => {
    expect(alternarAno([2026], 2025)).toEqual([2025, 2026])
    expect(alternarAno([2024, 2026], 2025)).toEqual([2024, 2025, 2026])
  })

  it('desliga um ano que não é o único', () => {
    expect(alternarAno([2025, 2026], 2025)).toEqual([2026])
    expect(alternarAno([2024, 2025, 2026], 2025)).toEqual([2024, 2026])
  })

  it('clicar no ÚNICO selecionado não o desmarca (sempre ao menos um)', () => {
    expect(alternarAno([2026], 2026)).toEqual([2026])
  })

  it(`com ${MAX_ANOS} selecionados, um ano novo não entra`, () => {
    expect(alternarAno([2024, 2025, 2026], 2023)).toEqual([2024, 2025, 2026])
  })

  it('não muta a entrada', () => {
    const sel = [2025, 2026]
    alternarAno(sel, 2024)
    expect(sel).toEqual([2025, 2026])
  })
})

describe('anoBloqueado / serializarAnos', () => {
  it('bloqueia a pill não selecionada só quando o teto foi atingido', () => {
    expect(anoBloqueado([2025, 2026], 2024)).toBe(false)
    expect(anoBloqueado([2024, 2025, 2026], 2023)).toBe(true)
    expect(anoBloqueado([2024, 2025, 2026], 2025)).toBe(false) // a selecionada continua clicável
  })

  it('serializa em ordem crescente e sem repetição; ida e volta com o parse', () => {
    expect(serializarAnos([2026, 2025])).toBe('2025,2026')
    expect(serializarAnos([2025, 2025])).toBe('2025')
    expect(anosDaUrl({ anos: serializarAnos([2026, 2024]) }, CORRENTE)).toEqual([2024, 2026])
  })
})
