import { describe, it, expect } from 'vitest'
import { BOM, celulaData, celulaDataHora, celulaNumero, celulaTexto, montarCsv } from '@/lib/patrimonio/csv'
import { csvDeAtivos, csvDeMovimentacoes, type LinhaRazao } from './exportar'
import type { AtivoLista, Movimentacao } from './tipos'

// O CSV é entregue para abrir no EXCEL pt-BR (o critério do briefing é literalmente "abre no
// Excel pt-BR com acento correto"). Nada disso aparece num gate: é aqui ou na planilha do Yan.

const ATIVO: AtivoLista = {
  id: 1, codigo: 'WG-0001', categoria_id: 1, categoria_nome: 'Informática',
  descricao: 'Notebook Dell; Latitude', numero_serie: 'SN-1', fornecedor: 'Fornecedor "X"',
  data_aquisicao: '2026-02-10', valor_aquisicao: 4321.99, nota_fiscal: 'NF-1',
  estado_conservacao: 'bom', obs: null,
  status: 'em_uso', area_atual_nome: 'Financeiro', detentor_atual_nome: 'Ana',
  local_atual_texto: null, ultima_movimentacao_em: '2026-03-01',
}

const MOV: Movimentacao = {
  id: 10, ativo_id: 1, tipo: 'transferencia', data_movimentacao: '2026-03-01',
  area_destino_id: 2, area_destino_nome: 'Comercial',
  detentor_destino_id: 5, detentor_destino_nome: 'Bruno',
  destino_texto: null, motivo_baixa: null, obs: 'levou o carregador',
  registrado_por_rotulo: 'Yan', criado_em: '2026-03-02T15:30:00Z',
}

