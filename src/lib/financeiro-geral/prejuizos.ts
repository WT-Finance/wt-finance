// Perdas e prejuízos (v6.5.0) — módulo PURO sobre o retorno de `get_geral_prejuizos`.
//
// A página é só o PREJUÍZO BRUTO (categoria da tabela curada, no sinal da DRE: negativo): a reversão e o
// líquido saíram. O recorte é uma TABELA CURADA (inv. 2), com bandeja visível: categoria com nome de
// prejuízo/perda que ainda não está no mapa aparece em `bandeja` e a tela a MOSTRA.
//
// A tabela "Prejuízo por pessoa" é UMA SÓ, somando os anos selecionados que carregaram (decisão do Yan,
// GATE 1). Σ linhas ≡ Σ dos totais anuais ao centavo (inv. 2); ano que falhou fica fora e é reportado em
// `anosFalha` — a UI avisa em vez de somar calada só o que chegou.

import { dadosCarregados } from './composicao'
import { emCentavos, pctDe } from './numeros'
import { rotuloDoAno, rotuloReferencia } from './periodo'
import type { Prejuizos } from './schemas'
import type { LeituraAno } from './tipos'
import { variacao, type Variacao } from './variacao'

export const ROTULO_SEM_PESSOA = '(sem pessoa)'
/** Linhas nomeadas da tabela por pessoa; o resto vira "demais N pessoas". */
export const LIMITE_TOP_PESSOAS = 10

// ── Resumo por ano (gráfico "Total por ano" e Δ) ───────────────────────────────────────────────

export interface ResumoAnoPrejuizo {
  ano: number
  /** "2026*" quando parcial. */
  rotulo: string
  /** Bruto, no sinal da DRE (negativo). */
  prejuizo: number
  /** Δ do bruto vs o mesmo período do ano anterior (`ano_anterior_ytd.prejuizo`). Despesa negativa:
   *  crescer o prejuízo = Δ negativo = desfavorável. */
  deltaPrejuizo: Variacao
  /** "vs 2025 (jan–out)" */
  referencia: string
}

export function resumoDoAno(l: Prejuizos): ResumoAnoPrejuizo {
  return {
    ano: l.ano,
    rotulo: rotuloDoAno(l.ano, l),
    prejuizo: l.prejuizo.total,
    deltaPrejuizo: variacao(l.ano_anterior_ytd?.prejuizo, l.prejuizo.total, 'maior-melhor'),
    referencia: `vs ${rotuloReferencia(l.ano - 1, l)}`,
  }
}

/** Um resumo por ano que carregou, do mais RECENTE ao mais antigo (a ordem do "Total por ano" de
 *  Marketing); os que falharam vêm em `anosFalha` (a UI avisa, não soma só o que chegou). */
export function resumosDosAnos(
  leituras: readonly LeituraAno<Prejuizos>[],
): { linhas: ResumoAnoPrejuizo[]; anosFalha: number[] } {
  return {
    linhas: dadosCarregados(leituras).map(x => resumoDoAno(x.dados)).sort((a, b) => b.ano - a.ano),
    anosFalha: leituras.filter(x => !x.leitura.ok).map(x => x.ano).sort((a, b) => a - b),
  }
}

// ── Prejuízo por pessoa ────────────────────────────────────────────────────────────────────────

export interface LinhaPessoa {
  /** 1..N na ordem do maior prejuízo. */
  posicao: number
  /** `null` na origem → "(sem pessoa)", visível (inv. 4). */
  pessoa: string
  semPessoa: boolean
  /** Lançamentos. */
  n: number
  /** Bruto, negativo. */
  valor: number
  /** % do total (valor ÷ total, ambos negativos → positivo). */
  pct: number | null
}

export interface LinhaDemaisPessoas {
  pessoas: number
  /** "demais 40 pessoas" */
  rotulo: string
  n: number
  valor: number
  pct: number | null
}

export interface TabelaPessoas {
  linhas: LinhaPessoa[]
  /** `null` quando todas as pessoas cabem no top. */
  demais: LinhaDemaisPessoas | null
  /** Σ de TODAS as pessoas (top + demais), dos anos carregados. */
  total: { n: number; valor: number }
  /** Anos somados (os que carregaram), crescente. */
  anos: number[]
  /** Anos selecionados que NÃO carregaram — fora da soma; a UI avisa. */
  anosFalha: number[]
  /** Σ pessoas ≡ Σ dos `prejuizo.total` dos anos carregados, ao centavo. */
  fecha: boolean
}

