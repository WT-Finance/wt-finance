import { describe, it, expect } from 'vitest'
import {
  parseContasReceberRows, lacunasDeVencimento, avisosDoDiagnostico, CONFERIDOS_VALIDOS,
  COL_MAP, OBRIGATORIOS, type ArquivoContasReceber,
} from './contas-receber'

// Sondas do parser de Contas a receber (v6.4.0). Todo dado aqui é FICTÍCIO — o parser lê campos que
// carregam nomes de pessoas no arquivo real (Pessoa, Descrição, Operação Própria), e nenhum teste,
// mensagem ou fixture deste módulo reproduz valor real delas.

const HOJE = new Date(Date.UTC(2026, 9, 15))

/** O cabeçalho REAL do export (17 colunas) — as 8 que não se gravam incluídas de propósito. */
const CABECALHO = [
  'Número', 'Emissão', 'Pessoa', 'Documento', 'Observações', 'Descrição', 'Conta (Previsão)',
  'Vencimento', 'Liquidação', 'Valor', 'Valor Final', 'Operação Própria', 'Conferido',
  'Pendente com:', 'Fatura Cliente Nº', 'Fatura Fornecedor Conferida', 'Fatura Cliente Fechada',
]
const COL = Object.fromEntries(CABECALHO.map((h, i) => [h, i])) as Record<string, number>

interface Titulo {
  numero?: unknown; emissao?: unknown; pessoa?: unknown; descricao?: unknown; vencimento?: unknown
  liquidacao?: unknown; valorFinal?: unknown; conferido?: unknown; operacaoPropria?: unknown
}

function linhaDe(t: Titulo): unknown[] {
  const l: unknown[] = new Array(CABECALHO.length).fill(null)
  l[COL['Número']] = t.numero ?? 1000
  l[COL['Emissão']] = t.emissao === undefined ? new Date(2026, 0, 5) : t.emissao
  l[COL['Pessoa']] = t.pessoa === undefined ? 'Cliente Ficticio' : t.pessoa
  l[COL['Documento']] = 'DOC-NAO-GRAVAR'
  l[COL['Observações']] = 'OBS-NAO-GRAVAR'
  l[COL['Descrição']] = t.descricao === undefined ? 'Pagamento venda' : t.descricao
  l[COL['Conta (Previsão)']] = 'CONTA-NAO-GRAVAR'
  l[COL['Vencimento']] = t.vencimento === undefined ? new Date(2026, 5, 10) : t.vencimento
  l[COL['Liquidação']] = t.liquidacao === undefined ? null : t.liquidacao
  l[COL['Valor']] = 999999
  l[COL['Valor Final']] = t.valorFinal === undefined ? 100 : t.valorFinal
  l[COL['Operação Própria']] = t.operacaoPropria === undefined ? null : t.operacaoPropria
  l[COL['Conferido']] = t.conferido === undefined ? null : t.conferido
  l[COL['Pendente com:']] = 'PENDENTE-NAO-GRAVAR'
  return l
}

function linhaDeTotal(contagem: unknown, soma: unknown): unknown[] {
  const l: unknown[] = new Array(CABECALHO.length).fill(null)
  l[COL['Número']] = contagem
  l[COL['Valor Final']] = soma
  return l
}

/** Matriz MUTÁVEL só no teste (os mutantes editam células); atribuível ao `Matriz` readonly do parser. */
type ArquivoMutavel = { nome: string; rows: unknown[][] }

/** Arquivo coerente: os títulos dados + a linha de total que FECHA (contagem e Σ derivadas). */
function arquivo(nome: string, titulos: Titulo[]): ArquivoMutavel {
  const soma = titulos.reduce((s, t) => s + Number(t.valorFinal === undefined ? 100 : t.valorFinal), 0)
  return { nome, rows: [CABECALHO, ...titulos.map(linhaDe), linhaDeTotal(titulos.length, soma)].map((l) => [...l]) }
}

function ok(arquivos: ArquivoContasReceber[]) {
  const r = parseContasReceberRows(arquivos, { hoje: HOJE })
  if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
  return r
}
function falha(arquivos: ArquivoContasReceber[]) {
  const r = parseContasReceberRows(arquivos, { hoje: HOJE })
  if (r.ok) throw new Error('esperava falha')
  return r
}

