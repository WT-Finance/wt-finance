import { describe, expect, it } from 'vitest'
import {
  FMT_DATA, FMT_MOEDA, montarExportacaoAntecipacoes, nomeArquivoAntecipacoes, serialExcel,
} from './exportar-antecipacoes'
import type { RegistroAntecipacao } from './schemas'

function reg(id: number, data: string, conta: string, ant: number, liq: number, desc: number): RegistroAntecipacao {
  return { id, conta_id: id, conta, data, valor_antecipado: ant, valor_liquido: liq, desconto: desc, atualizado_em: null }
}

describe('exportar-antecipacoes', () => {
  const regs = [
    reg(1, '2026-10-05', 'Asaas', 1000.1, 990.05, 10.05),
    reg(2, '2026-01-02', 'Itaú', 0.1, 0.07, 0.03),
    reg(3, '2026-03-01', 'Asaas', 0.2, 0.15, 0.05),
  ]
  const ex = montarExportacaoAntecipacoes(regs, '2026-11-05')

  it('cabeçalho, ordem preservada e linha de Total ao fim', () => {
    expect(ex.nome).toBe('Antecipações')
    expect(ex.linhas[0]).toEqual(['Data', 'Conta', 'Antecipado', 'Líquido', 'Taxa'])
    expect(ex.linhas.slice(1, 4).map(l => l[1])).toEqual(['Asaas', 'Itaú', 'Asaas'])
    expect(ex.linhas).toHaveLength(5)
    expect(ex.linhas[4]?.[0]).toBe('Total')
  })

  it('data é célula numérica de data com formato dd/mm/yyyy', () => {
    expect(serialExcel('2026-10-05')).toBe(46300)
    expect(serialExcel('1970-01-01')).toBe(25569)
    expect(ex.linhas[1]?.[0]).toEqual({ t: 'n', v: 46300, z: FMT_DATA })
  })

  it('valores são números nativos, nunca texto', () => {
    const l = ex.linhas[1]!
    expect(l[2]).toEqual({ t: 'n', v: 1000.1, z: FMT_MOEDA })
    expect(l[3]).toEqual({ t: 'n', v: 990.05, z: FMT_MOEDA })
    expect(l[4]).toEqual({ t: 'n', v: 10.05, z: FMT_MOEDA })
  })

  it('total soma em centavos inteiros, ao centavo (0,1 + 0,2 ≠ 0,30000000000000004)', () => {
    const t = ex.linhas[4]!
    expect(t[2]).toEqual({ t: 'n', v: 1000.4, z: FMT_MOEDA })
    expect(t[3]).toEqual({ t: 'n', v: 990.27, z: FMT_MOEDA })
    expect(t[4]).toEqual({ t: 'n', v: 10.13, z: FMT_MOEDA })
  })

  it('lista vazia gera cabeçalho e Total zerado', () => {
    const v = montarExportacaoAntecipacoes([], '2026-11-05')
    expect(v.linhas).toHaveLength(2)
    expect(v.linhas[1]?.[2]).toEqual({ t: 'n', v: 0, z: FMT_MOEDA })
  })

  it('nome do arquivo', () => {
    expect(nomeArquivoAntecipacoes('2026-11-05')).toBe('antecipacoes-2026-11-05.xlsx')
    expect(ex.nomeArquivo).toBe('antecipacoes-2026-11-05.xlsx')
  })
})
