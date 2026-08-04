import { describe, it, expect } from 'vitest'
import {
  MESES_RECONCILIACAO,
  MESES_TRIPWIRE,
  mesesRecentes,
  rangeDoMes,
  proximoMesReconciliacao,
  montarTripwire,
} from './reconciliacao'

// Âncora: "hoje" fixo (não usa Date.now → determinístico), como em sync-atraso.test.ts.
const HOJE = '2026-08-04'

describe('mesesRecentes', () => {
  it('devolve os 3 meses da janela, do MAIS RECENTE para o mais antigo', () => {
    expect(mesesRecentes(HOJE, MESES_RECONCILIACAO)).toEqual(['2026-08', '2026-07', '2026-06'])
  })

  it('atravessa a virada de ano sem quebrar', () => {
    expect(mesesRecentes('2026-01-15', 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })

  it('cobre os 12 meses do tripwire', () => {
    const m = mesesRecentes(HOJE, MESES_TRIPWIRE)
    expect(m).toHaveLength(12)
    expect(m[0]).toBe('2026-08')
    expect(m[11]).toBe('2025-09')
  })

  it('n <= 0 devolve pelo menos o mês corrente (nunca lista vazia)', () => {
    expect(mesesRecentes(HOJE, 0)).toEqual(['2026-08'])
  })
})

describe('rangeDoMes', () => {
  it('fecha o mês de 31 dias', () => {
    expect(rangeDoMes('2026-07')).toEqual({ from: '2026-07-01', to: '2026-07-31' })
  })

  it('fecha o mês de 30 dias', () => {
    expect(rangeDoMes('2026-06')).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })

  it('acerta fevereiro de ano bissexto', () => {
    expect(rangeDoMes('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
  })

  it('acerta fevereiro de ano comum', () => {
    expect(rangeDoMes('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('proximoMesReconciliacao', () => {
  const janela = ['2026-08', '2026-07', '2026-06']

  it('sem cursor começa pelo mês MAIS RECENTE (onde a venda atrasada é mais provável)', () => {
    expect(proximoMesReconciliacao(null, janela)).toBe('2026-08')
    expect(proximoMesReconciliacao(undefined, janela)).toBe('2026-08')
  })

  it('avança no meio da janela', () => {
    expect(proximoMesReconciliacao('2026-08', janela)).toBe('2026-07')
    expect(proximoMesReconciliacao('2026-07', janela)).toBe('2026-06')
  })

  it('do ÚLTIMO da janela volta ao primeiro — é ciclo, não fila que termina', () => {
    expect(proximoMesReconciliacao('2026-06', janela)).toBe('2026-08')
  })

  it('cursor que saiu da janela (virada de mês / pausa longa) retoma do mais recente', () => {
    expect(proximoMesReconciliacao('2026-03', janela)).toBe('2026-08')
    expect(proximoMesReconciliacao('lixo', janela)).toBe('2026-08')
  })

  it('três invocações cobrem a janela inteira, sem repetir', () => {
    const visitados: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < janela.length; i++) {
      cursor = proximoMesReconciliacao(cursor, janela)
      visitados.push(cursor)
    }
    expect(visitados).toEqual(janela)
    expect(new Set(visitados).size).toBe(janela.length)
  })

  it('janela vazia é erro de programação, não silêncio', () => {
    expect(() => proximoMesReconciliacao(null, [])).toThrow()
  })
})

describe('montarTripwire', () => {
  const AGORA = '2026-08-04T12:00:00.000Z'

  it('não acende quando todos os meses batem', () => {
    const t = montarTripwire(['2026-07', '2026-06'], { '2026-07': 775, '2026-06': 700 }, { '2026-07': 775, '2026-06': 700 }, AGORA)
    expect(t.acendeu).toBe(false)
    expect(t.divergentes).toEqual([])
    expect(t.meses.every((l) => l.delta === 0)).toBe(true)
  })

  it('acende com delta NEGATIVO — o espelho perdendo venda, que é o defeito da v5.4.5', () => {
    const t = montarTripwire(['2026-07'], { '2026-07': 775 }, { '2026-07': 737 }, AGORA)
    expect(t.acendeu).toBe(true)
    expect(t.divergentes).toEqual(['2026-07'])
    expect(t.meses[0]).toEqual({ mes: '2026-07', api: 775, espelho: 737, delta: -38 })
  })

  it('acende TAMBÉM com delta positivo — espelho maior que a API é anomalia, não folga', () => {
    const t = montarTripwire(['2026-05'], { '2026-05': 600 }, { '2026-05': 603 }, AGORA)
    expect(t.acendeu).toBe(true)
    expect(t.meses[0].delta).toBe(3)
  })

  it('mês ausente de um lado conta ZERO e a linha aparece (ausência é dado)', () => {
    const t = montarTripwire(['2026-07', '2026-06'], { '2026-07': 10 }, {}, AGORA)
    expect(t.meses).toHaveLength(2)
    expect(t.meses[0]).toEqual({ mes: '2026-07', api: 10, espelho: 0, delta: -10 })
    expect(t.meses[1]).toEqual({ mes: '2026-06', api: 0, espelho: 0, delta: 0 })
    expect(t.divergentes).toEqual(['2026-07'])
  })

  it('preserva a ordem dos meses recebida e carimba a verificação', () => {
    const meses = mesesRecentes(HOJE, 3)
    const t = montarTripwire(meses, {}, {}, AGORA)
    expect(t.meses.map((l) => l.mes)).toEqual(meses)
    expect(t.verificado_em).toBe(AGORA)
  })
})
