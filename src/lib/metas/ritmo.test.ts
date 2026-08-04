import { describe, it, expect } from 'vitest'
import {
  calcularRitmo, calcularRitmoAgregado, classificarRitmo,
  RITMO_META_ATINGIDA, RITMO_ATENCAO,
  type MetaMensal, type PontoDia,
} from './ritmo'

// Metas de 100/dia por construção (mês de 31d = 3100; 28d = 2800; 30d = 3000),
// para os números da pró-rata saírem redondos e conferíveis a olho.
const JUL = (v = 3100): MetaMensal => ({ ano: 2026, mes: 7, valorMeta: v })
const serieDe = (dias: Array<[string, number]>): PontoDia[] =>
  dias.map(([data, valor]) => ({ data, valor }))

describe('classificarRitmo — régua (constantes nomeadas)', () => {
  it('limiares', () => {
    expect(RITMO_META_ATINGIDA).toBe(100)
    expect(RITMO_ATENCAO).toBe(60)
    expect(classificarRitmo(120)).toBe('verde')
    expect(classificarRitmo(100)).toBe('verde')
    expect(classificarRitmo(80)).toBe('ambar')
    expect(classificarRitmo(60)).toBe('ambar')
    expect(classificarRitmo(59.9)).toBe('vermelho')
    expect(classificarRitmo(0)).toBe('vermelho')
    expect(classificarRitmo(null)).toBeNull()
    expect(classificarRitmo(Infinity)).toBeNull()
  })
})

