import { describe, it, expect } from 'vitest'
import * as XLSX from '@e965/xlsx'
import {
  parseDemonstrativoCompetenciaFile,
  parseDemonstrativoCompetenciaRows,
  somaCentavos,
  DEMONSTRATIVO_COMPETENCIA_COLUNAS,
} from './parse-demonstrativo-competencia'

// Guard de ingestão da base de COMPETÊNCIA (v5.8.0, M1).
//
// Entra por `...File()` e não por `...Rows()` de propósito — lição da v5.5.2: a suíte
// tinha 753 provas dos parsers e todas montavam a matriz na mão, então o bug ×1000, que
// morava na EXTRAÇÃO (a opção do `sheet_to_json`), passou por baixo de todas. Um guard de
// ingestão precisa montar um .xlsx de verdade.
//
// Os números do arquivo VIVO (3.244 linhas, Σ 568.937,62, 141 pares) NÃO são cravados
// aqui: a fonte é um export que o Yan re-gera, e teste que crava número de dado editável
// nasce falso-vermelho (lição da v5.7.2). Eles vivem no oráculo, que mede a base
// carregada. Aqui se prova o COMPORTAMENTO do parser.

const HEADERS = ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês', 'Mês Nº', 'Competência', 'Valor']

/** Monta um .xlsx REAL em memória e o embrulha num File, como o upload faz. */
function arquivoXlsx(aoa: unknown[][], nome = 'demonstrativo.xlsx'): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], nome)
}

/** Meio-dia LOCAL — a data sobrevive à leitura em qualquer fuso. */
const D = (iso: string) => new Date(`${iso}T12:00:00`)

describe('parse-demonstrativo-competencia · leitura do arquivo', () => {
  it('lê as 8 colunas e deriva a competência do Ano + Mês Nº', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        HEADERS,
        ['Receitas', 'Receita de Vendas', 'Carta de Crédito', 2026, 'fevereiro', 2, D('2026-02-01'), 1903.32],
        ['Despesas', 'Despesas Administrativas', 'Copa e Cozinha', 2025, 'dezembro', 12, D('2025-12-01'), -55.66],
      ]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(2)
    expect(res[0]).toEqual({
      tipo: 'Receitas',
      grupo: 'Receita de Vendas',
      descricao: 'Carta de Crédito',
      ano: 2026,
      mes: 'fevereiro',
      mes_num: 2,
      competencia: '2026-02-01',
      valor: 1903.32,
    })
    // sinal PRESERVADO: despesa é negativa na base, não módulo
    expect(res[1].valor).toBe(-55.66)
    expect(res[1].competencia).toBe('2025-12-01')
  })

  it('valor com 3 casas decimais NÃO é multiplicado por 1000 (guard v5.5.2)', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        HEADERS,
        ['Despesas', 'Despesas Administrativas', 'Material de Escritório', 2025, 'outubro', 10, D('2025-10-01'), -40.933],
      ]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    // O que este guard trava é a leitura como MILHAR: -40.933 não pode virar -40933.
    expect(res[0].valor).not.toBe(-40933)
    // E o valor sai em 2 casas, porque é isso que a coluna NUMERIC(18,2) vai guardar —
    // o parser arredonda explicitamente (regra do Postgres) em vez de deixar a fronteira
    // arredondar por conta própria e a conferência de soma discordar.
    expect(res[0].valor).toBe(-40.93)
  })

  it('meio-centavo NEGATIVO arredonda como o Postgres, não como Math.round', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        HEADERS,
        ['Despesas', 'Despesas Administrativas', 'Copa e Cozinha', 2025, 'março', 3, D('2025-03-01'), -1.005],
      ]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    // meio-para-longe-de-zero: -1,005 → -1,01. `Math.round(-1.005*100)` daria -100.
    expect(res[0].valor).toBe(-1.01)
    expect(somaCentavos(res)).toBe(-101)
    expect(somaCentavos(res)).not.toBe(Math.round(-1.005 * 100))
  })

  it('funciona SEM a coluna Competência — os inteiros bastam', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês', 'Mês Nº', 'Valor'],
        ['Receitas', 'Receitas da venda', 'Comissão', 2024, 'julho', 7, 10],
      ]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].competencia).toBe('2024-07-01')
  })

  it('valor ZERO é linha válida (zero real ≠ ausência)', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([HEADERS, ['Receitas', 'Receita de Vendas', 'Comissão', 2024, 'julho', 7, D('2024-07-01'), 0]]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
    expect(res[0].valor).toBe(0)
  })

  it('cabeçalho sem acento e com variante casa por normalização', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        ['tipo', 'GRUPO', 'Descricao', 'ano', 'Mes', 'Mes Numero', 'Valor'],
        ['Despesas', 'Despesas Marketing', 'Mídia Paga', 2025, 'maio', 5, -100.5],
      ]),
    )

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].descricao).toBe('Mídia Paga')
    expect(res[0].mes_num).toBe(5)
  })
})

