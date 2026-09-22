import { describe, it, expect } from 'vitest'
import { parseDemonstrativoCruRows, mesParaNumero } from './parsers/demonstrativo-competencia'
import {
  lerMatrizXlsx, porCabecalho, fixturesAusentes, motivoDoPulo, EXIGIR_FIXTURES,
} from './fixtures-oraculo'
import type { Matriz } from './parsers/comum'

// ── GATE 1 · Oráculo cru ↔ tratado do Demonstrativo de Resultado ────────────────────────────
//
// O que este teste prova: o parser TS que roda no SERVIDOR produz, a partir do CRU do Monde,
// exatamente o que `tratamento_demonstrativo_v1.R` produzia na máquina de alguém. Enquanto ele
// não estiver verde, o script R não pode ser aposentado (invariante 10 da versão).
//
// Anexo §9: cru `demostrativo_de_resultado.xlsx` (3.896×17, export 21/09) → tratado
// `Demonstrativo_por_Competencia_tratado.xlsx` (3.334×8, Σ 508.964,10). 26.672 células,
// **zero** divergências conhecidas — esta é a única das cinco bases sem nenhuma.

const CRU = 'demonstrativo-cru.xlsx'
const TRATADO = 'demonstrativo-tratado.xlsx'
const AUSENTES = fixturesAusentes([CRU, TRATADO])

/** Somas por ano do export de 21/09 (briefing §9) — o teste relacional REX ≡ Σ linhas. */
const SOMA_POR_ANO: Record<number, number> = {
  2024: 224_299.47,
  2025: 464_892.94,
  2026: -180_228.31,
}
const TOTAL_GERAL = 508_964.10

function centavos(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Data nativa da planilha → `AAAA-MM-DD` em UTC. O tratado grava a competência como `Date`
 *  (2026-02-01T03:00:00Z); ler o dia em UTC evita o deslocamento de fuso da ADR-0099. */
function diaUtc(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}

it('a fixture do oráculo está presente (ou o pulo está declarado)', () => {
  if (EXIGIR_FIXTURES) {
    expect(AUSENTES, `REQUIRE_FIXTURES=1 e ${motivoDoPulo(AUSENTES)}`).toEqual([])
  } else if (AUSENTES.length > 0) {
    // Deixa o rastro NOMEADO no relatório do runner em vez de sumir com o bloco calado.
    expect(motivoDoPulo(AUSENTES)).toContain('fixture(s) ausente(s)')
  } else {
    expect(AUSENTES).toEqual([])
  }
})

describe.skipIf(AUSENTES.length > 0)('oráculo — Demonstrativo de Resultado (competência)', () => {
  const resultado = parseDemonstrativoCruRows(lerMatrizXlsx(CRU))
  const tratado = porCabecalho(lerMatrizXlsx(TRATADO))

  it('o parse do CRU fecha — estrutura reconhecida e 557 checksums conferidos', () => {
    if (!resultado.ok) throw new Error(`${resultado.codigo}: ${resultado.mensagem}`)
    expect(resultado.checksums).toHaveLength(557)
    expect(resultado.diagnostico.niveis).toBe(5)
    expect(resultado.diagnostico.campos).toEqual(['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês'])
    // As colunas do cabeçalho (B,G,K,M,O) NÃO são as dos dados (A,C,D,H,I) — é o motivo de a
    // descoberta ser posicional. Se um dia coincidirem, ótimo; se este expect quebrar porque
    // alguém "simplificou" para ler pelo índice do cabeçalho, o oráculo acusa.
    expect(resultado.diagnostico.colunasDeRotulo).toEqual([0, 2, 3, 7, 8])
    expect(resultado.diagnostico.linhasIgnoradas).toBe(0)
  })

  it('contagem de linhas idêntica ao tratado (3.334 folhas)', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    expect(resultado.linhas).toHaveLength(3334)
    expect(tratado).toHaveLength(3334)
  })

  it('as 26.672 células batem com o tratado — ZERO divergências', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const divergencias: string[] = []
    let celulas = 0

    resultado.linhas.forEach((meu, i) => {
      const dele = tratado[i]
      const par: [string, unknown, unknown][] = [
        ['Tipo',        meu.tipo,                  dele['Tipo']],
        ['Grupo',       meu.grupo,                 dele['Grupo']],
        ['Descrição',   meu.descricao,             dele['Descrição']],
        ['Ano',         meu.ano,                   Number(dele['Ano'])],
        ['Mês',         meu.mes,                   dele['Mês']],
        ['Mês Nº',      meu.mes_num,               Number(dele['Mês Nº'])],
        ['Competência', meu.competencia,           diaUtc(dele['Competência'])],
        ['Valor',       Math.round(meu.valor * 100), centavos(dele['Valor'])],
      ]
      for (const [coluna, meuValor, deleValor] of par) {
        celulas++
        if (meuValor !== deleValor) {
          divergencias.push(`linha ${i + 1} · ${coluna}: TS=${JSON.stringify(meuValor)} R=${JSON.stringify(deleValor)}`)
        }
      }
    })

    expect(celulas).toBe(26_672)
    expect(divergencias.slice(0, 20), `${divergencias.length} divergência(s)`).toEqual([])
  })

  it('soma por ano e Total Geral batem com os números declarados no briefing', () => {
    if (!resultado.ok) throw new Error(resultado.mensagem)
    const porAno = new Map<number, number>()
    for (const l of resultado.linhas) {
      porAno.set(l.ano, (porAno.get(l.ano) ?? 0) + Math.round(l.valor * 100))
    }
    for (const [ano, soma] of Object.entries(SOMA_POR_ANO)) {
      expect(porAno.get(Number(ano)), `ano ${ano}`).toBe(Math.round(soma * 100))
    }
    const total = [...porAno.values()].reduce((a, b) => a + b, 0)
    expect(total).toBe(Math.round(TOTAL_GERAL * 100))
    expect(resultado.diagnostico.totalGeral).toBe(TOTAL_GERAL)
  })
})

