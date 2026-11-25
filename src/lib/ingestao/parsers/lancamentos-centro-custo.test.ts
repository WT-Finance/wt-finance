import { describe, it, expect } from 'vitest'
import { parseLancamentosCentroCustoRows, COL_MAP, OBRIGATORIOS } from './lancamentos-centro-custo'

// Sondas do parser de Lançamentos por Centro de Custo (v6.5.1 / M2). TODO dado aqui é SINTÉTICO
// (inventado): o arquivo real traz nomes de pessoas em Pessoa/Descrição, e nenhum teste, mensagem
// ou fixture deste módulo reproduz valor real delas. As fixtures NEGATIVAS (grupo recolhido,
// detalhe fora do grupo etc.) também são sintéticas — o export real nunca as traz (decisão D4).

const HOJE = new Date(Date.UTC(2026, 10, 6))

/** O cabeçalho REAL (12 colunas, a 2ª sem nome). Pessoa, Descrição e Valor Lançamento existem de
 *  propósito — são as que NUNCA se gravam. */
const CAB = [
  'Pessoa', '', 'Descrição', 'Valor Lançamento', '% Centro Custo', 'Valor Centro Custo',
  'Número', 'Emissão', 'Vencimento', 'Movimentação', 'Centro de Custo', 'Valor Movimentação',
]
const C = Object.fromEntries(CAB.map((h, i) => [h, i])) as Record<string, number>

interface Det {
  numero: unknown
  /** Valor Centro Custo NO ARQUIVO (sem sinal). */
  vcc: number
  vmov: number
  pct?: unknown
  /** Default: o nome do grupo. `null` = vazio. */
  centro?: string | null
  emissao?: unknown; vencimento?: unknown; movimentacao?: unknown
}
interface Grupo {
  nome: string
  det: Det[]
  estado?: string
  declLinhas?: number
  declCentavos?: number
}