describe('calcularRitmo', () => {
  it('mês parcial — hoje = última venda no meio do mês', () => {
    const r = calcularRitmo({
      from: '2026-07-01', to: '2026-07-31', ultimaVenda: '2026-07-10',
      metas: [JUL(3100)],
      serie: serieDe([['2026-07-03', 400], ['2026-07-08', 500]]), // realizado 900
    })
    expect(r.metaPeriodo).toBeCloseTo(3100, 6)   // mês inteiro (31 × 100)
    expect(r.esperadoAteHoje).toBeCloseTo(1000, 6) // dias 1..10 (10 × 100)
    expect(r.realizado).toBe(900)
    expect(r.pctMeta).toBeCloseTo((900 / 3100) * 100, 6)
    expect(r.ritmoPct).toBeCloseTo(90, 6)        // 900 / 1000
    expect(r.status).toBe('ambar')
    expect(r.parcial).toBe(true)
    expect(r.hoje).toBe('2026-07-10')
    // gráfico: 31 pontos; último dia = meta cheia, real futuro (null)
    expect(r.pontos).toHaveLength(31)
    expect(r.pontos[30].metaAcum).toBeCloseTo(3100, 6)
    expect(r.pontos[30].realAcum).toBeNull()
    expect(r.pontos[30].futuro).toBe(true)
    expect(r.pontos[9].realAcum).toBe(900)       // dia 10 (idx 9) — acumulado até hoje
    expect(r.pontos[9].futuro).toBe(false)
  })

  it('YTD parcial (este-ano) — esperado linear até hoje', () => {
    // YTD = Jan1 até o FIM do mês corrente (Jul31, como resolvePeriodo('este-ano')).
    // metaPeriodo = 21200 (7 meses a 100/dia · 212 dias); decorrido = 191/212 dias →
    // esperado LINEAR = 21200·191/212 = 19100.
    const metas: MetaMensal[] = [
      { ano: 2026, mes: 1, valorMeta: 3100 }, { ano: 2026, mes: 2, valorMeta: 2800 },
      { ano: 2026, mes: 3, valorMeta: 3100 }, { ano: 2026, mes: 4, valorMeta: 3000 },
      { ano: 2026, mes: 5, valorMeta: 3100 }, { ano: 2026, mes: 6, valorMeta: 3000 },
      { ano: 2026, mes: 7, valorMeta: 3100 },
    ]
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-07-31', ultimaVenda: '2026-07-10',
      metas, serie: serieDe([['2026-04-01', 19100]]),
    })
    expect(r.esperadoAteHoje).toBeCloseTo(19100, 4) // 21200·191/212
    expect(r.realizado).toBe(19100)
    expect(r.ritmoPct).toBeCloseTo(100, 4) // realizado == esperado → verde
    expect(r.status).toBe('verde')
    expect(r.parcial).toBe(true)
  })

  it('multi-mês FECHADO — hoje = to; esperado = meta do período', () => {
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-02-28', ultimaVenda: '2026-06-01', // depois do fim
      metas: [{ ano: 2026, mes: 1, valorMeta: 3100 }, { ano: 2026, mes: 2, valorMeta: 2800 }],
      serie: serieDe([['2026-01-15', 5900]]),
    })
    expect(r.metaPeriodo).toBeCloseTo(5900, 6)
    expect(r.esperadoAteHoje).toBeCloseTo(5900, 6) // fechado → esperado = meta cheia
    expect(r.ritmoPct).toBeCloseTo(100, 6)
    expect(r.pctMeta).toBeCloseTo(100, 6)          // com esperado=meta, ritmo == %meta
    expect(r.status).toBe('verde')
    expect(r.parcial).toBe(false)
    expect(r.hoje).toBe('2026-02-28')
  })

  it('personalizado cortando meses nas DUAS bordas', () => {
    // 15..31 jan (17×100=1700) + 1..10 fev (10×100=1000) = 2700
    const r = calcularRitmo({
      from: '2026-01-15', to: '2026-02-10', ultimaVenda: '2026-02-10',
      metas: [{ ano: 2026, mes: 1, valorMeta: 3100 }, { ano: 2026, mes: 2, valorMeta: 2800 }],
      serie: serieDe([['2026-01-20', 1350]]),
    })
    expect(r.metaPeriodo).toBeCloseTo(2700, 6)
    expect(r.esperadoAteHoje).toBeCloseTo(2700, 6) // hoje = to
    expect(r.pctMeta).toBeCloseTo(50, 6)           // 1350 / 2700
    expect(r.parcial).toBe(false)
  })

  it('hoje = última venda dentro de período multi-mês em curso', () => {
    // esperado = jan cheio (3100) + fev 1..10 (1000) = 4100
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-03-31', ultimaVenda: '2026-02-10',
      metas: [
        { ano: 2026, mes: 1, valorMeta: 3100 },
        { ano: 2026, mes: 2, valorMeta: 2800 },
        { ano: 2026, mes: 3, valorMeta: 3100 },
      ],
      serie: serieDe([['2026-01-05', 4100]]),
    })
    expect(r.metaPeriodo).toBeCloseTo(3100 + 2800 + 3100, 6)
    expect(r.esperadoAteHoje).toBeCloseTo(4100, 6)
    expect(r.ritmoPct).toBeCloseTo(100, 6)
    expect(r.status).toBe('verde')
    expect(r.parcial).toBe(true)
    expect(r.hoje).toBe('2026-02-10')
  })

  it('alvo de % Rec — média ponderada pela VT pró-rata dos meses COM alvo', () => {
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-02-28', ultimaVenda: '2026-03-01',
      metas: [
        { ano: 2026, mes: 1, valorMeta: 3100, pctReceita: 10 },
        { ano: 2026, mes: 2, valorMeta: 2800, pctReceita: 20 },
      ],
      serie: [],
    })
    // (3100·0,10 + 2800·0,20) / 5900 = 870/5900 = 14,7458%
    expect(r.pctReceitaAlvo).toBeCloseTo((870 / 5900) * 100, 4)
  })

  it('alvo de % Rec — mês sem alvo é EXCLUÍDO (não distorce)', () => {
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-02-28', ultimaVenda: '2026-03-01',
      metas: [
        { ano: 2026, mes: 1, valorMeta: 3100, pctReceita: 10 },
        { ano: 2026, mes: 2, valorMeta: 2800, pctReceita: null },
      ],
      serie: [],
    })
    expect(r.pctReceitaAlvo).toBeCloseTo(10, 6) // só janeiro conta
  })

  it('alvo de % Rec — nenhum mês com alvo → null', () => {
    const r = calcularRitmo({
      from: '2026-07-01', to: '2026-07-31', ultimaVenda: '2026-07-31',
      metas: [{ ano: 2026, mes: 7, valorMeta: 3100 }],
      serie: [],
    })
    expect(r.pctReceitaAlvo).toBeNull()
  })

  it('pctDecorrido — dias corridos até hoje / dias do período', () => {
    // Jul (31d), última venda 10/jul → 10/31 ≈ 32,26%
    const parcial = calcularRitmo({
      from: '2026-07-01', to: '2026-07-31', ultimaVenda: '2026-07-10',
      metas: [JUL(3100)], serie: [],
    })
    expect(parcial.pctDecorrido).toBeCloseTo((10 / 31) * 100, 4)
    // período fechado (última venda depois do fim) → 100%
    const fechado = calcularRitmo({
      from: '2026-07-01', to: '2026-07-31', ultimaVenda: '2026-08-15',
      metas: [JUL(3100)], serie: [],
    })
    expect(fechado.pctDecorrido).toBeCloseTo(100, 6)
  })

  it('esperado é LINEAR (meta × dias decorridos/dias período), não acúmulo mês-a-mês', () => {
    // Jan meta 3100 (≈100/dia) + Fev meta 5600 (≈200/dia); período Jan-Fev, hoje 14/fev.
    const r = calcularRitmo({
      from: '2026-01-01', to: '2026-02-28', ultimaVenda: '2026-02-14',
      metas: [
        { ano: 2026, mes: 1, valorMeta: 3100 },
        { ano: 2026, mes: 2, valorMeta: 5600 },
      ],
      serie: [],
    })
    // metaPeriodo = 8700; decorrido = 45/59 dias; esperado LINEAR = 8700·45/59 = 6635,59
    // (acúmulo mês-a-mês daria 3100 + 14·200 = 5900 — o teste trava o modelo linear).
    expect(r.metaPeriodo).toBeCloseTo(8700, 6)
    expect(r.esperadoAteHoje).toBeCloseTo((8700 * 45) / 59, 2)
    expect(r.esperadoAteHoje).not.toBeCloseTo(5900, 0)
    // o marcador do esperado cai sobre a linha de meta (rampa linear) no dia de hoje
    const hojePonto = r.pontos.find(p => p.data === '2026-02-14')
    expect(hojePonto?.metaAcum).toBeCloseTo(r.esperadoAteHoje, 2)
  })

  it('período FUTURO (última venda antes do início) — nada esperado, ritmo indefinido', () => {
    const r = calcularRitmo({
      from: '2026-08-01', to: '2026-08-31', ultimaVenda: '2026-07-06',
      metas: [{ ano: 2026, mes: 8, valorMeta: 3100 }],
      serie: [],
    })
    expect(r.realizado).toBe(0)
    expect(r.esperadoAteHoje).toBe(0)
    expect(r.ritmoPct).toBeNull()
    expect(r.status).toBeNull()
    expect(r.pctMeta).toBeCloseTo(0, 6)
  })
})