// ── Sondas: cada guarda é VISTA reprovando por mutante ───────────────────────────────────────
// Uma guarda que nunca foi vista reprovando é decoração. Cada caso abaixo monta o arquivo que a
// guarda existe para recusar e exige a recusa — e o caso positivo prova que o mesmo arquivo,
// sem o mutante, passa.

/** Pivot mínimo VÁLIDO com os cinco níveis do export real: cabeçalho, quatro linhas de subtotal
 *  (uma por nível), duas folhas e o Total Geral. Coluna 5 é a de valor. */
function pivotValido(): unknown[][] {
  return [
    ['Tipo', 'Grupo', 'Descrição', 'Ano', 'Mês', null],
    ['Receitas', null, null,  null, null,        300],
    [null, 'Receita de Vendas', null, null, null, 300],
    [null, null, 'Carta de Crédito', null, null,  300],
    [null, null, null, '2026', null,              300],
    [null, null, null, null, 'janeiro',           100],
    [null, null, null, null, 'fevereiro',         200],
    ['Total Geral', null, null, null, null,       300],
  ]
}

describe('sondas do parser do Demonstrativo (mutante ⇒ reprova)', () => {
  it('CONTROLE: o pivot mínimo sem mutante PASSA', () => {
    const r = parseDemonstrativoCruRows(pivotValido() as Matriz)
    if (!r.ok) throw new Error(`${r.codigo}: ${r.mensagem}`)
    expect(r.linhas.map((l) => l.valor)).toEqual([100, 200])
  })

  it('mutante: subtotal que não fecha ⇒ CHECKSUM_FALHOU (a base não é alterada)', () => {
    const m = pivotValido()
    m[1][5] = 999            // o subtotal de "Receitas" deixa de bater com 100 + 200
    const r = parseDemonstrativoCruRows(m as Matriz)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: Total Geral que não fecha ⇒ CHECKSUM_FALHOU', () => {
    const m = pivotValido()
    m[7][5] = 301
    const r = parseDemonstrativoCruRows(m as Matriz)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('CHECKSUM_FALHOU')
  })

  it('mutante: formato LARGO (campos na área de COLUNAS) ⇒ ESTRUTURA_INESPERADA', () => {
    // Quatro colunas de dado concentrando números é a assinatura do export largo: o pivot foi
    // exportado com campos na área de COLUNAS, e cada uma delas virou uma coluna de valor.
    const m: unknown[][] = [
      ['Tipo', 'Mês', null, null, null, null],
      ['Receitas', 'janeiro',   10, 11, 12, 13],
      ['Receitas', 'fevereiro', 20, 21, 22, 23],
      ['Receitas', 'março',     30, 31, 32, 33],
      ['Receitas', 'abril',     40, 41, 42, 43],
      ['Receitas', 'maio',      50, 51, 52, 53],
      ['Receitas', 'junho',     60, 61, 62, 63],
    ]
    const r = parseDemonstrativoCruRows(m as Matriz)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('formato LARGO')
  })

  it('mutante: colunas de rótulo ≠ campos do cabeçalho ⇒ ESTRUTURA_INESPERADA', () => {
    const m = pivotValido()
    // Um sexto campo no cabeçalho sem nenhuma coluna de rótulo correspondente nos dados: é o que
    // se vê quando um nível do pivot fica colapsado no export.
    m[0][5] = 'Centro de Custo'
    m[0][6] = null
    for (let i = 1; i < m.length; i++) { m[i][6] = m[i][5]; m[i][5] = null }
    const r = parseDemonstrativoCruRows(m as Matriz)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
    expect(r.mensagem).toContain('coluna(s) de rótulo')
  })

  it('mutante: folha sem valor NÃO é pulada em silêncio', () => {
    const m = pivotValido()
    m[5][5] = null           // a folha "janeiro" perde o valor
    const r = parseDemonstrativoCruRows(m as Matriz)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.codigo).toBe('ESTRUTURA_INESPERADA')
  })

  it('mês é lido por tabela FIXA, nunca por locale', () => {
    expect(mesParaNumero('março')).toBe(3)
    expect(mesParaNumero('MARÇO')).toBe(3)
    expect(mesParaNumero('marco')).toBe(3)
    expect(mesParaNumero('mar')).toBe(3)
    expect(mesParaNumero('  dezembro  ')).toBe(12)
    expect(mesParaNumero('12')).toBe(12)
    // "Mar"/"May" do `%b` em locale inglês não são meses pt-BR e não podem virar 3/5 por acaso.
    expect(mesParaNumero('may')).toBeNull()
    expect(mesParaNumero('')).toBeNull()
    expect(mesParaNumero('13')).toBeNull()
  })
})
