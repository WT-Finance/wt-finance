import { describe, it, expect } from 'vitest'
import { deltaYtd } from '@/lib/dre/colunas-tabela'
import { serieMensal } from './agregacao'
import { anoAnteriorDisponivel, calcularIndicadores, sentidoDoDelta } from './indicadores'
import type { LinhaMesCategoria } from './tipos'

const C = (mes: number, valor: number, qtd = 1): LinhaMesCategoria => ({ mes, categoria: 'Anúncios', valor, qtd })

// Gasto no sinal da DRE (negativo).
const ATUAL = [C(1, -60000, 2), C(2, -60000), C(3, -30000)]
const ANTERIOR = [C(1, -50000), C(2, -50000), C(3, -90000)]
const R12 = { mesIni: 1, mesFim: 2 }
const ANOS = [2024, 2025, 2026]

/** `calcularIndicadores` com a base já tendo o ano anterior (2025 em 2026), salvo `anosDisponiveis`. */
const calc = (o: Omit<Parameters<typeof calcularIndicadores>[0], 'anosDisponiveis'> & { anosDisponiveis?: number[] }) =>
  calcularIndicadores({ anosDisponiveis: ANOS, ...o })

describe('sentidoDoDelta', () => {
  it('positivo é favorável, negativo é desfavorável, perto de zero é estável', () => {
    expect(sentidoDoDelta(null)).toBeNull()
    expect(sentidoDoDelta(0.49)).toBe('neutro')
    expect(sentidoDoDelta(-0.49)).toBe('neutro')
    expect(sentidoDoDelta(0.5)).toBe('favoravel')
    expect(sentidoDoDelta(-0.5)).toBe('desfavoravel')
    expect(sentidoDoDelta(14.3)).toBe('favoravel')
    expect(sentidoDoDelta(-20)).toBe('desfavoravel')
  })
})

describe('calcularIndicadores — período e ano anterior', () => {
  it('gasto no recorte, mesmo recorte do ano anterior e nº de lançamentos', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.periodo).toEqual({ valor: -120000, qtd: 3 })
    expect(i.anoAnterior).toEqual({ valor: -100000, qtd: 2 })
    expect(i.anteriorSemHistorico).toBe(false)
  })

  it('gasto que CRESCEU dá Δ negativo e desfavorável (mesma convenção de sinal da DRE)', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.deltaPct).toBeCloseTo(-20, 9)
    expect(i.sentido).toBe('desfavoravel')
  })

  it('gasto que CAIU dá Δ positivo e favorável', () => {
    const maior = [C(1, -70000), C(2, -70000)]
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: maior })
    expect(i.deltaPct).toBeCloseTo((20000 / 140000) * 100, 9)
    expect(i.sentido).toBe('favoravel')
  })

  it('o Δ é exatamente o `deltaYtd` da DRE sobre os mesmos dois valores (dois números vizinhos concordam)', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.deltaPct).toBe(deltaYtd(i.anoAnterior!.valor, i.periodo.valor))
  })

  it('variação pequena lê como estável', () => {
    const i = calc({
      ano: 2026, hoje: '2026-10-08', recorte: { mesIni: 1, mesFim: 1 },
      atual: [C(1, -100200)], anterior: [C(1, -100000)],
    })
    expect(i.deltaPct).toBeCloseTo(-0.2, 9)
    expect(i.sentido).toBe('neutro')
  })

  it('ano anterior DISPONÍVEL mas sem gasto no recorte: zero real; Δ em travessão, nunca Infinity', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: [] })
    expect(i.anoAnterior).toEqual({ valor: 0, qtd: 0 })
    expect(i.anteriorSemHistorico).toBe(false)
    expect(i.deltaPct).toBeNull()
    expect(i.sentido).toBeNull()
  })

  it('ano anterior que não carregou → sem Δ, o resto dos indicadores segue', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: null })
    expect(i.anoAnterior).toBeNull()
    expect(i.anteriorSemHistorico).toBe(false)
    expect(i.deltaPct).toBeNull()
    expect(i.periodo.valor).toBe(-120000)
  })
})

