import { describe, it, expect } from 'vitest'
import type { LancamentoMkt } from '@/components/marketing/gastos/tipos'
import {
  FILTRO_VAZIO, ORDENACAO_PADRAO, alternarOrdenacao, casaBusca, categoriasDe, direcaoInicial,
  filtrarLancamentos, fornecedoresDe, haFiltro, normalizarTexto, ordenarLancamentos,
} from './lancamentos'

const L = (
  id: number, data: string, categoria: string, fornecedor: string | null, valor: number,
  descricao: string | null, documento: string | null,
): LancamentoMkt => ({ id, data, categoria, fornecedor, descricao, documento, valor })

const A = L(1, '2026-03-05', 'Anúncios', 'Google Ads', -100, 'Campanha de Verão', 'NF 1')
const B = L(2, '2026-01-10', 'TravelBack', null, -300, 'Bônus de indicação', 'FAT-9')
const C = L(3, '2026-02-20', 'Licença de Software (MKT)', 'Adobe', -50, 'Assinatura mensal', null)
const D = L(4, '2026-03-05', 'Anúncios', 'Meta Ads', 25, 'Estorno de cobrança', null) // estorno
const E = L(5, '2026-03-06', 'Material gráfico MKT', '  ', -10, null, null)
const TODOS = [A, B, C, D, E]
const ids = (ls: LancamentoMkt[]) => ls.map(l => l.id)

describe('busca na descrição', () => {
  it('ignora acento e caixa, e exige todas as palavras (AND)', () => {
    expect(normalizarTexto('  Agência ')).toBe('agencia')
    expect(casaBusca('Campanha de Verão – Agência', 'agencia verao')).toBe(true)
    expect(casaBusca('Campanha de Verão – Agência', 'VERAO')).toBe(true)
    expect(casaBusca('Campanha de Verão – Agência', 'verao inverno')).toBe(false)
  })

  it('busca vazia casa tudo; descrição ausente só casa a busca vazia', () => {
    expect(casaBusca('qualquer', '')).toBe(true)
    expect(casaBusca('qualquer', '   ')).toBe(true)
    expect(casaBusca(null, '')).toBe(true)
    expect(casaBusca(null, 'x')).toBe(false)
  })

  it('NÃO casa contra fornecedor nem documento (a busca é só da descrição)', () => {
    const l = L(9, '2026-03-05', 'Anúncios', 'ana2024', -1, 'Assinatura', 'NF 2024')
    expect(filtrarLancamentos([l], { ...FILTRO_VAZIO, busca: '2024' })).toEqual([])
    expect(filtrarLancamentos([l], { ...FILTRO_VAZIO, busca: 'assinatura' })).toEqual([l])
  })
})

describe('filtro', () => {
  it('por categoria', () => {
    expect(ids(filtrarLancamentos(TODOS, { ...FILTRO_VAZIO, categoria: 'Anúncios' }))).toEqual([1, 4])
  })

  it('por fornecedor; a chave vazia pega o nulo E o em branco (sem fornecedor)', () => {
    expect(ids(filtrarLancamentos(TODOS, { ...FILTRO_VAZIO, fornecedor: 'Adobe' }))).toEqual([3])
    expect(ids(filtrarLancamentos(TODOS, { ...FILTRO_VAZIO, fornecedor: '' }))).toEqual([2, 5])
  })

  it('filtros se combinam (AND)', () => {
    expect(ids(filtrarLancamentos(TODOS, { categoria: 'Anúncios', fornecedor: 'Meta Ads', busca: 'estorno' }))).toEqual([4])
    expect(ids(filtrarLancamentos(TODOS, { categoria: 'TravelBack', fornecedor: 'Adobe', busca: '' }))).toEqual([])
  })

  it('haFiltro enxerga cada filtro e ignora busca só de espaços', () => {
    expect(haFiltro(FILTRO_VAZIO)).toBe(false)
    expect(haFiltro({ ...FILTRO_VAZIO, busca: '  ' })).toBe(false)
    expect(haFiltro({ ...FILTRO_VAZIO, categoria: 'Anúncios' })).toBe(true)
    expect(haFiltro({ ...FILTRO_VAZIO, fornecedor: '' })).toBe(true) // '' = "sem fornecedor", é filtro
  })

  it('opções: categorias únicas em ordem; fornecedores incluem "(sem fornecedor)"', () => {
    expect(categoriasDe(TODOS)).toEqual(['Anúncios', 'Licença de Software (MKT)', 'Material gráfico MKT', 'TravelBack'])
    const fornecedores = fornecedoresDe(TODOS)
    expect(fornecedores.map(f => f.rotulo)).toEqual(['(sem fornecedor)', 'Adobe', 'Google Ads', 'Meta Ads'])
    expect(fornecedores.find(f => f.chave === '')?.rotulo).toBe('(sem fornecedor)')
  })
})

