// Filtro, busca e ordenação da tabela de lançamentos (v6.3.0) — módulo PURO.
//
// Tudo roda no CLIENTE sobre a lista do ano (~230 linhas; sem paginação no servidor), então
// não há o problema "ordena só a página visível". O recorte de meses é aplicado ANTES, por
// `lancamentosDoRecorte` (agregacao.ts).

import type { LancamentoMkt } from '@/components/marketing/gastos/tipos'
import { chaveFornecedor, rotuloFornecedor } from './agregacao'

// ── Busca ───────────────────────────────────────────────────────────────────────────────

/** Marcas combinantes (U+0300–U+036F) que o NFD separa das letras. Montado a partir de string
 *  com escape explícito: o caractere cru no fonte é invisível e some em qualquer edição. */
const MARCAS_DE_ACENTO = new RegExp('[\\u0300-\\u036f]', 'g')

/** Minúsculas e sem acento — a busca de quem digita "agencia" tem de achar "Agência". */
export function normalizarTexto(s: string): string {
  return s.normalize('NFD').replace(MARCAS_DE_ACENTO, '').toLowerCase().trim()
}

/**
 * Busca SÓ na DESCRIÇÃO (decisão do briefing). Cada palavra digitada tem de aparecer (AND,
 * como substring). Casar a consulta contra campos que ela não pretende cobrir — fornecedor,
 * documento — é o defeito clássico de busca "esperta" (v5.7.2: `ana2024@x.com` casava com `#2024`);
 * quem quer o documento filtra por outra coluna ou ordena por ela.
 */
export function casaBusca(descricao: string | null, busca: string): boolean {
  const termos = normalizarTexto(busca).split(/\s+/).filter(Boolean)
  if (termos.length === 0) return true
  const alvo = normalizarTexto(descricao ?? '')
  return termos.every(t => alvo.includes(t))
}

// ── Filtro ──────────────────────────────────────────────────────────────────────────────

export interface FiltroLancamentos {
  /** `null` = todas as categorias. */
  categoria: string | null
  /** Chave do fornecedor (`''` = sem fornecedor); `null` = todos. */
  fornecedor: string | null
  busca: string
}

export const FILTRO_VAZIO: FiltroLancamentos = { categoria: null, fornecedor: null, busca: '' }

export function haFiltro(f: FiltroLancamentos): boolean {
  return f.categoria !== null || f.fornecedor !== null || f.busca.trim() !== ''
}

export function filtrarLancamentos(lancamentos: readonly LancamentoMkt[], f: FiltroLancamentos): LancamentoMkt[] {
  return lancamentos.filter(l =>
    (f.categoria === null || l.categoria === f.categoria)
    && (f.fornecedor === null || chaveFornecedor(l.fornecedor) === f.fornecedor)
    && casaBusca(l.descricao, f.busca),
  )
}

/** Categorias presentes, em ordem alfabética (opções do filtro). */
export function categoriasDe(lancamentos: readonly LancamentoMkt[]): string[] {
  return [...new Set(lancamentos.map(l => l.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Fornecedores presentes (inclusive o "(sem fornecedor)"), em ordem alfabética. Vêm dos
 *  LANÇAMENTOS, não do ranking: se o card do ranking falhar, o filtro continua inteiro. */
export function fornecedoresDe(lancamentos: readonly LancamentoMkt[]): { chave: string; rotulo: string }[] {
  const chaves = [...new Set(lancamentos.map(l => chaveFornecedor(l.fornecedor)))]
  return chaves
    .map(chave => ({ chave, rotulo: rotuloFornecedor(chave) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

// ── Ordenação ───────────────────────────────────────────────────────────────────────────

export type ColunaLancamento = 'data' | 'categoria' | 'fornecedor' | 'descricao' | 'documento' | 'valor'
export type Direcao = 'asc' | 'desc'
export interface Ordenacao { coluna: ColunaLancamento; direcao: Direcao }

export const ORDENACAO_PADRAO: Ordenacao = { coluna: 'data', direcao: 'desc' }

/** Direção do PRIMEIRO clique numa coluna: data → mais recente primeiro; valor → MAIOR GASTO
 *  primeiro (no sinal da DRE isso é o mais negativo, ou seja, ascendente); texto → A–Z. */
export function direcaoInicial(coluna: ColunaLancamento): Direcao {
  return coluna === 'data' ? 'desc' : 'asc'
}

/** Clique no cabeçalho: na coluna já ativa inverte; em outra, começa pela direção inicial. */
export function alternarOrdenacao(atual: Ordenacao, coluna: ColunaLancamento): Ordenacao {
  if (atual.coluna === coluna) return { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' }
  return { coluna, direcao: direcaoInicial(coluna) }
}

function textoDe(l: LancamentoMkt, coluna: Exclude<ColunaLancamento, 'data' | 'valor'>): string {
  switch (coluna) {
    case 'categoria':  return l.categoria
    case 'fornecedor': return chaveFornecedor(l.fornecedor)
    case 'descricao':  return (l.descricao ?? '').trim()
    case 'documento':  return (l.documento ?? '').trim()
  }
}

/**
 * Ordena sem mutar. Texto vazio (sem fornecedor, sem documento…) vai SEMPRE para o fim,
 * qualquer que seja a direção — ordem crescente não deve abrir com 200 linhas em branco.
 * Desempate estável: data desc, depois id.
 */
export function ordenarLancamentos(lancamentos: readonly LancamentoMkt[], o: Ordenacao): LancamentoMkt[] {
  const sinal = o.direcao === 'asc' ? 1 : -1
  const desempate = (a: LancamentoMkt, b: LancamentoMkt) =>
    a.data < b.data ? 1 : a.data > b.data ? -1 : a.id - b.id

  return [...lancamentos].sort((a, b) => {
    if (o.coluna === 'data') {
      const c = a.data < b.data ? -1 : a.data > b.data ? 1 : 0
      return c !== 0 ? c * sinal : a.id - b.id
    }
    if (o.coluna === 'valor') {
      return a.valor !== b.valor ? (a.valor - b.valor) * sinal : desempate(a, b)
    }
    const ta = textoDe(a, o.coluna)
    const tb = textoDe(b, o.coluna)
    if (ta === '' && tb !== '') return 1
    if (tb === '' && ta !== '') return -1
    const c = ta.localeCompare(tb, 'pt-BR', { sensitivity: 'base', numeric: true })
    return c !== 0 ? c * sinal : desempate(a, b)
  })
}
