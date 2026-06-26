import { describe, it, expect } from 'vitest'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from './colunas-obrigatorias'

describe('validarColunasObrigatorias — aviso de colunas obrigatórias (v4.29.0)', () => {
  const REQ: RequisitoColuna[] = [
    { label: 'Tipo',        aceitos: ['Tipo'] },
    { label: 'Status',      aceitos: ['Status'] },
    { label: 'Valor Final', aceitos: ['Valor Final', 'Valor_Final'] }, // alias
  ]

  it('todas presentes → []', () => {
    expect(validarColunasObrigatorias(['Tipo', 'Status', 'Valor Final', 'Extra'], REQ)).toEqual([])
  })

  it('alias satisfaz o requisito (Valor_Final vale por Valor Final)', () => {
    expect(validarColunasObrigatorias(['Tipo', 'Status', 'Valor_Final'], REQ)).toEqual([])
  })

  it('devolve os labels faltantes (não os aceitos)', () => {
    expect(validarColunasObrigatorias(['Tipo'], REQ)).toEqual(['Status', 'Valor Final'])
  })

  it('trima os headers antes de comparar', () => {
    expect(validarColunasObrigatorias(['  Tipo  ', 'Status', 'Valor Final'], REQ)).toEqual([])
  })

  it('comparação é EXATA por padrão (não casa acento/caixa) — não-regressão das bases existentes', () => {
    // 'tipo' minúsculo NÃO satisfaz 'Tipo' → preserva o que o parser exato já rejeitava.
    expect(validarColunasObrigatorias(['tipo', 'Status', 'Valor Final'], REQ)).toEqual(['Tipo'])
  })

  it('o CALLER pode normalizar antes (padrão Pessoas, tolerante a acento)', () => {
    const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    const reqNorm: RequisitoColuna[] = [{ label: 'Razão Social', aceitos: [norm('Razão Social')] }]
    expect(validarColunasObrigatorias(['Razao Social'].map(norm), reqNorm)).toEqual([])
    expect(validarColunasObrigatorias(['Outra'].map(norm), reqNorm)).toEqual(['Razão Social'])
  })

  it('mensagem amigável lista as faltantes', () => {
    expect(mensagemColunasFaltando(['Status', 'Valor Final']))
      .toBe('Sua planilha precisa conter as colunas: Status, Valor Final.')
  })
})