describe('lista fechada gravada (invariante 5)', () => {
  it('só as 9 colunas viram campo; as outras 8 não aparecem em nenhuma linha emitida', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])])
    expect(Object.keys(r.linhas[0]).sort()).toEqual([
      'arquivo_origem', 'conferido', 'descricao', 'emissao', 'linha_origem', 'liquidacao', 'numero',
      'operacao_propria', 'pessoa', 'valor_final', 'vencimento',
    ])
    const todas = JSON.stringify(r.linhas)
    for (const proibido of ['NAO-GRAVAR', '999999']) expect(todas).not.toContain(proibido)
    // E o diagnóstico declara o que foi lido só para mapear o cabeçalho.
    const arq = (r.diagnostico.arquivos as { colunasNaoMapeadas: string[] }[])[0]
    expect(arq.colunasNaoMapeadas).toEqual(expect.arrayContaining(['Documento', 'Observações', 'Valor', 'Pendente com:']))
  })

  it('COL_MAP/OBRIGATORIOS: nove campos, `Valor` (≠ `Valor Final`) fora', () => {
    expect(new Set(Object.values(COL_MAP)).size).toBe(9)
    expect(OBRIGATORIOS).toHaveLength(9)
    expect(Object.keys(COL_MAP)).not.toContain('Valor')
  })
})

describe('checksum por arquivo', () => {
  it('1 checksum por arquivo: {escopo:arquivo, chave:[nome], linhas, centavos}, tolerância 0', () => {
    const r = ok([
      arquivo('24.xlsx', [{ numero: 1, valorFinal: 10.5 }, { numero: 2, valorFinal: 20 }]),
      arquivo('25.xlsx', [{ numero: 3, valorFinal: 7.25 }]),
    ])
    expect(r.checksums).toHaveLength(2)
    expect(r.checksums[0]).toMatchObject({
      escopo: 'arquivo', chave: ['24.xlsx'], campo: 'valor_final',
      linhasDeclaradas: 2, centavosDeclarados: 3050, linhasApuradas: 2, centavosApurados: 3050, centavosArredondados: 3050,
    })
    expect(r.checksums[1]).toMatchObject({ chave: ['25.xlsx'], linhasDeclaradas: 1, centavosDeclarados: 725 })
    expect(r.linhas).toHaveLength(3)
  })

  it('a soma é a dos valores EXATOS arredondada uma vez (188,615 → 188,62; o gravado é 188,62)', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1, valorFinal: 188.615 }, { numero: 2, valorFinal: 188.615 }])])
    expect(r.linhas[0].valor_final).toBe(188.62)
    expect(r.checksums[0].centavosDeclarados).toBe(37723)  // 377,23 — 2 × 188,615 exato
    expect(r.checksums[0].centavosApurados).toBe(37723)
    expect(r.checksums[0].centavosArredondados).toBe(37724) // 2 × 188,62 — o que o banco vai somar
  })

  it('mutante: linha de total ausente ⇒ ESTRUTURA_INESPERADA', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }])
    const r = falha([{ nome: 'a.xlsx', rows: a.rows.slice(0, -1) }])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('linha de total')
  })

  it('mutante: Σ da linha de total diverge ⇒ CHECKSUM_FALHOU, nomeando o arquivo', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])
    a.rows[a.rows.length - 1][COL['Valor Final']] = 200.01
    const r = falha([a])
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
    expect(r.mensagem).toContain('"a.xlsx"')
  })

  it('mutante: contagem da linha de total diverge ⇒ CHECKSUM_FALHOU', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])
    a.rows[a.rows.length - 1][COL['Número']] = 3
    expect(falha([a]).codigo).toBe('CHECKSUM_FALHOU')
  })

  it('só UM arquivo reprovado reprova a carga, mesmo com os outros fechando', () => {
    const bom = arquivo('bom.xlsx', [{ numero: 1 }])
    const ruim = arquivo('ruim.xlsx', [{ numero: 2 }])
    ruim.rows[ruim.rows.length - 1][COL['Valor Final']] = 1
    const r = falha([bom, ruim])
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
    expect(r.mensagem).toContain('1 de 2')
    expect(r.mensagem).toContain('"ruim.xlsx"')
  })

  it('a linha de total é a ÚLTIMA com conteúdo: linhas em branco depois dela não a escondem', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }])
    a.rows.push(new Array(CABECALHO.length).fill(null), [])
    expect(ok([a]).linhas).toHaveLength(1)
  })

  it('segunda linha com a forma de total no meio do arquivo ⇒ ESTRUTURA_INESPERADA', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])
    a.rows.splice(2, 0, linhaDeTotal(7, 700))
    const r = falha([a])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('segunda linha de total')
  })

  it('arquivo só com cabeçalho e total ⇒ ESTRUTURA_INESPERADA (carga vazia é export errado)', () => {
    const r = falha([{ nome: 'a.xlsx', rows: [CABECALHO, linhaDeTotal(0, 0)] }])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('mutante: coluna obrigatória some do cabeçalho ⇒ ESTRUTURA_INESPERADA nomeando o campo', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }])
    a.rows[0] = a.rows[0].map((h) => (h === 'Conferido' ? 'Conferida' : h))
    const r = falha([a])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('conferido')
  })
})