// ── CASO DE CONTRATO (v5.4.4) — agregado × diário ────────────────────────────
// Na mesma tela, o card de um SETOR calcula o ritmo com série diária e o card de um
// SUBSETOR sem ela (não existe série diária por subsetor em fonte nenhuma). Se as
// duas réguas de tempo divergirem, dois cards vizinhos mostram "% esperado"
// diferentes para o MESMO período — o erro que este projeto já pagou caro. Por isso
// `janelaDoPeriodo` é fatorada e compartilhada; este teste é o que impede alguém de
// "otimizar" uma das duas e desalinhá-las.
describe('calcularRitmoAgregado × calcularRitmo — mesma régua de tempo', () => {
  const CENARIOS: Array<{ nome: string; from: string; to: string; ultimaVenda: string | null; metas: MetaMensal[] }> = [
    {
      nome: 'mês em curso',
      from: '2026-08-01', to: '2026-08-31', ultimaVenda: '2026-08-13',
      metas: [{ ano: 2026, mes: 8, valorMeta: 3100, pctReceita: 14 }],
    },
    {
      nome: 'período fechado no passado',
      from: '2026-07-01', to: '2026-07-31', ultimaVenda: '2026-08-13',
      metas: [{ ano: 2026, mes: 7, valorMeta: 3100, pctReceita: 12 }],
    },
    {
      nome: 'trimestre com bordas parciais e alvo só em um mês',
      from: '2026-02-15', to: '2026-04-20', ultimaVenda: '2026-03-31',
      metas: [
        { ano: 2026, mes: 2, valorMeta: 2800, pctReceita: null },
        { ano: 2026, mes: 3, valorMeta: 3100, pctReceita: 20 },
        { ano: 2026, mes: 4, valorMeta: 3000, pctReceita: null },
      ],
    },
    {
      nome: 'sem venda carregada (ultimaVenda null → hoje = to)',
      from: '2026-05-01', to: '2026-05-31', ultimaVenda: null,
      metas: [{ ano: 2026, mes: 5, valorMeta: 3100, pctReceita: 14 }],
    },
  ]

  for (const c of CENARIOS) {
    it(`bate campo a campo — ${c.nome}`, () => {
      // A série é irrelevante para o que comparamos, mas o realizado tem de ser o
      // MESMO nos dois caminhos, senão pctMeta/ritmoPct/status divergem por dado, não
      // por régua. Série de 2 dias somando 500.
      const serie: PontoDia[] = [
        { data: c.from, valor: 200 },
        { data: c.to, valor: 300 },
      ]
      const realizadoDaSerie = 500

      const diario = calcularRitmo({ ...c, serie })
      const agregado = calcularRitmoAgregado({ ...c, realizado: realizadoDaSerie })

      expect(agregado.metaPeriodo).toBe(diario.metaPeriodo)
      expect(agregado.pctDecorrido).toBe(diario.pctDecorrido)
      expect(agregado.esperadoAteHoje).toBe(diario.esperadoAteHoje)
      expect(agregado.pctReceitaAlvo).toBe(diario.pctReceitaAlvo)
      expect(agregado.hoje).toBe(diario.hoje)
      expect(agregado.parcial).toBe(diario.parcial)
    })
  }

  it('com o mesmo realizado, os derivados também batem', () => {
    const base = { from: '2026-08-01', to: '2026-08-31', ultimaVenda: '2026-08-13' }
    const metas: MetaMensal[] = [{ ano: 2026, mes: 8, valorMeta: 3100, pctReceita: 14 }]
    const diario = calcularRitmo({ ...base, metas, serie: [{ data: '2026-08-05', valor: 1000 }] })
    const agregado = calcularRitmoAgregado({ ...base, metas, realizado: 1000 })

    expect(agregado.realizado).toBe(diario.realizado)
    expect(agregado.pctMeta).toBe(diario.pctMeta)
    expect(agregado.ritmoPct).toBe(diario.ritmoPct)
    expect(agregado.status).toBe(diario.status)
  })

  it('é AGNÓSTICO DE UNIDADE — serve para contagem de contratos', () => {
    // COMERCIAL: meta de 140 contratos no ano, 34 realizados até 13/08. Nada aqui
    // conhece "R$" — é a mesma função que governa a barra do card de contratos.
    const metas: MetaMensal[] = Array.from({ length: 12 }, (_, i) => ({
      ano: 2026, mes: i + 1, valorMeta: 10, pctReceita: null,
    }))
    const r = calcularRitmoAgregado({
      from: '2026-01-01', to: '2026-12-31', ultimaVenda: '2026-08-13', metas, realizado: 34,
    })
    expect(r.metaPeriodo).toBe(120)
    expect(r.realizado).toBe(34)
    expect(r.pctMeta).toBeCloseTo((34 / 120) * 100, 6)
    // Sem alvo de % Rec numa meta de contagem — o call-site ignora o campo.
    expect(r.pctReceitaAlvo).toBeNull()
  })

  it('não expõe `pontos` (não há série para acumular)', () => {
    const r = calcularRitmoAgregado({
      from: '2026-08-01', to: '2026-08-31', ultimaVenda: null,
      metas: [{ ano: 2026, mes: 8, valorMeta: 3100 }], realizado: 100,
    })
    expect('pontos' in r).toBe(false)
  })
})