export function rotuloDemaisPessoas(pessoas: number): string {
  return `demais ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`
}

/**
 * Soma os anos carregados POR PESSOA (a mesma pessoa em dois anos vira uma linha), ordena pelo maior
 * prejuízo — valores negativos: ordena pela MAGNITUDE, e o empate cai no nome (o corte top/demais não
 * pode flutuar entre execuções) — e corta em `limite`. `null` agrupa sozinho e vira "(sem pessoa)".
 * Acumula em centavos inteiros: a conferência `fecha` não carrega ruído de ponto flutuante.
 */
export function tabelaPorPessoa(
  leituras: readonly LeituraAno<Prejuizos>[],
  limite: number = LIMITE_TOP_PESSOAS,
): TabelaPessoas {
  const carregadas = dadosCarregados(leituras)
  const anosFalha = leituras.filter(x => !x.leitura.ok).map(x => x.ano).sort((a, b) => a - b)

  const grupos = new Map<string | null, { n: number; centavos: number }>()
  for (const { dados } of carregadas) {
    for (const p of dados.por_pessoa) {
      const g = grupos.get(p.pessoa) ?? { n: 0, centavos: 0 }
      g.n += p.n
      g.centavos += emCentavos(p.valor)
      grupos.set(p.pessoa, g)
    }
  }

  const ordenados = [...grupos.entries()]
    .map(([pessoa, g]) => ({ pessoa, n: g.n, centavos: g.centavos }))
    .sort((a, b) => {
      const porMagnitude = Math.abs(b.centavos) - Math.abs(a.centavos)
      if (porMagnitude !== 0) return porMagnitude
      if (a.pessoa === null || b.pessoa === null) return a.pessoa === b.pessoa ? 0 : a.pessoa === null ? 1 : -1
      return a.pessoa.localeCompare(b.pessoa, 'pt-BR')
    })

  const totalCentavos = ordenados.reduce((s, g) => s + g.centavos, 0)
  const totalN = ordenados.reduce((s, g) => s + g.n, 0)
  const total = { n: totalN, valor: totalCentavos / 100 }
  const pct = (centavos: number) => pctDe(centavos / 100, total.valor)

  const corte = Math.max(0, limite)
  const linhas = ordenados.slice(0, corte).map((g, i): LinhaPessoa => ({
    posicao: i + 1,
    pessoa: g.pessoa ?? ROTULO_SEM_PESSOA,
    semPessoa: g.pessoa === null,
    n: g.n,
    valor: g.centavos / 100,
    pct: pct(g.centavos),
  }))
  const resto = ordenados.slice(corte)
  const restoCentavos = resto.reduce((s, g) => s + g.centavos, 0)
  const demais: LinhaDemaisPessoas | null = resto.length > 0
    ? {
      pessoas: resto.length,
      rotulo: rotuloDemaisPessoas(resto.length),
      n: resto.reduce((s, g) => s + g.n, 0),
      valor: restoCentavos / 100,
      pct: pct(restoCentavos),
    }
    : null

  const totalDosAnos = carregadas.reduce((s, x) => s + emCentavos(x.dados.prejuizo.total), 0)
  return {
    linhas,
    demais,
    total,
    anos: carregadas.map(x => x.ano),
    anosFalha,
    fecha: totalCentavos === totalDosAnos,
  }
}

// ── Bandeja ────────────────────────────────────────────────────────────────────────────────────

export interface ItemBandeja {
  categoriaId: number
  rotulo: string
  /** Total por ano selecionado (só os que carregaram). */
  porAno: { ano: number; total: number }[]
  /** Soma dos anos listados. */
  total: number
}

/** A bandeja de todos os anos carregados, unida por categoria. Vazia = o mapa conhece tudo. */
export function bandejaDosAnos(leituras: readonly LeituraAno<Prejuizos>[]): ItemBandeja[] {
  const itens = new Map<number, ItemBandeja>()
  for (const { ano, dados } of dadosCarregados(leituras)) {
    for (const b of dados.bandeja) {
      const item = itens.get(b.categoria_id) ?? { categoriaId: b.categoria_id, rotulo: b.rotulo, porAno: [], total: 0 }
      item.porAno.push({ ano, total: b.total })
      item.total = (emCentavos(item.total) + emCentavos(b.total)) / 100
      itens.set(b.categoria_id, item)
    }
  }
  return [...itens.values()]
}
