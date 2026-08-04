import { describe, it, expect } from 'vitest'
import {
  MESES_RECONCILIACAO,
  MESES_TRIPWIRE,
  mesesRecentes,
  rangeDoMes,
  proximoMesReconciliacao,
  avaliarMes,
  mesProblematico,
  mesclarTripwire,
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

describe('avaliarMes', () => {
  const AGORA = '2026-08-04T12:00:00.000Z'
  // Números REAIS de jul/2026, medidos em 04/08 contra a API depois da 1ª reconciliação.
  const julho = {
    mes: '2026-07',
    apiTotal: 775,
    lidas: 775,
    espelhaveis: 746,
    excluidas: { welcome: 8, sem_setor: 12, sem_item_ativo: 9 },
    erros: 0,
    espelho: 751,
    verificadoEmISO: AGORA,
  }

  it('a conta fecha: lidas = espelháveis + excluídas + erros', () => {
    const m = avaliarMes(julho)
    expect(746 + 8 + 12 + 9 + 0).toBe(775)
    expect(m.conta_fecha).toBe(true)
    expect(m.sem_sale_id).toBe(0)
  })

  it('NÃO trata exclusão por regra como divergência — é o erro que o briefing tinha', () => {
    const m = avaliarMes({ ...julho, espelho: 746 })
    expect(m.sobrando).toBe(0)
    expect(mesProblematico(m)).toBe(false) // 29 excluídas e mesmo assim silencioso
  })

  it('mede as vendas que sobraram no espelho (deixaram de ser espelháveis)', () => {
    const m = avaliarMes(julho) // espelho 751 × espelháveis 746
    expect(m.sobrando).toBe(5)
    expect(mesProblematico(m)).toBe(true)
  })

  it('conta as vendas que a API lista sem sale_id — a ingestão não as alcança', () => {
    const m = avaliarMes({ ...julho, lidas: 770, espelhaveis: 741 })
    expect(m.sem_sale_id).toBe(5)
    expect(mesProblematico(m)).toBe(true)
  })

  it('erro de venda acende mesmo com todo o resto certo', () => {
    const m = avaliarMes({ ...julho, espelhaveis: 744, erros: 2, espelho: 744 })
    expect(m.erros).toBe(2)
    expect(m.conta_fecha).toBe(true)
    expect(mesProblematico(m)).toBe(true)
  })

  it('conta que não fecha acende (venda lida sumiu sem explicação)', () => {
    const m = avaliarMes({ ...julho, espelhaveis: 700, espelho: 700 })
    expect(m.conta_fecha).toBe(false)
    expect(mesProblematico(m)).toBe(true)
  })
})

describe('mesclarTripwire', () => {
  const AGORA = '2026-08-04T12:00:00.000Z'
  const visiveis = mesesRecentes(HOJE, 12)
  const okDe = (mes: string) => avaliarMes({
    mes, apiTotal: 100, lidas: 100, espelhaveis: 90,
    excluidas: { welcome: 4, sem_setor: 3, sem_item_ativo: 3 }, erros: 0, espelho: 90,
    verificadoEmISO: AGORA,
  })

  it('mês nunca reconciliado é NÃO VERIFICADO, nunca divergente', () => {
    const t = mesclarTripwire(null, okDe('2026-08'), visiveis, AGORA)
    expect(t.acendeu).toBe(false)
    expect(t.meses['2026-08']).toMatchObject({ mes: '2026-08', sobrando: 0 })
    expect(t.meses['2026-01']).toEqual({ nao_verificado: true })
    expect(Object.keys(t.meses)).toHaveLength(12)
  })

  it('acumula mês a mês: a 2ª invocação não apaga a apuração da 1ª', () => {
    const t1 = mesclarTripwire(null, okDe('2026-08'), visiveis, AGORA)
    const t2 = mesclarTripwire(t1, okDe('2026-07'), visiveis, AGORA)
    expect(t2.meses['2026-08']).toMatchObject({ mes: '2026-08' })
    expect(t2.meses['2026-07']).toMatchObject({ mes: '2026-07' })
  })

  it('acende com o motivo legível quando um mês verificado tem problema', () => {
    const ruim = avaliarMes({
      mes: '2026-07', apiTotal: 775, lidas: 775, espelhaveis: 746,
      excluidas: { welcome: 8, sem_setor: 12, sem_item_ativo: 9 }, erros: 0, espelho: 751,
      verificadoEmISO: AGORA,
    })
    const t = mesclarTripwire(null, ruim, visiveis, AGORA)
    expect(t.acendeu).toBe(true)
    expect(t.motivos).toEqual(['2026-07: 5 sobrando'])
  })

  it('mês que saiu da janela de 12 é descartado (painel, não histórico)', () => {
    const antigo = mesclarTripwire(null, okDe('2025-09'), visiveis, AGORA)
    expect(antigo.meses['2025-09']).toMatchObject({ mes: '2025-09' })
    const depois = mesclarTripwire(antigo, null, mesesRecentes('2026-09-04', 12), AGORA)
    expect(depois.meses['2025-09']).toBeUndefined()
    expect(Object.keys(depois.meses)).toHaveLength(12)
  })

  it('sem apuração nova só recarimba e reavalia o que já havia', () => {
    const t1 = mesclarTripwire(null, okDe('2026-08'), visiveis, AGORA)
    const t2 = mesclarTripwire(t1, null, visiveis, '2026-08-05T00:00:00.000Z')
    expect(t2.atualizado_em).toBe('2026-08-05T00:00:00.000Z')
    expect(t2.meses['2026-08']).toMatchObject({ mes: '2026-08' })
    expect(t2.acendeu).toBe(false)
  })
})
