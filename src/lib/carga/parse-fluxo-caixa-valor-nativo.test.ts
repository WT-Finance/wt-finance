import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from '@e965/xlsx'
import { parseLancamentosMovimentacaoFile } from './parse-lancamentos-movimentacao'
import { parseTitulosEmAbertoFile } from './parse-titulos-em-aberto'

// GUARD do bug ×1000 da v5.5.2 (investigação de 2026-08-10).
//
// O defeito: os dois parsers do Fluxo/DRE liam a planilha com `sheet_to_json({ raw: false })`,
// que DESCARTA o valor nativo da célula e entrega a string de exibição. A célula numérica
// -40.933 (R$ 40,93, ponto decimal) virava a string "-40.933", que casa o padrão de MILHAR BR
// do toNum (`^-?\d{1,3}(\.\d{3})+$`) e era lida como -40933 — ×1000 silencioso em TODO valor
// com exatamente 3 casas decimais. Distorceu a DRE a ponto de INVERTER o sinal do resultado
// de 2024 e de 2025.
//
// POR QUE ESTE TESTE PRECISA PASSAR POR `...File()` E NÃO POR `...Rows()`:
// a suíte já tinha cobertura farta dos parsers — mas toda ela chama `parseXxxRows(matriz)`,
// que recebe a matriz JÁ EXTRAÍDA. O defeito morava exatamente na extração (a opção do
// `sheet_to_json`), então 753 testes passaram por cima dele. Um guard que monte a matriz na
// mão NÃO reprova o bug: ele precisa de um arquivo XLSX de verdade.
//
// A regra que este teste ancora é a §3 da skill `ingestao-planilhas` — "ler o valor NATIVO da
// célula, nunca a string formatada" —, que já valia para datas e vale igualmente para dinheiro.

const HEADERS_MOV = [
  'Grupo de Categoria', 'Categoria', 'Numero', 'Venda Nº', 'Emissao', 'Vencimento',
  'Liquidacao', 'Movimentação', 'Pessoa', 'Descricao', 'Descricao_Categoria', 'Valor', 'Conta',
]
const HEADERS_ABE = [
  'Grupo de Categoria', 'Categoria', 'Numero', 'Venda Nº', 'Emissao', 'Vencimento',
  'Liquidacao', 'Pessoa', 'Descricao', 'Descricao_Categoria', 'Valor', 'Conta',
]

/** Monta um .xlsx REAL em memória e o embrulha num File, como o upload faz. */
function arquivoXlsx(aoa: unknown[][], nome = 'teste.xlsx'): File {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Plan1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], nome)
}

const D = (iso: string) => new Date(`${iso}T12:00:00`)

describe('valor com 3 casas decimais NÃO pode ser multiplicado por 1000 (guard v5.5.2)', () => {
  it('movimentação: célula numérica -40.933 chega como -40.933, não -40933', async () => {
    const arquivo = arquivoXlsx([
      HEADERS_MOV,
      ['Despesas', 'Material de Escritório', '184467-1', null, D('2025-10-16'), D('2025-10-16'),
       D('2025-10-16'), D('2025-10-16'), 'Shopee.com', 'Endomarketing 1/4', null,
       -40.933, 'WCLARA - BRUNA'],
    ])
    const res = await parseLancamentosMovimentacaoFile(arquivo)

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
    expect(res[0].valor).toBeCloseTo(-40.933, 3)
    expect(res[0].valor).not.toBe(-40933)
  })

  it('em aberto: célula numérica 188.615 chega como 188.615, não 188615', async () => {
    const arquivo = arquivoXlsx([
      HEADERS_ABE,
      ['Despesas', 'Endomarketing', '176530-2', null, D('2025-06-02'), D('2025-07-02'),
       null, 'MG Produções', 'Endomarketing 2/2', null, 188.615, 'Banco Itau'],
    ])
    const res = await parseTitulosEmAbertoFile(arquivo)

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(1)
    expect(res[0].valor).toBeCloseTo(188.615, 3)
    expect(res[0].valor).not.toBe(188615)
  })

  it('varre a faixa inteira do gatilho (1 a 3 dígitos inteiros × 3 decimais)', async () => {
    // O padrão de milhar BR é `^-?\d{1,3}(\.\d{3})+$` — só dispara com 1–3 dígitos na parte
    // inteira e exatamente 3 decimais. 4 casas (30.4322) ou 4+ dígitos inteiros (1234.567)
    // nunca casaram e já passavam corretos; ficam aqui para provar que seguem passando.
    const casos = [-0.016, 1.234, -26.394, 107.626, 659.532, -872.566, 30.4322, 1234.567]
    const arquivo = arquivoXlsx([
      HEADERS_MOV,
      ...casos.map((v, i) => [
        'G', 'Categoria', `T-${i}`, null, D('2025-01-02'), D('2025-01-02'),
        D('2025-01-02'), D('2025-01-02'), 'Fornecedor', 'Linha', null, v, 'Conta',
      ]),
    ])
    const res = await parseLancamentosMovimentacaoFile(arquivo)

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res).toHaveLength(casos.length)
    res.forEach((linha, i) => expect(linha.valor).toBeCloseTo(casos[i], 4))
  })

  it('não regride o caminho de TEXTO: "-1.234,56" continua -1234,56 e a data não inverte', async () => {
    // Célula genuinamente textual (o que um CSV entrega) segue pela regra BR do toNum,
    // que permanece intocado. A data vai como Date nativo e não pode virar 6 de agosto.
    const arquivo = arquivoXlsx([
      HEADERS_MOV,
      ['Despesas', 'Aluguel', '123', '456', D('2026-06-01'), D('2026-06-05'),
       D('2026-06-05'), D('2026-06-08'), 'Fornecedor X', 'Aluguel', null,
       '-1.234,56', 'Conta Corrente'],
    ])
    const res = await parseLancamentosMovimentacaoFile(arquivo)

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].valor).toBe(-1234.56)
    expect(res[0].data_movimentacao).toBe('2026-06-08')  // 8 de junho, não 6 de agosto
    expect(res[0].venda_no).toBe(456)
    expect(res[0].numero).toBe('123')
  })
})