describe('células — o dialeto do Excel pt-BR', () => {
  it('número usa VÍRGULA decimal e 2 casas', () => {
    expect(celulaNumero(4321.99)).toBe('4321,99')
    expect(celulaNumero(1000)).toBe('1000,00')
    expect(celulaNumero(-5.5)).toBe('-5,50')
  })

  it('ativo SEM valor sai VAZIO — não 0 e não NaN', () => {
    // Invariante 9: sem valor informado ≠ custou zero. A diferença tem de sobreviver à planilha.
    expect(celulaNumero(null)).toBe('')
    expect(celulaNumero(undefined)).toBe('')
    expect(celulaNumero(NaN)).toBe('')
    expect(celulaNumero(Infinity)).toBe('')
  })

  it('data vira dd/mm/aaaa sem passar por fuso', () => {
    expect(celulaData('2026-02-10')).toBe('10/02/2026')
    expect(celulaData(null)).toBe('')
    expect(celulaData('')).toBe('')
  })

  it('data e hora saem no fuso de São Paulo, não em UTC', () => {
    // 02/03 00:30Z é 01/03 21:30 em SP — o dia muda.
    expect(celulaDataHora('2026-03-02T00:30:00Z')).toBe('01/03/2026 21:30')
    expect(celulaDataHora(null)).toBe('')
    expect(celulaDataHora('não é data')).toBe('')
  })

  it('texto nulo ou em branco sai VAZIO, nunca a palavra "null"', () => {
    expect(celulaTexto(null)).toBe('')
    expect(celulaTexto(undefined)).toBe('')
    expect(celulaTexto('   ')).toBe('')
  })

  it('ponto e vírgula, aspas e quebra de linha são escapados', () => {
    expect(celulaTexto('Notebook; Dell')).toBe('"Notebook; Dell"')
    expect(celulaTexto('Fornecedor "X"')).toBe('"Fornecedor ""X"""')
    expect(celulaTexto('linha 1\nlinha 2')).toBe('"linha 1\nlinha 2"')
  })

  it('célula que o Excel executaria como FÓRMULA é neutralizada', () => {
    // Descrição e observação são digitadas pelo usuário: `=cmd|...` num CSV é execução remota
    // clássica. O apóstrofo desarma sem mudar o que se lê na célula.
    expect(celulaTexto('=1+1')).toBe("'=1+1")
    expect(celulaTexto('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(celulaTexto('+55 11 99999')).toBe("'+55 11 99999")
    // Número negativo NÃO é texto — passa pela célula numérica e continua número.
    expect(celulaNumero(-10)).toBe('-10,00')
  })
})

describe('montagem do arquivo', () => {
  it('começa com BOM UTF-8 — sem ele o acento quebra no Excel do Windows', () => {
    const csv = montarCsv(['Código'], [['WG-0001']])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(BOM).toBe('﻿')
  })

  it('separa por ponto e vírgula e termina linha em CRLF', () => {
    const csv = montarCsv(['A', 'B'], [['1', '2'], ['3', '4']])
    expect(csv.slice(1)).toBe('A;B\r\n1;2\r\n3;4\r\n')
  })
})

describe('CSV de ativos', () => {
  const linhas = csvDeAtivos([ATIVO]).slice(1).split('\r\n')

  it('cabeçalho em português, com a unidade no valor', () => {
    expect(linhas[0].split(';')).toContain('Valor de aquisição (R$)')
    expect(linhas[0]).toMatch(/^Código;Item;Categoria/)
  })

  it('a linha traz o status por extenso e o acento intacto', () => {
    expect(linhas[1]).toContain('Em uso')
    expect(linhas[1]).toContain('Informática')
    expect(linhas[1]).toContain('4321,99')
  })

  it('descrição com ponto e vírgula não parte a linha em duas colunas', () => {
    // 14 colunas declaradas; um `;` não escapado viraria 15 campos.
    expect(linhas[0].split(';').length).toBe(14)
    expect(linhas[1]).toContain('"Notebook Dell; Latitude"')
  })

  it('sem pessoa, a coluna "com quem / onde" cai no local em texto', () => {
    const emManutencao: AtivoLista = {
      ...ATIVO, status: 'em_manutencao', area_atual_nome: null,
      detentor_atual_nome: null, local_atual_texto: 'TecnoService',
    }
    expect(csvDeAtivos([emManutencao])).toContain('TecnoService')
  })

  it('ativo sem valor não escreve 0 na planilha', () => {
    const csv = csvDeAtivos([{ ...ATIVO, valor_aquisicao: null }])
    expect(csv).not.toContain('0,00')
    // A coluna existe, vazia, entre a data de aquisição e a nota fiscal.
    expect(csv).toContain('10/02/2026;;NF-1')
  })

  it('lista vazia gera só o cabeçalho (arquivo válido, não vazio)', () => {
    expect(csvDeAtivos([]).slice(1).trimEnd().split('\r\n').length).toBe(1)
  })
})

describe('CSV de movimentações', () => {
  const linha: LinhaRazao = {
    mov: MOV, origem: 'Financeiro / Ana', retroativa: true,
    codigo: 'WG-0001', descricao: 'Notebook',
  }
  const csv = csvDeMovimentacoes([linha])

  it('grava a ORIGEM derivada e o destino montado na leitura', () => {
    expect(csv).toContain('Financeiro / Ana')
    expect(csv).toContain('Comercial / Bruno')
  })

  it('marca o registro retroativo — o CSV não perde o sinal que a timeline mostra', () => {
    expect(csv).toContain(';Sim;')
    expect(csvDeMovimentacoes([{ ...linha, retroativa: false }])).toContain('01/03/2026;;WG-0001')
  })

  it('registrado por e registrado em (data-hora SP) vão no arquivo', () => {
    expect(csv).toContain('Yan')
    expect(csv).toContain('02/03/2026 12:30')
  })

  it('baixa exporta o motivo por extenso, e o destino diz baixa', () => {
    const baixa: LinhaRazao = {
      ...linha,
      mov: {
        ...MOV, tipo: 'baixa', motivo_baixa: 'perda',
        area_destino_id: null, area_destino_nome: null,
        detentor_destino_id: null, detentor_destino_nome: null,
      },
    }
    const arq = csvDeMovimentacoes([baixa])
    expect(arq).toContain('Perda / extravio')
    expect(arq).toContain('Baixa por perda / extravio')
  })

  it('as 11 colunas se mantêm mesmo com observação contendo ponto e vírgula', () => {
    const comPonto: LinhaRazao = { ...linha, mov: { ...MOV, obs: 'a; b; c' } }
    const corpo = csvDeMovimentacoes([comPonto]).slice(1).split('\r\n')
    expect(corpo[0].split(';').length).toBe(11)
    expect(corpo[1]).toContain('"a; b; c"')
  })
})