describe('parse-demonstrativo-competencia · nada some em silêncio', () => {
  it('Competência do arquivo divergindo de Ano+Mês DERRUBA o parse (não grava torto)', async () => {
    const res = await parseDemonstrativoCompetenciaFile(
      arquivoXlsx([
        HEADERS,
        ['Receitas', 'Receita de Vendas', 'Comissão', 2025, 'fevereiro', 2, D('2025-03-01'), 10],
      ]),
    )

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toMatch(/Competência/)
    expect(res.error).toMatch(/2025-03-01/)
  })

  it('linha com conteúdo mas sem Grupo/Descrição derruba o parse nomeando a linha', () => {
    const res = parseDemonstrativoCompetenciaRows([
      HEADERS,
      ['Receitas', 'Receita de Vendas', 'Comissão', 2024, 'julho', 7, null, 10],
      ['Receitas', null, null, 2024, 'julho', 7, null, 999],
    ])

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    // a linha ruim é a 3ª da planilha (cabeçalho = 1)
    expect(res.error).toMatch(/\b3\b/)
    expect(res.error).toMatch(/Grupo\/Descrição/)
  })

  it('Tipo em branco derruba o parse (é coluna obrigatória, não decorativa)', () => {
    const res = parseDemonstrativoCompetenciaRows([
      HEADERS,
      [null, 'Receita de Vendas', 'Comissão', 2024, 'julho', 7, null, 10],
    ])

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toMatch(/Tipo/)
  })

  it('arquivo que não é .xlsx é recusado — arrastar-e-soltar burla o accept', async () => {
    // O `accept` do input filtra só o seletor nativo. E o CSV não tem valor nativo de
    // célula, do qual este parser depende: aceitar leria torto em vez de falhar.
    const res = await parseDemonstrativoCompetenciaFile(
      new File(['Tipo,Grupo\nReceitas,X'], 'demonstrativo.csv'),
    )

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toMatch(/\.xlsx/)
  })

  it('Mês Nº fora de 1–12 derruba o parse', () => {
    const res = parseDemonstrativoCompetenciaRows([
      HEADERS,
      ['Receitas', 'Receita de Vendas', 'Comissão', 2024, 'treze', 13, null, 10],
    ])

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toMatch(/Mês Nº/)
  })

  it('linha totalmente vazia é pulada sem erro (não há valor a perder)', () => {
    const res = parseDemonstrativoCompetenciaRows([
      HEADERS,
      ['Receitas', 'Receita de Vendas', 'Comissão', 2024, 'julho', 7, null, 10],
      [null, null, null, null, null, null, null, null],
      ['   ', '', null, null, null, null, null, null],
    ])

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
  })

  it('coluna obrigatória ausente é reprovada por nome', () => {
    const res = parseDemonstrativoCompetenciaRows([
      ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês Nº'], // sem Valor
      ['Receitas', 'Receita de Vendas', 'Comissão', 2024, 7],
    ])

    expect(Array.isArray(res)).toBe(false)
    if (Array.isArray(res)) return
    expect(res.error).toMatch(/Valor/)
  })

  it('expõe ao card exatamente as 6 colunas obrigatórias do briefing', () => {
    expect(DEMONSTRATIVO_COMPETENCIA_COLUNAS).toEqual([
      'Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês Nº', 'Valor',
    ])
  })
})

describe('somaCentavos · fonte única da conferência arquivo × base', () => {
  it('soma em centavos inteiros, sem erro de ponto flutuante', () => {
    const linhas = [0.1, 0.2, -0.3].map((valor, i) => ({
      tipo: 'Receitas',
      grupo: 'G',
      descricao: `D${i}`,
      ano: 2025,
      mes: null,
      mes_num: 1,
      competencia: '2025-01-01',
      valor,
    }))

    // 0.1 + 0.2 - 0.3 em float dá 5.55e-17, não 0
    expect(linhas.reduce((a, l) => a + l.valor, 0)).not.toBe(0)
    expect(somaCentavos(linhas)).toBe(0)
  })

  it('preserva o sinal e agrega valores grandes ao centavo', () => {
    const linhas = [11053664.84, -6229759.2, 18681987.7].map((valor, i) => ({
      tipo: 'Receitas',
      grupo: 'G',
      descricao: `D${i}`,
      ano: 2025,
      mes: null,
      mes_num: 1,
      competencia: '2025-01-01',
      valor,
    }))

    expect(somaCentavos(linhas)).toBe(1105366484 - 622975920 + 1868198770)
  })
})
