import { describe, it, expect, vi } from 'vitest'
import { parseVendasRows, normalizeHeader, toIsoDate } from './vendas-parser'

// Parser ÚNICO de Vendas (v4.12.1/M1). Os dois caminhos de ingestão (UI e API Route)
// passam por parseVendasRows — estes testes blindam os casos que JÁ morderam em
// produção (v4.9 / v4.9.1) e a PARIDADE de colunas que motivou a unificação:
// operacao_propria PRECISA sair preenchida, senão a regeneração da dim regride.

describe('normalizeHeader — tolerante a acento, caixa e espaço', () => {
  it('casa grafias diferentes do mesmo cabeçalho', () => {
    expect(normalizeHeader('Operação Própria')).toBe(normalizeHeader('Operação Propria'))
    expect(normalizeHeader('OPERAÇÃO  PRÓPRIA')).toBe(normalizeHeader('operação própria'))
    expect(normalizeHeader('Mês')).toBe(normalizeHeader('Mes'))
    expect(normalizeHeader('Data de Início')).toBe('data de inicio')
  })
})

describe('toIsoDate — Date nativo e DD/MM/YYYY, sem inverter dia/mês', () => {
  it('Date nativo da célula → ISO local (não desloca)', () => {
    expect(toIsoDate(new Date(2026, 5, 8))).toBe('2026-06-08') // 8 de junho
    expect(toIsoDate(new Date(2026, 0, 31))).toBe('2026-01-31')
  })
  it('string DD/MM/YYYY → YYYY-MM-DD (dia antes do mês)', () => {
    expect(toIsoDate('08/06/2026')).toBe('2026-06-08') // 8/jun, NÃO 6/ago
    expect(toIsoDate('31/12/2025')).toBe('2025-12-31')
  })
  it('string já ISO passa direto; vazio/null → null', () => {
    expect(toIsoDate('2026-06-08')).toBe('2026-06-08')
    expect(toIsoDate('')).toBeNull()
    expect(toIsoDate(null)).toBeNull()
    expect(toIsoDate(undefined)).toBeNull()
  })
})

describe('parseVendasRows — paridade de colunas dos dois caminhos de ingestão', () => {
  const HEADERS = [
    'Venda Nº', 'Data Venda', 'Vendedor', 'Pagante', 'Setor Macro', 'Setor',
    'Setor Micro', 'Produto', 'Valor Total', 'Receitas', 'Contrato',
    'Taxa de Serviço', 'Semana', 'Mês', 'Data Início', 'Fornecedor',
    'Passageiros', 'Contr./ Voucher', 'Operação Própria',
  ]

  it('mapeia operacao_propria, passageiros e tipo_contrato (colunas da v4.9.x)', () => {
    const aoa = [
      HEADERS,
      ['V1', new Date(2026, 5, 8), 'Ana', 'Cliente', 'Weddings', 'Weddings', 'Buffet',
        'Festa', 1000, true, true, false, 23, 'Junho', new Date(2026, 11, 20), 'Forn',
        2, 'Contrato', 'Casamento Ana & Bia'],
    ]
    const { linhas } = parseVendasRows(aoa, 'vendas.xlsx')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].operacao_propria).toBe('Casamento Ana & Bia')
    expect(linhas[0].passageiros).toBe('2')
    expect(linhas[0].tipo_contrato).toBe('Contrato')
    expect(linhas[0].data_venda).toBe('2026-06-08')
    expect(linhas[0].data_inicio_evento).toBe('2026-12-20')
  })

  it("casa 'Operação Propria' SEM acento (grafia do ERP) no mesmo campo", () => {
    const { linhas, naoMapeadas } = parseVendasRows(
      [['Venda Nº', 'Operação Propria'], ['V2', 'Op X']], 'f.xlsx',
    )
    expect(linhas[0].operacao_propria).toBe('Op X')
    expect(naoMapeadas).not.toContain('Operação Propria')
  })

  it("aceita 'Data Início' e 'Data de Início' como o mesmo campo", () => {
    const a = parseVendasRows([['Venda Nº', 'Data Início'], ['V', new Date(2026, 0, 15)]], 'a')
    const b = parseVendasRows([['Venda Nº', 'Data de Início'], ['V', new Date(2026, 0, 15)]], 'b')
    expect(a.linhas[0].data_inicio_evento).toBe('2026-01-15')
    expect(b.linhas[0].data_inicio_evento).toBe('2026-01-15')
  })

  it('avisa (console.warn) e ignora coluna não-mapeada — header novo não passa em silêncio', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { linhas, naoMapeadas } = parseVendasRows(
      [['Venda Nº', 'Coluna Fantasma'], ['V', 'x']], 'f',
    )
    expect(naoMapeadas).toContain('Coluna Fantasma')
    expect(warn).toHaveBeenCalled()
    expect(linhas[0].venda_numero).toBe('V')
    warn.mockRestore()
  })

  it('PARIDADE: a mesma linha produz saída idêntica independente da grafia do header', () => {
    const linhaDados = ['V9', new Date(2026, 2, 10), 'Casamento Tal']
    const canon    = parseVendasRows([['Venda Nº', 'Data Venda', 'Operação Própria'], linhaDados], 'x')
    const variante = parseVendasRows([['venda nº', 'DATA VENDA', 'Operação Propria'], linhaDados], 'x')
    expect(variante.linhas[0]).toEqual(canon.linhas[0])
  })

  it('linha_origem reflete a linha real da planilha (cabeçalho = linha 1)', () => {
    const { linhas } = parseVendasRows([['Venda Nº'], ['A'], ['B']], 'f')
    expect(linhas.map(l => l.linha_origem)).toEqual([2, 3])
  })

  it('pula linhas inteiramente vazias', () => {
    const { linhas } = parseVendasRows([['Venda Nº'], [null], ['A'], ['']], 'f')
    expect(linhas).toHaveLength(1)
    expect(linhas[0].venda_numero).toBe('A')
  })

  it('arquivo sem dados (só cabeçalho) → nenhuma linha', () => {
    expect(parseVendasRows([['Venda Nº']], 'f').linhas).toHaveLength(0)
    expect(parseVendasRows([], 'f').linhas).toHaveLength(0)
  })
})