describe('ordenação', () => {
  it('padrão: data, mais recente primeiro; empate de data pelo id', () => {
    expect(ORDENACAO_PADRAO).toEqual({ coluna: 'data', direcao: 'desc' })
    expect(ids(ordenarLancamentos(TODOS, ORDENACAO_PADRAO))).toEqual([5, 1, 4, 3, 2])
    expect(ids(ordenarLancamentos(TODOS, { coluna: 'data', direcao: 'asc' }))).toEqual([2, 3, 1, 4, 5])
  })

  it('valor: ascendente = MAIOR GASTO primeiro (mais negativo); o estorno positivo vai ao fim', () => {
    expect(ids(ordenarLancamentos(TODOS, { coluna: 'valor', direcao: 'asc' }))).toEqual([2, 1, 3, 5, 4])
    expect(ids(ordenarLancamentos(TODOS, { coluna: 'valor', direcao: 'desc' }))).toEqual([4, 5, 3, 1, 2])
  })

  it('texto vazio (sem fornecedor, sem documento) vai SEMPRE para o fim, em qualquer direção', () => {
    const asc = ids(ordenarLancamentos(TODOS, { coluna: 'fornecedor', direcao: 'asc' }))
    const desc = ids(ordenarLancamentos(TODOS, { coluna: 'fornecedor', direcao: 'desc' }))
    expect(asc.slice(0, 3)).toEqual([3, 1, 4]) // Adobe, Google Ads, Meta Ads
    expect(desc.slice(0, 3)).toEqual([4, 1, 3]) // Meta Ads, Google Ads, Adobe
    expect(new Set(asc.slice(3))).toEqual(new Set([2, 5]))
    expect(new Set(desc.slice(3))).toEqual(new Set([2, 5]))

    const doc = ids(ordenarLancamentos(TODOS, { coluna: 'documento', direcao: 'asc' }))
    expect(doc.slice(0, 2)).toEqual([2, 1]) // FAT-9, NF 1
  })

  it('não muta a lista de entrada', () => {
    const copia = [...TODOS]
    ordenarLancamentos(TODOS, { coluna: 'valor', direcao: 'asc' })
    expect(TODOS).toEqual(copia)
  })

  it('clique no cabeçalho: coluna nova começa pela direção inicial; a mesma inverte', () => {
    expect(direcaoInicial('data')).toBe('desc')
    expect(direcaoInicial('valor')).toBe('asc')
    expect(direcaoInicial('descricao')).toBe('asc')
    expect(alternarOrdenacao(ORDENACAO_PADRAO, 'data')).toEqual({ coluna: 'data', direcao: 'asc' })
    const v1 = alternarOrdenacao(ORDENACAO_PADRAO, 'valor')
    expect(v1).toEqual({ coluna: 'valor', direcao: 'asc' })
    expect(alternarOrdenacao(v1, 'valor')).toEqual({ coluna: 'valor', direcao: 'desc' })
  })
})