describe('CSV: texto puro segue a regra BR do toNum (v5.5.2)', () => {
  // CSV não carrega tipo — só texto. O `XLSX.read(..., { raw: false })` fazia o SheetJS
  // interpretar a célula com convenção AMERICANA antes de qualquer coerção nossa, e
  // "-1.234,56" chegava ao banco como -1,23456 (÷1000, medido). Com `raw: true` a string
  // sobrevive e o toNum aplica a regra BR, que é o contrato documentado para texto.
  const CSV_HEADER = HEADERS_MOV.join(',')

  it('"-1.234,56" num CSV vira -1234,56, não -1,23456', async () => {
    const csv = [
      CSV_HEADER,
      'G,Aluguel,123,456,2026-06-01,2026-06-05,2026-06-05,2026-06-08,Forn,Aluguel,,"-1.234,56",Conta',
    ].join('\n')
    const res = await parseLancamentosMovimentacaoFile(new File([csv], 'teste.csv'))

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].valor).toBe(-1234.56)
    expect(res[0].data_movimentacao).toBe('2026-06-08')
  })

  it('LIMITAÇÃO CONHECIDA: em CSV, "-40.933" é indistinguível de milhar BR', async () => {
    // Sem tipo nativo a ambiguidade é irredutível — "-40.933" pode ser R$ 40,93 (decimal US)
    // ou R$ 40.933,00 (milhar BR), e o toNum escolhe a leitura BR por contrato. Este teste
    // FIXA o comportamento para que a limitação seja explícita, não uma surpresa: os exports
    // do Monde são .xlsx (célula tipada), e é esse caminho que a v5.5.2 tornou exato.
    const csv = [CSV_HEADER, 'G,Cat,T1,,2025-10-16,2025-10-16,2025-10-16,2025-10-16,P,D,,-40.933,C'].join('\n')
    const res = await parseLancamentosMovimentacaoFile(new File([csv], 'teste.csv'))

    expect(Array.isArray(res)).toBe(true)
    if (!Array.isArray(res)) return
    expect(res[0].valor).toBe(-40933)   // leitura BR — documentada, não acidental
  })
})

// SONDA MECÂNICA — a correção acima vale para os DOIS parsers do Fluxo/DRE, mas o defeito
// é de classe: qualquer parser que peça `raw: false` ao `sheet_to_json` volta a trocar o
// valor nativo pela string de exibição. O default do SheetJS já é `raw: true`, então o modo
// seguro é o modo de não escrever nada — e foi justamente o `raw: false` EXPLÍCITO que
// distinguiu os dois parsers quebrados dos demais (que sempre omitiram a opção).
// Esta sonda varre o diretório e reprova a reintrodução, em vez de confiar em revisão.
describe('sonda: nenhum parser de carga pede `raw: false` ao sheet_to_json', () => {
  it('varre src/lib/carga/ e src/lib/rateio/', () => {
    const dirs = [join(process.cwd(), 'src/lib/carga'), join(process.cwd(), 'src/lib/rateio')]
    const infratores: string[] = []

    for (const dir of dirs) {
      for (const nome of readdirSync(dir)) {
        if (!nome.endsWith('.ts') || nome.endsWith('.test.ts')) continue
        const src = readFileSync(join(dir, nome), 'utf8')
        // Casa `sheet_to_json(... raw: false ...)` mesmo com quebras de linha entre os args.
        for (const m of src.matchAll(/sheet_to_json[\s\S]{0,300}?\)/g)) {
          if (/raw\s*:\s*false/.test(m[0])) infratores.push(nome)
        }
      }
    }

    expect(infratores).toEqual([])
  })
})
