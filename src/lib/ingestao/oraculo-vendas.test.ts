import { describe, it, expect } from 'vitest'
import {
  parseVendasProdutoRows, classificarSetorMicro, classificarSetorMacro, semanaDoAno,
} from './parsers/vendas-produto'
import {
  lerMatrizXlsx, porCabecalho, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES,
} from './fixtures-oraculo'
import { toCentavos } from '@/lib/carga/coercao'

// ── GATE 1 · Oráculo cru ↔ tratado de Vendas por Produto ─────────────────────────────────────
//
// Anexo §9: crus `23.xlsx` (12.626), `24.xlsx` (11.770), `25-26.xlsx` (24.472) — contando
// cabeçalho e linha de totais → tratado `VendasPorProduto_tratada.xlsx` (48.652×21).
//
// ⚠️ Esta é a única base em que o tratado NÃO é comparável linha a linha sem alinhamento, e o
// briefing §9 avisa: o script R filtrava Welcome e zerava `Intermediário` ANTES de gravar. O
// oráculo da v6 compara o conjunto **antes** do filtro (48.862 linhas do cru) e **com**
// `Intermediário`, então:
//   • para casar com o tratado, as linhas de Welcome saem AQUI, no teste — não no parser;
//   • `Intermediário` é a única coluna com divergência esperada, e ela é enumerada.

const CRUS = ['vendas-cru-23.xlsx', 'vendas-cru-24.xlsx', 'vendas-cru-25-26.xlsx'] as const
const TRATADO = 'vendas-tratado.xlsx'
const AUSENTES = fixturesAusentes([...CRUS, TRATADO])

/** "Hoje" FIXO (data do export). `REQUIRE_FIXTURES=1` torna fixture ausente falha alta. */
const HOJE = new Date(Date.UTC(2026, 8, 21))

/** Linhas do cru somando os três arquivos, sem cabeçalho e sem linha de totais. */
const LINHAS_CRU = 48_862
/** Linhas do tratado — o cru menos as vendas do setor Welcome. */
const LINHAS_TRATADO = 48_652
/** Células de data que a guarda de faixa recusa DENTRO do conjunto que o tratado cobre.
 *  MEDIDO no anexo de 21/09: 10 células. O briefing §2.2 falava em "Vendas 5", contando só as
 *  `Data Venda`; as outras cinco estão em `Data Início` (evento anterior a 2015). */
const DATAS_REJEITADAS_NO_TRATADO = 10
/** No conjunto INTEIRO (incluindo as linhas de Welcome, que o tratado não cobre) são 15. */
const DATAS_REJEITADAS_NO_CRU = 15

function diaUtc(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}
function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  return typeof v === 'number' ? v : Number(v)
}