describe('ano anterior SEM histórico (2024 → 2023) — ausência de dado, não zero', () => {
  const HOJE = '2026-10-08'

  it('anoAnteriorDisponivel: só quando o ano anterior consta em anosDisponiveis', () => {
    expect(anoAnteriorDisponivel(2024, ANOS)).toBe(false)
    expect(anoAnteriorDisponivel(2025, ANOS)).toBe(true)
    expect(anoAnteriorDisponivel(2026, ANOS)).toBe(true)
    expect(anoAnteriorDisponivel(2026, [])).toBe(false)
  })

  it('o resumo vazio de 2023 NÃO vira "R$ 0,00": anoAnterior e Δ ficam null', () => {
    // A RPC devolve um resumo vazio para 2023 (cubo `[]`) — somado, daria zero lançamentos.
    const i = calc({ ano: 2024, hoje: HOJE, recorte: R12, atual: ATUAL, anterior: [] })
    expect(i.anteriorSemHistorico).toBe(true)
    expect(i.anoAnterior).toBeNull()
    expect(i.deltaPct).toBeNull()
    expect(i.sentido).toBeNull()
    expect(i.periodo.valor).toBe(-120000) // o ano selecionado segue de pé
  })

  it('mesmo que o cubo anterior traga linhas, o ano fora da base é ignorado (a base manda)', () => {
    const i = calc({ ano: 2024, hoje: HOJE, recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.anoAnterior).toBeNull()
    expect(i.deltaPct).toBeNull()
  })

  it('ano anterior disponível e com gasto: o mês zerado dele é ZERO real, e entra no total', () => {
    const i = calc({
      ano: 2026, hoje: HOJE, recorte: { mesIni: 1, mesFim: 3 }, atual: ATUAL, anterior: [C(1, -50000)],
    })
    expect(i.anteriorSemHistorico).toBe(false)
    expect(i.anoAnterior).toEqual({ valor: -50000, qtd: 1 })
    expect(i.deltaPct).not.toBeNull()
  })

  it('série mensal: referência null (sem histórico/falha) = null em TODOS os meses; com cubo, mês sem gasto é 0 real', () => {
    // O container passa `null` à série quando o ano anterior não tem histórico (ver `SerieMensal`).
    const sem = serieMensal(ATUAL, null, { mesIni: 1, mesFim: 4 }, 12)
    expect(sem.map(p => p.anterior)).toEqual([null, null, null, null])
    expect(sem.map(p => p.atual)).toEqual([-60000, -60000, -30000, 0])

    const com = serieMensal(ATUAL, [C(1, -50000)], { mesIni: 1, mesFim: 3 }, 12)
    expect(com.map(p => p.anterior)).toEqual([-50000, 0, 0])
  })
})

describe('calcularIndicadores — mês de referência', () => {
  it('é a ponta final do recorte, e é o MÊS CORRENTE quando o recorte termina nele', () => {
    const i = calc({ ano: 2026, hoje: '2026-02-10', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef).toEqual({ mes: 2, valor: -60000, qtd: 1, corrente: true })
  })

  it('recorte que não termina no mês de hoje: último mês do período, não corrente', () => {
    const i = calc({ ano: 2026, hoje: '2026-10-08', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef.corrente).toBe(false)
    expect(i.mesRef.mes).toBe(2)
  })

  it('ano encerrado nunca tem mês corrente, mesmo com o mesmo número de mês', () => {
    const i = calc({ ano: 2025, hoje: '2026-02-10', recorte: R12, atual: ATUAL, anterior: ANTERIOR })
    expect(i.mesRef.corrente).toBe(false)
  })

  it('mês sem lançamento: zero e zero lançamentos', () => {
    const i = calc({
      ano: 2026, hoje: '2026-10-08', recorte: { mesIni: 1, mesFim: 6 }, atual: ATUAL, anterior: ANTERIOR,
    })
    expect(i.mesRef).toEqual({ mes: 6, valor: 0, qtd: 0, corrente: false })
  })
})
