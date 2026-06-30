import { describe, it, expect } from 'vitest'
import { classificarFaturas, mapaPorNome } from './classificar'
import type { FaturaRaw, PessoaCadastro } from './tipos'

const cad = (nome: string, p: Partial<PessoaCadastro> = {}): PessoaCadastro => ({
  nome, razao_social: null, cnpj: null, cpf: null, cep: null, endereco: null, numero: null,
  complemento: null, bairro: null, cidade: null, uf: null, pais: null,
  inscricao_estadual: null, inscricao_municipal: null, email: null, telefone: null, celular: null,
  ...p,
})

const fat = (pessoa: string | null, p: Partial<FaturaRaw> = {}): FaturaRaw => ({
  linha: 2, numero: '1', emissao: '2026-06-01', pessoa, vencimento: '2026-06-30',
  valor: 100, fatura_cliente_no: 'FC-1', ...p,
})

describe('classificarFaturas — cruzamento da Fase 1a (v4.30.0)', () => {
  it("casou + tem CPF/CNPJ → 'pronta' (emitir sugerido true)", () => {
    const mapa = mapaPorNome([cad('Acme Ltda', { cnpj: '00111222000133', endereco: 'Rua X', cep: '66035145' })])
    const { faturas, resumo } = classificarFaturas([fat('Acme Ltda')], mapa)
    expect(faturas[0].status).toBe('pronta')
    expect(faturas[0].faltam).toEqual([])
    expect(faturas[0].emitir).toBe(true)
    expect(resumo.prontas).toBe(1)
  })

  it("casou mas SEM CPF/CNPJ → 'sem_dados_fiscais' (emitir false; faltam lista CPF/CNPJ)", () => {
    const mapa = mapaPorNome([cad('Beta SA', { endereco: 'Rua Y', cep: '11111111' })]) // sem cnpj/cpf
    const { faturas, resumo } = classificarFaturas([fat('Beta SA')], mapa)
    expect(faturas[0].status).toBe('sem_dados_fiscais')
    expect(faturas[0].faltam).toContain('CPF/CNPJ')
    expect(faturas[0].emitir).toBe(false)
    expect(resumo.semDados).toBe(1)
  })

  it("nome não está na base → 'nao_identificado'", () => {
    const { faturas, resumo } = classificarFaturas([fat('Fantasma Ltda')], mapaPorNome([]))
    expect(faturas[0].status).toBe('nao_identificado')
    expect(faturas[0].cadastro).toBeNull()
    expect(faturas[0].emitir).toBe(false)
    expect(resumo.naoIdentificadas).toBe(1)
  })

  it('TRIM nos dois lados: nome com espaço casa com cadastro trimado', () => {
    const mapa = mapaPorNome([cad('Gamma', { cnpj: '99' })])
    const { faturas } = classificarFaturas([fat('   Gamma  ')], mapa)
    expect(faturas[0].status).toBe('pronta')
  })

  it('pronta mas falta Endereço/CEP → faltam sinaliza (NF na fase 2), mas status pronta (boleto)', () => {
    const mapa = mapaPorNome([cad('Delta', { cnpj: '77' })]) // tem cnpj, sem endereço/cep
    const { faturas } = classificarFaturas([fat('Delta')], mapa)
    expect(faturas[0].status).toBe('pronta')
    expect(faturas[0].faltam).toEqual(['Endereço', 'CEP'])
  })

  it('homônimo (>1 cadastro) → multiplos=true', () => {
    const mapa = mapaPorNome([cad('Repetido', { cnpj: '1' }), cad('Repetido', { cnpj: '2' })])
    const { faturas } = classificarFaturas([fat('Repetido')], mapa)
    expect(faturas[0].multiplos).toBe(true)
  })

  it('resumo soma total e valorTotal', () => {
    const mapa = mapaPorNome([cad('A', { cnpj: '1' })])
    const { resumo } = classificarFaturas([fat('A', { valor: 100 }), fat('X', { valor: 50 })], mapa)
    expect(resumo.total).toBe(2)
    expect(resumo.valorTotal).toBe(150)
    expect(resumo.prontas).toBe(1)
    expect(resumo.naoIdentificadas).toBe(1)
  })
})