it('as fixtures do oráculo estão presentes (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Vendas por Produto', () => {
  const arquivos = CRUS.map((nome) => ({ nome, rows: lerMatrizXlsx(nome) }))
  const resultado = parseVendasProdutoRows(arquivos, { hoje: HOJE })
  const tratado = porCabecalho(lerMatrizXlsx(TRATADO))

  it('o parse dos três arquivos fecha — 5 checksums por arquivo', () => {
    if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
    // 4 entradas por arquivo (uma por soma); a contagem de linhas viaja na primeira delas,
    // fechando os 5 checksums por arquivo do contrato §4.
    expect(resultado.checksums).toHaveLength(CRUS.length * 4)
    const comContagem = resultado.checksums.filter((c) => c.linhasDeclaradas !== null)
    expect(comContagem).toHaveLength(CRUS.length)
    expect(comContagem.map((c) => c.linhasDeclaradas)).toEqual([12_624, 11_768, 24_470])
    expect(resultado.linhas).toHaveLength(LINHAS_CRU)
    expect(resultado.datasRejeitadas).toHaveLength(DATAS_REJEITADAS_NO_CRU)
  })

  it('o conjunto sem Welcome tem exatamente as linhas do tratado', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const semWelcome = resultado.linhas.filter((l) => l.setor_macro !== 'Welcome')
    expect(semWelcome).toHaveLength(LINHAS_TRATADO)
    expect(tratado).toHaveLength(LINHAS_TRATADO)
    // O filtro é do teste, não do parser: a base entregue traz o arquivo inteiro (decisão 8).
    expect(resultado.linhas.length - semWelcome.length).toBe(LINHAS_CRU - LINHAS_TRATADO)
  })

  it('célula a célula contra o tratado — só `Intermediário` diverge, e por construção', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const meus = resultado.linhas.filter((l) => l.setor_macro !== 'Welcome')
    const divergencias: { coluna: string; linha: number; meu: unknown; dele: unknown }[] = []
    let celulas = 0

    meus.forEach((meu, i) => {
      const dele = tratado[i]
      const pares: [string, unknown, unknown][] = [
        ['Venda Nº',        meu.venda_numero,        txt(dele['Venda Nº'])],
        ['Data Venda',      meu.data_venda,          diaUtc(dele['Data Venda'])],
        ['Data Início',     meu.data_inicio,         diaUtc(dele['Data Início'])],
        ['Vendedor',        meu.vendedor,            txt(dele['Vendedor'])],
        ['Intermediário',   meu.intermediario,       txt(dele['Intermediário'])],
        ['Pagante',         meu.pagante,             txt(dele['Pagante'])],
        ['Passageiros',     meu.passageiros,         txt(dele['Passageiros'])],
        ['Setor',           meu.setor,               txt(dele['Setor'])],
        ['Produto',         meu.produto,             txt(dele['Produto'])],
        ['Contr./ Voucher', meu.tipo_contrato,       txt(dele['Contr./ Voucher'])],
        ['Fornecedor',      meu.fornecedor,          txt(dele['Fornecedor'])],
        ['Receitas',        toCentavos(meu.receitas),    toCentavos(dele['Receitas'])],
        ['Valor Total',     toCentavos(meu.valor_total), toCentavos(dele['Valor Total'])],
        ['Situação',        meu.situacao,            txt(dele['Situação'])],
        ['Operação Propria', meu.operacao_propria,   txt(dele['Operação Propria'])],
        ['Semana',          meu.semana,              num(dele['Semana'])],
        ['Setor Macro',     meu.setor_macro,         txt(dele['Setor Macro'])],
        ['Mes',             meu.mes,                 txt(dele['Mes'])],
        ['Setor Micro',     meu.setor_micro,         txt(dele['Setor Micro'])],
        ['Contrato',        meu.contrato,            num(dele['Contrato'])],
        ['Taxa de Serviço', meu.taxa_servico,        num(dele['Taxa de Serviço'])],
      ]
      for (const [coluna, m, d] of pares) {
        celulas++
        if (m !== d) divergencias.push({ coluna, linha: i + 1, meu: m, dele: d })
      }
    })

    // `Intermediário` é a divergência ESPERADA: o R zerava a coluna inteira, eu preservo o cru.
    // Toda divergência dela tem de ser exatamente desta forma (tratado nulo, meu preenchido).
    const intermediario = divergencias.filter((d) => d.coluna === 'Intermediário')
    const malFormadas = intermediario.filter((d) => d.dele !== null || d.meu === null)
    expect(malFormadas.slice(0, 10), 'divergência de Intermediário fora do padrão esperado').toEqual([])

    // As colunas de data podem divergir SÓ no sentido da guarda de faixa: eu emito `null` onde o
    // legado deixou passar data impossível (o cru tem `Data Início` em 2003, entre outras). Eu
    // com data e o R com `null` seria defeito meu.
    const colunasDeData = new Set(['Data Venda', 'Data Início'])
    const dataMalFormada = divergencias.filter((d) => colunasDeData.has(d.coluna) && d.meu !== null)
    expect(dataMalFormada.slice(0, 10), 'divergência de data em que o parser NÃO está rejeitando').toEqual([])

    const outras = divergencias.filter(
      (d) => d.coluna !== 'Intermediário' && !colunasDeData.has(d.coluna))
    expect(outras.slice(0, 20), `${outras.length} divergência(s) além de Intermediário e datas (de ${celulas} células)`)
      .toEqual([])

    // 1.021.692 células — o número que o briefing §2.1 declara para esta base.
    expect(celulas).toBe(1_021_692)
    expect(celulas).toBe(LINHAS_TRATADO * 21)
    expect(intermediario.length).toBeGreaterThan(0)
    // As datas recusadas pela guarda são as que divergem do tratado, e são CONTADAS.
    const zeradas = divergencias.filter((d) => colunasDeData.has(d.coluna))
    expect(zeradas.length).toBe(DATAS_REJEITADAS_NO_TRATADO)
  })

  it('nenhum dado pessoal atravessa o parser (decisão 3 / invariante 6)', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const campos = Object.keys(resultado.linhas[0])
    for (const proibido of ['cpf', 'cnpj', 'email', 'e_mail', 'tipo_pessoa']) {
      expect(campos.some((c) => c.toLowerCase().includes(proibido)), `campo "${proibido}"`).toBe(false)
    }
    // E o valor também não: nenhuma célula emitida pode conter um CPF/CNPJ do cru.
    const primeiros = resultado.linhas.slice(0, 500)
    const temDocumento = primeiros.some((l) =>
      Object.values(l).some((v) => typeof v === 'string' && /^\d{11}$|^\d{14}$/.test(v.replace(/\D/g, '')) && v.replace(/\D/g, '').length >= 11))
    expect(temDocumento).toBe(false)
  })
})

