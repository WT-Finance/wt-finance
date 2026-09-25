import { describe, it, expect } from 'vitest'

import {
  ARESTAS_GRAFO_INGESTAO, preRequisitosBloqueantes, avaliarDependenciaDeCarga, dataEmSP,
  type ArestaGrafo,
} from './grafo'
import { BASES_INGESTAO, type BaseIngestao } from './bases'

// ── Arestas — §5 do contrato, tal como o anexo M7a §1 as declara ────────────────────────────

describe('ARESTAS_GRAFO_INGESTAO', () => {
  it('reproduz exatamente as arestas do §5, com só UMA marcada bloqueante', () => {
    expect(ARESTAS_GRAFO_INGESTAO).toEqual<readonly ArestaGrafo[]>([
      { de: 'vendas-produto', para: 'lancamentos-movimentacao', bloqueante: false },
      { de: 'vendas-produto', para: 'lancamentos-aberto', bloqueante: false },
      { de: 'lancamentos-movimentacao', para: 'lancamentos-operacao', bloqueante: false },
      { de: 'lancamentos-aberto', para: 'lancamentos-operacao', bloqueante: true },
    ])
  })

  it('só a aresta Aberto → Operação é bloqueante', () => {
    const bloqueantes = ARESTAS_GRAFO_INGESTAO.filter((a) => a.bloqueante)
    expect(bloqueantes).toEqual([{ de: 'lancamentos-aberto', para: 'lancamentos-operacao', bloqueante: true }])
  })

  it('demonstrativo-competencia é isolado — nenhuma aresta o toca (independente, anexo §1)', () => {
    const tocam = ARESTAS_GRAFO_INGESTAO.filter(
      (a) => a.de === 'demonstrativo-competencia' || a.para === 'demonstrativo-competencia',
    )
    expect(tocam).toEqual([])
  })

  it('nenhuma base tem aresta de volta para si mesma (nenhum ciclo)', () => {
    // DFS a partir de cada base pelas arestas declaradas — se alguma alcançar a si mesma de
    // volta, há um ciclo (o grafo do §5 é, por definição do contrato, um DAG).
    for (const inicio of BASES_INGESTAO) {
      const visitados = new Set<BaseIngestao>()
      const pilha: BaseIngestao[] = ARESTAS_GRAFO_INGESTAO.filter((a) => a.de === inicio).map((a) => a.para)
      while (pilha.length > 0) {
        const atual = pilha.pop() as BaseIngestao
        expect(atual).not.toBe(inicio) // ciclo encontrado
        if (visitados.has(atual)) continue
        visitados.add(atual)
        for (const a of ARESTAS_GRAFO_INGESTAO.filter((x) => x.de === atual)) pilha.push(a.para)
      }
    }
  })
})

describe('preRequisitosBloqueantes', () => {
  it('só lancamentos-operacao tem pré-requisito bloqueante (lancamentos-aberto)', () => {
    for (const base of BASES_INGESTAO) {
      const esperado: readonly BaseIngestao[] = base === 'lancamentos-operacao' ? ['lancamentos-aberto'] : []
      expect(preRequisitosBloqueantes(base)).toEqual(esperado)
    }
  })
})

// ── dataEmSP — conversão de fuso, isolada ────────────────────────────────────────────────────

describe('dataEmSP', () => {
  it('timestamp de madrugada UTC que já é "amanhã" em UTC mas ainda "hoje" em SP', () => {
    // 2026-09-26T02:30:00Z (UTC) = 2026-09-25T23:30 em SP (UTC-3, sem horário de verão no Brasil).
    expect(dataEmSP('2026-09-26T02:30:00Z')).toBe('2026-09-25')
  })

  it('inverso: mesma DATA em UTC, mas ainda o dia ANTERIOR em SP — split(\'T\') erraria isto', () => {
    // 2026-09-26T01:00:00Z (UTC) = 2026-09-25T22:00 em SP — a data em SP é 25, não 26, embora a
    // string ISO comece com "2026-09-26".
    expect(dataEmSP('2026-09-26T01:00:00Z')).toBe('2026-09-25')
  })
})

// ── avaliarDependenciaDeCarga — a regra pura do §5 ───────────────────────────────────────────

describe('avaliarDependenciaDeCarga', () => {
  it('Aberto aplicado HOJE ⇒ ok', () => {
    const mapa = new Map<BaseIngestao, string | null>([['lancamentos-aberto', '2026-09-25T14:00:00Z']])
    expect(avaliarDependenciaDeCarga('lancamentos-operacao', mapa, '2026-09-25')).toEqual({ ok: true })
  })

  it('Aberto aplicado ONTEM ⇒ falta, com a data da última carga', () => {
    const mapa = new Map<BaseIngestao, string | null>([['lancamentos-aberto', '2026-09-24T14:00:00Z']])
    const r = avaliarDependenciaDeCarga('lancamentos-operacao', mapa, '2026-09-25')
    expect(r).toEqual({
      ok: false,
      faltando: [{ base: 'lancamentos-aberto', ultimaAplicadaEm: '2026-09-24T14:00:00Z' }],
    })
  })

  it('Aberto NUNCA aplicado (null) ⇒ falta, com ultimaAplicadaEm null', () => {
    const mapa = new Map<BaseIngestao, string | null>([['lancamentos-aberto', null]])
    const r = avaliarDependenciaDeCarga('lancamentos-operacao', mapa, '2026-09-25')
    expect(r).toEqual({
      ok: false,
      faltando: [{ base: 'lancamentos-aberto', ultimaAplicadaEm: null }],
    })
  })

  it('bases SEM pré-requisito bloqueante ⇒ sempre ok, mesmo com o mapa vazio', () => {
    const mapaVazio = new Map<BaseIngestao, string | null>()
    for (const base of BASES_INGESTAO) {
      if (base === 'lancamentos-operacao') continue
      expect(avaliarDependenciaDeCarga(base, mapaVazio, '2026-09-25')).toEqual({ ok: true })
    }
  })

  it('virada de dia: concluido_em já "amanhã" em UTC mas ainda "hoje" em SP ⇒ ok', () => {
    // 2026-09-26T02:30:00Z é 2026-09-25 em SP — se "hoje" (SP) é 2026-09-25, bate.
    const mapa = new Map<BaseIngestao, string | null>([['lancamentos-aberto', '2026-09-26T02:30:00Z']])
    expect(avaliarDependenciaDeCarga('lancamentos-operacao', mapa, '2026-09-25')).toEqual({ ok: true })
  })

  it('inverso da virada: mesma DATA em UTC, mas ainda ONTEM em SP ⇒ falta', () => {
    // 2026-09-26T01:00:00Z é 2026-09-25 em SP — comparar com "hoje" (SP) = 2026-09-26 NÃO bate,
    // embora um split/fatiamento da string ISO leria "2026-09-26" e diria (errado) que bate.
    const mapa = new Map<BaseIngestao, string | null>([['lancamentos-aberto', '2026-09-26T01:00:00Z']])
    const r = avaliarDependenciaDeCarga('lancamentos-operacao', mapa, '2026-09-26')
    expect(r.ok).toBe(false)
  })
})