describe('Número', () => {
  it('texto; número nativo da célula e sufixo -N viram texto', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 123456 }, { numero: '123456-2' }, { numero: ' 99 ' }])])
    expect(r.linhas.map((l) => l.numero)).toEqual(['123456', '123456-2', '99'])
  })

  it('título sem Número ⇒ ESTRUTURA_INESPERADA com o número da linha', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])
    a.rows[2][COL['Número']] = null
    const r = falha([a])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('linha 3')
  })
})

describe('Valor Final nunca negativo (zero é legítimo)', () => {
  it('negativo (arquivo misto pagar + receber) ⇒ reprova com o motivo, ANTES do checksum', () => {
    const r = falha([arquivo('a.xlsx', [{ numero: 1, valorFinal: 50 }, { numero: 2, valorFinal: -30 }])])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('a RECEBER')
    expect(r.mensagem).toContain('linhas 3')
  })

  it('zero PASSA — fatura zerada por compensação é título real (M1: 216 em 2024, 395 em 2025-26)', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1, valorFinal: 0 }, { numero: 2, valorFinal: 10 }])])
    expect(r.linhas.map((l) => l.valor_final)).toEqual([0, 10])
  })

  it('Valor Final ilegível ⇒ ESTRUTURA_INESPERADA', () => {
    const a = arquivo('a.xlsx', [{ numero: 1 }, { numero: 2 }])
    a.rows[1][COL['Valor Final']] = 'abc'
    const r = falha([a])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('linha 2')
    expect(r.mensagem).toContain('Valor Final')
  })
})

describe('Conferido', () => {
  it('vazio vira null e os quatro valores do domínio passam', () => {
    const titulos: Titulo[] = [
      { numero: 1, conferido: null }, { numero: 2, conferido: '  ' },
      ...CONFERIDOS_VALIDOS.map((conferido, i) => ({ numero: 10 + i, conferido })),
    ]
    const r = ok([arquivo('a.xlsx', titulos)])
    expect(r.linhas.map((l) => l.conferido)).toEqual([null, null, 'Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente'])
  })

  it('valor fora do domínio ⇒ a carga reprova', () => {
    const r = falha([arquivo('a.xlsx', [{ numero: 1, conferido: 'Talvez' }])])
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('Conferido')
    expect(r.mensagem).toContain('Talvez')
  })

  it('o domínio é exatamente o do CHECK da base', () => {
    expect([...CONFERIDOS_VALIDOS]).toEqual(['Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente'])
  })
})

describe('datas', () => {
  it('Emissão com data zero do Excel ⇒ null + aviso contado; o título permanece e o checksum fecha', () => {
    const r = ok([arquivo('a.xlsx', [
      { numero: 1, emissao: new Date(1899, 11, 30) },
      { numero: 2 },
      { numero: 3, emissao: new Date(1899, 11, 30) },
    ])])
    expect(r.linhas).toHaveLength(3)
    expect(r.linhas.map((l) => l.emissao)).toEqual([null, '2026-01-05', null])
    expect(r.datasRejeitadas.filter((d) => d.campo === 'emissao')).toHaveLength(2)
    expect(avisosDoDiagnostico(r.diagnostico).some((a) => a.startsWith('2 título(s) com Emissão inválida'))).toBe(true)
    expect(r.checksums[0].linhasApuradas).toBe(3)
  })

  it('data válida segue o valor nativo da célula, sem deslocar o dia', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1, emissao: new Date(2026, 2, 3), vencimento: new Date(2026, 11, 31), liquidacao: new Date(2026, 6, 9) }])])
    expect(r.linhas[0]).toMatchObject({ emissao: '2026-03-03', vencimento: '2026-12-31', liquidacao: '2026-07-09' })
  })

  it('Liquidação vazia = em aberto (null, sem aviso); Liquidação ilegível NÃO passa calada', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1 }, { numero: 2, liquidacao: new Date(1899, 11, 30) }])])
    expect(r.linhas.map((l) => l.liquidacao)).toEqual([null, null])
    const avisos = avisosDoDiagnostico(r.diagnostico)
    expect(avisos).toHaveLength(1)
    expect(avisos[0]).toContain('1 título(s) com Liquidação inválida')
  })

  it('Vencimento fora da faixa vira null, é contado e avisado (errata 1 do contrato)', () => {
    const r = ok([arquivo('a.xlsx', [{ numero: 1, vencimento: new Date(2049, 5, 1) }, { numero: 2 }])])
    expect(r.linhas[0].vencimento).toBeNull()
    expect(avisosDoDiagnostico(r.diagnostico).some((a) => a.includes('Vencimento inválido ou fora da faixa'))).toBe(true)
  })
})