// ── Sondas: cada regra VISTA reprovando por mutante ──────────────────────────────────────────

describe('sondas do parser de Vendas (mutante ⇒ reprova)', () => {
  it('`Setor Micro`: a classificação depende de a string estar APARADA', () => {
    // A sonda que o briefing §5-C pede, literalmente. No R, quem aparava era o default
    // `trim_ws` do `readxl` — e a regra inteira pendia desse default.
    expect(classificarSetorMicro('Weddings', 'Transporte Rodoviario')).toBe('Extras')
    expect(classificarSetorMicro('Weddings', 'Transporte Rodoviario ')).toBe('Weddings')
    // CONTROLE do caminho completo: com espaço no cru, o parser ainda classifica como Extras,
    // porque apara antes de classificar.
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: matrizMinima({ produto: 'Transporte Rodoviario ' }) }], { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas[0].produto).toBe('Transporte Rodoviario')
    expect(r.linhas[0].setor_micro).toBe('Extras')
  })

  it('`Setor Micro`: WedMe entra em Hospedagem mas NUNCA em Extras (ordem das cláusulas)', () => {
    expect(classificarSetorMicro('WedMe', 'Diárias de Hospedagem')).toBe('Hospedagem')
    expect(classificarSetorMicro('WedMe', 'Passagem Aérea')).toBe('WedMe')
    expect(classificarSetorMicro('Weddings', 'Passagem Aérea')).toBe('Extras')
    expect(classificarSetorMicro('Produção', 'Diárias de Hospedagem')).toBe('Produção')
  })

  it('`Setor Macro`: fallback mantém o setor original, e Welcome é reconhecido', () => {
    expect(classificarSetorMacro('Corporativo')).toBe('Corporativo')
    expect(classificarSetorMacro('Expedições')).toBe('Lazer')
    expect(classificarSetorMacro('Produção')).toBe('Weddings')
    expect(classificarSetorMacro('Welcome')).toBe('Welcome')
    expect(classificarSetorMacro('Setor Novo')).toBe('Setor Novo')
  })

  it('`Semana` é o calendário do legado: reinicia no ano, vira no domingo', () => {
    // 2023-01-01 foi domingo. Com o conjunto começando em 02/01, a semana 1 vai de 02 a 07.
    expect(semanaDoAno('2023-01-02', '2023-01-02')).toBe(1)
    expect(semanaDoAno('2023-01-07', '2023-01-02')).toBe(1)
    expect(semanaDoAno('2023-01-08', '2023-01-02')).toBe(2)
    // Ano seguinte reinicia do 1, sem continuidade.
    expect(semanaDoAno('2024-01-01', '2023-01-02')).toBe(1)
    // O caso medido no anexo: 18/09/2026 é a semana 38.
    expect(semanaDoAno('2026-09-18', '2023-01-02')).toBe(38)
  })

  it('`Mes` sai de tabela FIXA, nunca de locale', () => {
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: matrizMinima({ dataVenda: new Date(2026, 4, 10) }) }], { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas[0].mes).toBe('mai')   // "May" em locale inglês seria outro texto
  })

  it('mutante: linha de totais ausente ⇒ ESTRUTURA_INESPERADA (o checksum não é opcional)', () => {
    const m = matrizMinima({})
    m.pop()
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: m }], { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('linha de totais')
  })

  it('mutante: soma da linha de totais diverge ⇒ CHECKSUM_FALHOU', () => {
    const m = matrizMinima({})
    m[m.length - 1][15] = 999
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: m }], { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: contagem da linha de totais diverge ⇒ CHECKSUM_FALHOU', () => {
    const m = matrizMinima({})
    m[m.length - 1][0] = 5
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: m }], { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: coluna obrigatória some do cabeçalho ⇒ ESTRUTURA_INESPERADA', () => {
    const m = matrizMinima({})
    m[0][14] = 'Prod'
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: m }], { hoje: HOJE_SONDA })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('produto')
  })

  it('`Intermediário` é preservado, ao contrário do que o R fazia', () => {
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: matrizMinima({ intermediario: 'Operação Welcome Trips' }) }], { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas[0].intermediario).toBe('Operação Welcome Trips')
  })

  it('o parser NÃO filtra Welcome — o filtro é da leitura (decisão 8)', () => {
    const r = parseVendasProdutoRows([{ nome: 'x.xlsx', rows: matrizMinima({ setor: 'Welcome' }) }], { hoje: HOJE_SONDA })
    if (!r.ok) throw new Error(r.mensagem)
    expect(r.linhas).toHaveLength(1)
    expect(r.linhas[0].setor_macro).toBe('Welcome')
  })
})