const brl = (centavos: number): string =>
  `${centavos < 0 ? '-' : ''}R$ ${(Math.abs(centavos) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

function linhaDet(d: Det, nomeGrupo: string): unknown[] {
  const l: unknown[] = new Array(CAB.length).fill(null)
  l[1] = 'PESSOA-NAO-GRAVAR'
  l[C['Descrição']] = 'DESCRICAO-NAO-GRAVAR'
  l[C['Valor Lançamento']] = 777777.77
  l[C['% Centro Custo']] = d.pct === undefined ? 100 : d.pct
  l[C['Valor Centro Custo']] = d.vcc
  l[C['Número']] = d.numero
  l[C['Emissão']] = d.emissao === undefined ? new Date(2026, 0, 5) : d.emissao
  l[C['Vencimento']] = d.vencimento === undefined ? new Date(2026, 1, 10) : d.vencimento
  l[C['Movimentação']] = d.movimentacao === undefined ? new Date(2026, 2, 15) : d.movimentacao
  const centro = d.centro === undefined ? nomeGrupo : d.centro
  l[C['Centro de Custo']] = centro === null || centro === '' ? null : ` ${centro}`
  l[C['Valor Movimentação']] = d.vmov
  return l
}

/** Arquivo coerente: outline de cada grupo declara a contagem e a soma COM SINAL que fecham. */
function arquivo(grupos: Grupo[]): unknown[][] {
  const rows: unknown[][] = [[...CAB]]
  const totalMov = { v: 0 }
  for (const g of grupos) {
    const soma = g.det.reduce((s, d) => s + (d.vmov < 0 ? -1 : 1) * Math.round(d.vcc * 100), 0)
    const o: unknown[] = new Array(CAB.length).fill(null)
    o[0] = g.estado ?? '-'
    o[1] = `Centro de Custo :  ${g.nome} (${g.declLinhas ?? g.det.length}, ${brl(g.declCentavos ?? soma)})`
    rows.push(o)
    for (const d of g.det) { rows.push(linhaDet(d, g.nome)); totalMov.v += d.vmov }
    const sub: unknown[] = new Array(CAB.length).fill(null)
    sub[C['Valor Centro Custo']] = g.det.reduce((s, d) => s + d.vcc, 0)
    rows.push(sub)
  }
  const tot: unknown[] = new Array(CAB.length).fill(null)
  tot[C['Valor Movimentação']] = totalMov.v
  rows.push(tot)
  return rows
}

const GRUPOS_FELIZES = (): Grupo[] => [
  { nome: 'WG - Alfa', det: [
    { numero: 1001, pct: 60, vcc: 60, vmov: 100 },
    { numero: '1002-2', pct: 100, vcc: 40.5, vmov: -40.5 },
  ] },
  { nome: 'WG - Beta', det: [
    { numero: 1001, pct: 40, vcc: 40, vmov: 100 },
    { numero: 1003, pct: null, vcc: 0, vmov: 0 },
  ] },
  { nome: '', det: [{ numero: 1004, pct: 100, vcc: 0.01, vmov: 5 }] },
]

function ok(rows: unknown[][]) {
  const r = parseLancamentosCentroCustoRows(rows, { hoje: HOJE })
  if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
  return r
}
function falha(rows: unknown[][]) {
  const r = parseLancamentosCentroCustoRows(rows, { hoje: HOJE })
  if (r.ok) throw new Error('esperava falha')
  return r
}

describe('caminho feliz', () => {
  it('2 centros + 1 grupo sem centro: linhas, nomes aparados, linha_origem e checksum por outline', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(r.linhas).toHaveLength(5)
    expect(r.linhas.map((l) => l.centro_custo)).toEqual(['WG - Alfa', 'WG - Alfa', 'WG - Beta', 'WG - Beta', null])
    expect(r.linhas[0]).toEqual({
      linha_origem: 3, numero: '1001', emissao: '2026-01-05', vencimento: '2026-02-10',
      movimentacao: '2026-03-15', centro_custo: 'WG - Alfa', pct_centro: 60,
      valor_movimentacao: 100, valor_centro_custo: 60,
    })
    expect(r.checksums).toHaveLength(3)
    expect(r.checksums[0]).toMatchObject({
      escopo: 'centro', chave: ['WG - Alfa'], campo: 'valor_centro_custo',
      linhasDeclaradas: 2, linhasApuradas: 2,
      centavosDeclarados: 1950, centavosApurados: 1950, centavosArredondados: 1950,
    })
    expect(r.checksums[1]).toMatchObject({ chave: ['WG - Beta'], centavosDeclarados: 4000, centavosApurados: 4000 })
    // Grupo sem centro: nome vazio no outline ⇒ chave [''] e centro_custo null nas linhas.
    expect(r.checksums[2]).toMatchObject({ escopo: 'centro', chave: [''], linhasDeclaradas: 1, centavosDeclarados: 1 })
    expect(r.diagnostico.centros).toEqual([
      { nome: 'WG - Alfa', linhas: 2 }, { nome: 'WG - Beta', linhas: 2 }, { nome: '', linhas: 1 },
    ])
    expect(r.diagnostico.linhasIgnoradas).toBe(0)
  })

  it('sinal: Valor Movimentação negativo ⇒ valor_centro_custo negativo (o arquivo traz sem sinal)', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(r.linhas[1]).toMatchObject({ valor_movimentacao: -40.5, valor_centro_custo: -40.5 })
    expect(r.linhas[0].valor_centro_custo).toBe(60)
  })

  it('% vazio ⇒ null (e valor zero não vira -0)', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(r.linhas[3].pct_centro).toBeNull()
    expect(r.linhas[3].valor_centro_custo).toBe(0)
    expect(Object.is(r.linhas[3].valor_centro_custo, 0)).toBe(true)
  })

  it('Número é TEXTO: célula numérica vira string e o sufixo -N sobrevive', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(r.linhas.map((l) => l.numero)).toEqual(['1001', '1002-2', '1001', '1003', '1004'])
    expect(r.linhas.every((l) => typeof l.numero === 'string')).toBe(true)
  })

  it('a soma é a dos valores EXATOS arredondada uma vez (188,615 ×2 ⇒ 377,23); o gravado é 188,62', () => {
    const r = ok(arquivo([{ nome: 'WG - Alfa', det: [
      { numero: 1, vcc: 188.615, vmov: 188.615 }, { numero: 2, vcc: 188.615, vmov: 188.615 },
    ], declCentavos: 37723 }]))
    expect(r.linhas[0].valor_centro_custo).toBe(188.62)
    expect(r.checksums[0]).toMatchObject({ centavosDeclarados: 37723, centavosApurados: 37723, centavosArredondados: 37724 })
  })
})

describe('checksum', () => {
  it('contagem do outline diverge ⇒ CHECKSUM_FALHOU', () => {
    const g = GRUPOS_FELIZES(); g[0].declLinhas = 3
    expect(falha(arquivo(g)).codigo).toBe('CHECKSUM_FALHOU')
  })

  it('soma do outline diverge em 1 centavo ⇒ CHECKSUM_FALHOU', () => {
    const g = GRUPOS_FELIZES(); g[1].declCentavos = 4001
    const r = falha(arquivo(g))
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
    expect(r.mensagem).toContain('1 de 3')
  })

  it('linha de detalhe removida do meio do grupo ⇒ CHECKSUM_FALHOU', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows.splice(3, 1)
    expect(falha(rows).codigo).toBe('CHECKSUM_FALHOU')
  })

  // O formato real do outline traz milhar e sinal: "-R$ 4.114.460,58" (CSC, 06/11) e contagens de 4–5
  // dígitos. Sem este caso, só o oráculo (que pula sem a fixture git-ignorada) cobriria a leitura de
  // valor negativo e com separador de milhar (achado MÉDIO do revisor na M2).
  it('outline negativo e com milhar (formato real) fecha, e 1 centavo a menos reprova', () => {
    const grande: Grupo = { nome: 'WG - Gama', det: [
      { numero: 2001, pct: 100, vcc: 1_234_567.89, vmov: -1_234_567.89 },
      { numero: 2002, pct: 100, vcc: 2_879_892.69, vmov: -2_879_892.69 },
      { numero: 2003, pct: 100, vcc: 0.01, vmov: -0.01 },
    ] }
    const r = ok(arquivo([grande]))
    const chk = r.checksums.find((c) => c.chave[0] === 'WG - Gama')
    expect(chk?.centavosDeclarados).toBe(-411446059)
    expect(chk?.centavosArredondados).toBe(-411446059)
    expect(arquivo([grande])[1][1]).toBe('Centro de Custo :  WG - Gama (3, -R$ 4.114.460,59)')
    expect(falha(arquivo([{ ...grande, declCentavos: -411446058 }])).codigo).toBe('CHECKSUM_FALHOU')
  })
})

describe('estrutura do outline', () => {
  it('grupo RECOLHIDO ("+") rejeita a carga nomeando o centro (fixture SINTÉTICA, decisão D4)', () => {
    const g = GRUPOS_FELIZES(); g[1].estado = '+'
    // As linhas de detalhe do grupo recolhido ESTÃO presentes e o checksum fecharia — mesmo assim rejeita.
    const r = falha(arquivo(g))
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('"WG - Beta"')
    expect(r.mensagem).toContain('RECOLHIDO')
  })

  it('grupo recolhido SEM linhas de detalhe também rejeita (SINTÉTICA)', () => {
    const rows = arquivo([{ nome: 'WG - Alfa', det: [{ numero: 1, vcc: 10, vmov: 10 }] },
      { nome: 'WG - Beta', estado: '+', det: [], declLinhas: 0, declCentavos: 0 }])
    const r = falha(rows)
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('"WG - Beta"')
  })

  it('o sem-centro recolhido é nomeado como "(sem centro)"', () => {
    const g = GRUPOS_FELIZES(); g[2].estado = '+'
    expect(falha(arquivo(g)).mensagem).toContain('(sem centro)')
  })

  it('marcador de estado ausente ⇒ ESTRUTURA_INESPERADA (fail-closed)', () => {
    const g = GRUPOS_FELIZES(); g[0].estado = ''
    expect(falha(arquivo(g)).codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('detalhe com centro ≠ o do outline corrente ⇒ ESTRUTURA_INESPERADA com o Número', () => {
    const g = GRUPOS_FELIZES(); g[0].det[1].centro = 'WG - Beta'
    const r = falha(arquivo(g))
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('1002-2')
    expect(r.mensagem).toContain('"WG - Beta"')
  })

  it('detalhe sem centro dentro de grupo nomeado ⇒ ESTRUTURA_INESPERADA', () => {
    const g = GRUPOS_FELIZES(); g[0].det[0].centro = null
    expect(falha(arquivo(g)).codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('detalhe antes de qualquer outline ⇒ ESTRUTURA_INESPERADA', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    const [cab, , ...resto] = rows   // tira o 1º outline; o 1º detalhe fica órfão
    expect(falha([cab, ...resto]).codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('outline repetido ⇒ ESTRUTURA_INESPERADA', () => {
    const g = GRUPOS_FELIZES(); g.push({ nome: 'WG - Alfa', det: [{ numero: 9, vcc: 1, vmov: 1 }] })
    const r = falha(arquivo(g))
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('mais de uma vez')
  })

  it('arquivo sem nenhum outline ⇒ ESTRUTURA_INESPERADA', () => {
    const [cab, , d] = arquivo([{ nome: 'WG - Alfa', det: [{ numero: 1, vcc: 1, vmov: 1 }] }])
    expect(falha([cab, d]).codigo).toBe('ESTRUTURA_INESPERADA')
  })
})

describe('valores', () => {
  it('Valor Centro Custo NEGATIVO no arquivo ⇒ ESTRUTURA_INESPERADA (a convenção "sem sinal" mudou)', () => {
    const g = GRUPOS_FELIZES(); g[0].det[0].vcc = -60
    const r = falha(arquivo(g))
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('NEGATIVO')
    expect(r.mensagem).toContain('1001')
  })

  it('Valor Centro Custo ilegível ⇒ ESTRUTURA_INESPERADA', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows[2][C['Valor Centro Custo']] = 'abc'
    expect(falha(rows).codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('Valor Movimentação ilegível ⇒ ESTRUTURA_INESPERADA', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows[2][C['Valor Movimentação']] = 'abc'
    expect(falha(rows).codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('% Centro Custo ilegível (não vazio) ⇒ ESTRUTURA_INESPERADA', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows[2][C['% Centro Custo']] = 'xx'
    expect(falha(rows).codigo).toBe('ESTRUTURA_INESPERADA')
  })
})

describe('cabeçalho', () => {
  it('coluna obrigatória faltando ⇒ ESTRUTURA_INESPERADA nomeando o campo', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows[0] = rows[0].map((h) => (h === '% Centro Custo' ? '% Centro' : h))
    const r = falha(rows)
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('pct_centro')
  })

  it('COL_MAP/OBRIGATORIOS: oito campos; Pessoa, Descrição e Valor Lançamento fora', () => {
    expect(new Set(Object.values(COL_MAP)).size).toBe(8)
    expect(OBRIGATORIOS).toHaveLength(8)
    for (const nunca of ['Pessoa', 'Descrição', 'Valor Lançamento']) expect(Object.keys(COL_MAP)).not.toContain(nunca)
  })

  it('planilha só com cabeçalho ⇒ FORMATO_INVALIDO', () => {
    expect(falha([[...CAB]]).codigo).toBe('FORMATO_INVALIDO')
  })
})

describe('lista fechada (D6)', () => {
  it('só as 9 chaves do contrato; Pessoa, Descrição e Valor Lançamento nunca aparecem na saída', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(Object.keys(r.linhas[0]).sort()).toEqual([
      'centro_custo', 'emissao', 'linha_origem', 'movimentacao', 'numero', 'pct_centro',
      'valor_centro_custo', 'valor_movimentacao', 'vencimento',
    ])
    const saida = JSON.stringify([r.linhas, r.checksums, r.datasRejeitadas])
    for (const proibido of ['PESSOA-NAO-GRAVAR', 'DESCRICAO-NAO-GRAVAR', '777777']) expect(saida).not.toContain(proibido)
    expect(r.diagnostico.colunasNaoMapeadas).toEqual(expect.arrayContaining(['Pessoa', 'Descrição', 'Valor Lançamento']))
  })

  it('mensagens de erro não reproduzem Pessoa nem Descrição', () => {
    const g = GRUPOS_FELIZES(); g[0].det[0].vcc = -60
    const r = falha(arquivo(g))
    expect(JSON.stringify(r)).not.toContain('NAO-GRAVAR')
  })
})

describe('linhas de subtotal e total', () => {
  it('subtotais (só Valor Centro Custo) e o total (Valor Movimentação) são pulados sem contar como ignorados', () => {
    const r = ok(arquivo(GRUPOS_FELIZES()))
    expect(r.linhas).toHaveLength(5)
    expect(r.diagnostico.linhasIgnoradas).toBe(0)
  })

  it('outra linha com conteúdo e sem Número conta em linhasIgnoradas (e a carga segue)', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    const lixo: unknown[] = new Array(CAB.length).fill(null)
    lixo[C['Descrição']] = 'TEXTO-SOLTO'
    rows.splice(4, 0, lixo)
    expect(ok(rows).diagnostico.linhasIgnoradas).toBe(1)
  })

  it('linhas em branco no meio e no fim não atrapalham', () => {
    const rows = arquivo(GRUPOS_FELIZES())
    rows.splice(3, 0, new Array(CAB.length).fill(null), [])
    rows.push([])
    const r = ok(rows)
    expect(r.linhas).toHaveLength(5)
    expect(r.diagnostico.linhasIgnoradas).toBe(0)
  })
})

describe('datas (errata 1: a guarda de faixa anula o campo, a linha permanece)', () => {
  it('data fora da faixa ⇒ campo null, linha mantida, ocorrência contada e checksum fecha', () => {
    const g = GRUPOS_FELIZES()
    g[0].det[0].vencimento = new Date(2049, 5, 1)
    g[0].det[1].emissao = new Date(1899, 11, 30)
    const r = ok(arquivo(g))
    expect(r.linhas).toHaveLength(5)
    expect(r.linhas[0].vencimento).toBeNull()
    expect(r.linhas[1].emissao).toBeNull()
    expect(r.datasRejeitadas.map((d) => d.campo).sort()).toEqual(['emissao', 'vencimento'])
    expect(r.diagnostico.datasRejeitadas).toBe(2)
    expect(r.checksums.every((c) => c.linhasApuradas === c.linhasDeclaradas)).toBe(true)
  })

  it('data vazia ⇒ null sem rejeição', () => {
    const g = GRUPOS_FELIZES(); g[0].det[0].movimentacao = null
    const r = ok(arquivo(g))
    expect(r.linhas[0].movimentacao).toBeNull()
    expect(r.datasRejeitadas).toHaveLength(0)
  })

  it('data válida segue o valor nativo da célula, sem deslocar o dia', () => {
    const g = GRUPOS_FELIZES(); g[0].det[0].emissao = new Date(2026, 10, 6); g[0].det[0].vencimento = new Date(2026, 11, 31)
    const r = ok(arquivo(g))
    expect(r.linhas[0]).toMatchObject({ emissao: '2026-11-06', vencimento: '2026-12-31' })
  })
})