describe('lacuna entre as faixas de vencimento (aviso, não bloqueia)', () => {
  const f = (nome: string, min: string, max: string) => ({ nome, min, max })

  it('contíguas (31/12 → 01/01) não geram lacuna; uma lacuna de dias gera, com a contagem', () => {
    expect(lacunasDeVencimento([f('a', '2024-01-01', '2024-12-31'), f('b', '2025-01-01', '2026-06-30')])).toEqual([])
    const l = lacunasDeVencimento([f('a', '2024-01-01', '2024-12-31'), f('b', '2025-01-05', '2026-06-30')])
    expect(l).toEqual([{
      fim: '2024-12-31', inicio: '2025-01-05', diasSemCobertura: 4, arquivoAntes: 'a', arquivoDepois: 'b',
    }])
  })

  it('1 dia de buraco já é lacuna (31/12 → 02/01 deixa 01/01 de fora)', () => {
    expect(lacunasDeVencimento([f('a', '2024-01-01', '2024-12-31'), f('b', '2025-01-02', '2025-12-31')])[0].diasSemCobertura).toBe(1)
  })

  it('ordena por início (a ordem dos arquivos na seleção não importa) e faixas que se sobrepõem não geram lacuna', () => {
    expect(lacunasDeVencimento([f('b', '2025-01-01', '2025-12-31'), f('a', '2024-01-01', '2025-03-01')])).toEqual([])
    expect(lacunasDeVencimento([f('c', '2026-01-01', '2026-12-31'), f('a', '2024-01-01', '2024-12-31'), f('b', '2025-01-01', '2025-12-31')])).toEqual([])
  })

  it('compara com o MAIOR fim visto (uma faixa contida em outra não "encurta" a cobertura)', () => {
    // a cobre até 2025-12-31; b (contida) termina em 2024-06-30; c começa em 2026-01-01 ⇒ contíguo.
    expect(lacunasDeVencimento([f('a', '2024-01-01', '2025-12-31'), f('b', '2024-02-01', '2024-06-30'), f('c', '2026-01-01', '2026-12-31')])).toEqual([])
  })

  it('faixa sem vencimento válido não entra na conta', () => {
    expect(lacunasDeVencimento([{ nome: 'a', min: null, max: null }, f('b', '2025-01-01', '2025-12-31')])).toEqual([])
  })

  it('o parse avisa a lacuna na carga com 2 arquivos, e não avisa com faixas contíguas', () => {
    const t = (venc: Date) => ({ numero: venc.getTime(), vencimento: venc })
    const contiguos = ok([
      arquivo('24.xlsx', [t(new Date(2024, 0, 1)), t(new Date(2024, 11, 31))]),
      arquivo('25.xlsx', [t(new Date(2025, 0, 1)), t(new Date(2025, 5, 30))]),
    ])
    expect(avisosDoDiagnostico(contiguos.diagnostico).some((a) => a.includes('Lacuna'))).toBe(false)

    const comBuraco = ok([
      arquivo('24.xlsx', [t(new Date(2024, 0, 1)), t(new Date(2024, 11, 31))]),
      arquivo('25.xlsx', [t(new Date(2025, 1, 1)), t(new Date(2025, 5, 30))]),
    ])
    const aviso = avisosDoDiagnostico(comBuraco.diagnostico).find((a) => a.includes('Lacuna'))
    expect(aviso).toContain('31/12/2024')
    expect(aviso).toContain('01/02/2025')
    expect(aviso).toContain('31 dia(s) sem cobertura')
  })
})