const HOJE_SONDA = new Date(Date.UTC(2026, 8, 21))

/** Uma planilha mínima de Vendas: cabeçalho de 26 colunas, uma venda e a linha de totais. */
function matrizMinima(over: {
  produto?: string; setor?: string; intermediario?: string | null; dataVenda?: Date
}): unknown[][] {
  const produto = over.produto ?? 'Diárias de Hospedagem'
  const setor = over.setor ?? 'Weddings'
  const dataVenda = over.dataVenda ?? new Date(2026, 0, 5)
  return [
    ['Venda Nº', 'Data Venda', 'Data Início', 'Data Fim', 'Pagante', 'Vendedor', 'Intermediário',
      'Setor', 'Passageiros', 'Vendedor(a) Responsável - Grupo', 'E-mail', 'CPF', 'CNPJ',
      'Tipo Pessoa', 'Produto', 'Valor Total', 'Receitas', 'Total Produtos Moeda Origem',
      'Fornecedor', 'Representante', 'Câmbio Operadora', 'Comissão (%)', 'Contr./ Voucher',
      'Situação', 'Reembolso ao Cliente', 'Operação Propria'],
    [100, dataVenda, new Date(2026, 1, 1), new Date(2026, 1, 3), 'Cliente', 'Vendedora',
      over.intermediario ?? null, setor, 'Passageiro', null, 'x@y.com', '12345678901', null, 'F',
      produto, 1000, 200, 900, 'Hotel', null, 1, 10, 'sim', 'Fechada', 0, null],
    [1, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
      1000, 200, 900, null, null, null, null, null, null, 0, null],
  ]
}
