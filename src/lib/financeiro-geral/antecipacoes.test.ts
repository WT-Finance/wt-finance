import { describe, expect, it } from 'vitest'
import {
  comparativoPorConta, contasDosAnos, custoDoRecorte, custoPorAno, deltaPontos, diasEntre, diasSemAntecipacao,
  diasSemAntecipar, fmtCustoPct, fmtPontos, rotuloDias,
} from './antecipacoes'
import { fixtureGeral } from './fixture'
import { emCentavos } from './numeros'
import { antecipacoesSchema, type Antecipacoes } from './schemas'
import type { LeituraAno } from './tipos'

const mes = (volume = 0, desconto = 0, n = 0) => ({ volume, liquido: volume - desconto, desconto, n })

const CONTAS = [
  { conta: 'Asaas', volume: 700, desconto: 20, n: 3 },
  { conta: 'Blimboo', volume: 300, desconto: 10, n: 1 },
]

/** Um ano de antecipação. O `desconto_pct` da RPC é PROPOSITALMENTE errado (99): nenhum card pode lê-lo. */
function ant(ano: number, over: Record<string, unknown> = {}): Antecipacoes {
  return antecipacoesSchema.parse({
    ano,
    relacao: ano === 2026 ? 'corrente' : 'fechado',
    mes_corrente: ano === 2026 ? 10 : null,
    meses: [mes(1000, 30, 4), ...Array.from({ length: 11 }, () => mes())],
    total: { volume: 1000, liquido: 970, desconto: 30, n: 4, desconto_pct: 99 },
    ano_anterior_ytd: { volume: 800, desconto: 32, n: 3 },
    por_conta: CONTAS,
    ultima_data: '2026-09-21',
    dias_desde_ultima: 35,
    maior_intervalo_ano: { dias: 117, de: '2026-05-27', ate: '2026-09-21' },
    atualizado_em: '2026-10-15T10:00:00-03:00',
    ...over,
  })
}
const ok = (ano: number, over?: Record<string, unknown>): LeituraAno<Antecipacoes> =>
  ({ ano, leitura: { ok: true, dados: ant(ano, over) } })
const falha = (ano: number): LeituraAno<Antecipacoes> => ({ ano, leitura: { ok: false } })

describe('diasEntre / rotuloDias', () => {
  it('calendário puro, sem fuso nem horário de verão', () => {
    expect(diasEntre('2026-10-05', '2026-10-15')).toBe(10)
    expect(diasEntre('2026-02-27', '2026-03-01')).toBe(2)
    expect(diasEntre('2025-12-31', '2026-01-01')).toBe(1)
    expect(diasEntre('2026-10-15', '2026-10-15')).toBe(0)
  })
  it('pluraliza', () => {
    expect(rotuloDias(0)).toBe('hoje')
    expect(rotuloDias(1)).toBe('1 dia')
    expect(rotuloDias(12)).toBe('12 dias')
  })
})

// ── A fórmula única ────────────────────────────────────────────────────────────────────────────

describe('custoDoRecorte — a ÚNICA fórmula (inv. 2)', () => {
  it('efetivo = desconto; pct = desconto ÷ volume', () => {
    const c = custoDoRecorte({ volume: 1000, desconto: 30 })
    expect(c.efetivo).toBe(30)
    expect(c.pct).toBeCloseTo(3, 10)
  })
  it('volume zero → pct null (nunca Infinity/NaN) e efetivo zero', () => {
    expect(custoDoRecorte({ volume: 0, desconto: 0 })).toEqual({ efetivo: 0, pct: null })
  })
  it('é média PONDERADA pelo volume: a média simples das taxas daria OUTRO número', () => {
    const a = { volume: 100, desconto: 10 } // 10%
    const b = { volume: 900, desconto: 9 } // 1%
    const simples = (custoDoRecorte(a).pct! + custoDoRecorte(b).pct!) / 2
    const ponderada = custoDoRecorte({ volume: a.volume + b.volume, desconto: a.desconto + b.desconto }).pct!
    expect(simples).toBeCloseTo(5.5, 10)
    expect(ponderada).toBeCloseTo(1.9, 10)
    expect(ponderada).not.toBeCloseTo(simples, 1)
  })
  it('formatadores: 2 casas, travessão, sinal tipográfico', () => {
    expect(fmtCustoPct(2.3342)).toBe('2,33%')
    expect(fmtCustoPct(null)).toBe('—')
    expect(fmtCustoPct(0)).toBe('0,00%')
    expect(fmtPontos(-0.2671)).toBe('−0,27 p.p.')
    expect(fmtPontos(0.5)).toBe('+0,50 p.p.')
    expect(fmtPontos(0.001)).toBe('0,00 p.p.')
    expect(fmtPontos(-0.001)).toBe('0,00 p.p.')
    expect(fmtPontos(null)).toBe('—')
  })
})

describe('deltaPontos — subtração de taxas, não Δ relativo', () => {
  it('pp = atual − anterior; menor-melhor: baixou = favorável', () => {
    const d = deltaPontos(2.6013, 2.3342, 'menor-melhor')
    expect(d.pp).toBeCloseTo(-0.2671, 4)
    expect(d.sentido).toBe('favoravel')
    expect(deltaPontos(2.3, 2.6, 'menor-melhor').sentido).toBe('desfavoravel')
  })
  it('"estável" quando arredonda a 0,00 p.p.; sem-juízo sem sentido', () => {
    expect(deltaPontos(2.3, 2.301, 'menor-melhor').sentido).toBe('neutro')
    expect(deltaPontos(2.3, 2.9, 'sem-juizo')).toEqual({ pp: expect.closeTo(0.6, 10), sentido: null })
  })
  it('falta um dos lados → sem Δ', () => {
    expect(deltaPontos(null, 2, 'menor-melhor')).toEqual({ pp: null, sentido: null })
    expect(deltaPontos(2, undefined, 'menor-melhor')).toEqual({ pp: null, sentido: null })
  })
})

// ── Cards de custo ─────────────────────────────────────────────────────────────────────────────

describe('custoPorAno — uma linha por ano selecionado (cards de custo efetivo e percentual)', () => {
  it('do mais recente ao mais antigo, "*" no parcial, sem marca de ano corrente (todas as linhas iguais)', () => {
    const r = custoPorAno([ok(2024), ok(2026), ok(2025)])
    expect(r.linhas.map(l => l.ano)).toEqual([2026, 2025, 2024])
    expect(r.linhas.map(l => l.rotulo)).toEqual(['2026*', '2025', '2024'])
    expect(r.linhas.every(l => !('corrente' in l))).toBe(true)
    expect(r.anosFalha).toEqual([])
  })

  it('uma linha mesmo com um ano só', () => {
    expect(custoPorAno([ok(2025)]).linhas).toHaveLength(1)
  })

  it('o custo vem de custoDoRecorte sobre o total — NUNCA do desconto_pct da RPC (que aqui é 99)', () => {
    const [l] = custoPorAno([ok(2026)]).linhas
    expect(l.custo).toEqual(custoDoRecorte({ volume: 1000, desconto: 30 }))
    expect(l.custo.pct).toBeCloseTo(3, 10)
    expect(l.custo.efetivo).toBe(30)
  })

  it('Δ contra o MESMO PERÍODO do ano anterior (ano_anterior_ytd), com a referência no recorte', () => {
    const [corrente, fechado] = custoPorAno([ok(2026), ok(2025)]).linhas
    // `*` no ano anterior = o mesmo período do ano parcial; ano inteiro compara com o inteiro, sem `*`
    expect(corrente.referencia).toBe('vs 2025*')
    expect(fechado.referencia).toBe('vs 2024')
    // efetivo: 32 → 30 = −6,25%; menor é melhor → favorável
    expect(corrente.deltaEfetivo.pct).toBeCloseTo(-6.25, 10)
    expect(corrente.deltaEfetivo.sentido).toBe('favoravel')
    // pct: 4,0% (32/800) → 3,0% (30/1000) = −1,00 p.p. — EM PONTOS, não −25%
    expect(corrente.deltaPct.pp).toBeCloseTo(-1, 10)
    expect(corrente.deltaPct.sentido).toBe('favoravel')
  })

  it('o pct anterior sai da MESMA fórmula (volume e desconto do ytd); ytd com volume zero → sem Δ pp', () => {
    const r = custoPorAno([
      ok(2026, { ano_anterior_ytd: { volume: 0, desconto: 0, n: 0 } }),
      ok(2025, { ano_anterior_ytd: { volume: null, desconto: null, n: null } }),
      ok(2024, { ano_anterior_ytd: null }),
    ]).linhas
    for (const l of r) {
      expect(l.deltaPct).toEqual({ pp: null, sentido: null })
      expect(l.deltaEfetivo).toEqual({ pct: null, sentido: null })
    }
  })

  it('custo subiu → desfavorável (o desconto é POSITIVO: subir é ruim)', () => {
    const [l] = custoPorAno([ok(2026, { total: { volume: 1000, liquido: 940, desconto: 60, n: 4, desconto_pct: null } })]).linhas
    expect(l.deltaEfetivo.sentido).toBe('desfavoravel')
    expect(l.deltaPct.sentido).toBe('desfavoravel')
  })

  it('ano sem antecipação (n = 0): marcado, sem Δ — ausência não é zero', () => {
    const [l] = custoPorAno([ok(2026, {
      total: { volume: 0, liquido: 0, desconto: 0, n: 0, desconto_pct: null },
      ano_anterior_ytd: { volume: 800, desconto: 32, n: 3 },
    })]).linhas
    expect(l.semAntecipacao).toBe(true)
    expect(l.custo).toEqual({ efetivo: 0, pct: null })
    expect(l.deltaEfetivo.pct).toBeNull()
    expect(l.deltaPct.pp).toBeNull()
  })

  it('ano que falhou: fora das linhas e em anosFalha (a UI avisa; os outros seguem)', () => {
    const r = custoPorAno([ok(2025), falha(2026)])
    expect(r.linhas.map(l => l.ano)).toEqual([2025])
    expect(r.anosFalha).toEqual([2026])
    expect(custoPorAno([falha(2025), falha(2026)])).toEqual({ linhas: [], anosFalha: [2025, 2026] })
  })
})

// ── Dias sem antecipação ───────────────────────────────────────────────────────────────────────

describe('diasSemAntecipar — dias desde a última antecipação', () => {
  it('usa o número da RPC (hoje de SP calculado no banco)', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: 10, ultima_data: '2026-10-05' }, '2026-12-31')).toBe(10)
  })
  it('sem o número, deriva da última data e do hoje do servidor', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: '2026-10-05' }, '2026-10-15')).toBe(10)
  })
  it('nunca houve antecipação → null (não zero: zero seria "antecipou hoje")', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: null }, '2026-10-15')).toBeNull()
  })
  it('nunca negativo', () => {
    expect(diasSemAntecipar({ dias_desde_ultima: -2, ultima_data: null }, '2026-10-15')).toBe(0)
    expect(diasSemAntecipar({ dias_desde_ultima: null, ultima_data: '2026-10-20' }, '2026-10-15')).toBe(0)
  })
})

describe('diasSemAntecipacao — o card global (não depende das pills)', () => {
  it('dias, data da última e o maior intervalo do ano CORRENTE', () => {
    const r = diasSemAntecipacao([ok(2025), ok(2026)], '2026-10-26')
    expect(r).toEqual({
      estado: 'ok', dias: 35, ultimaData: '2026-09-21',
      maiorIntervalo: { dias: 117, de: '2026-05-27', ate: '2026-09-21' }, anoDoMaiorIntervalo: 2026,
    })
  })

  it('só um ano passado selecionado: os dias valem (a última é global), o maior intervalo é null (sem leitura do corrente)', () => {
    const r = diasSemAntecipacao([ok(2024, { maior_intervalo_ano: { dias: 70, de: '2024-07-10', ate: '2024-09-18' } })], '2026-10-26')
    expect(r.estado).toBe('ok')
    expect(r.dias).toBe(35)
    expect(r.ultimaData).toBe('2026-09-21')
    expect(r.maiorIntervalo).toBeNull()
    expect(r.anoDoMaiorIntervalo).toBeNull()
  })

  it('leitura do ano corrente FALHOU: dias seguem (de outra leitura), maior intervalo = null', () => {
    const r = diasSemAntecipacao([ok(2025), falha(2026)], '2026-10-26')
    expect(r).toMatchObject({ estado: 'ok', dias: 35, maiorIntervalo: null, anoDoMaiorIntervalo: null })
  })

  it('o maior intervalo do corrente pode ser null (sem antecipação no ano) sem derrubar o card', () => {
    const r = diasSemAntecipacao([ok(2026, { maior_intervalo_ano: null })], '2026-10-26')
    expect(r).toMatchObject({ estado: 'ok', dias: 35, maiorIntervalo: null, anoDoMaiorIntervalo: null })
  })

  it('nenhuma leitura carregou → erro; carregou mas nunca houve antecipação → sem-registro', () => {
    expect(diasSemAntecipacao([falha(2025), falha(2026)], '2026-10-26')).toEqual({
      estado: 'erro', dias: null, ultimaData: null, maiorIntervalo: null, anoDoMaiorIntervalo: null,
    })
    expect(diasSemAntecipacao([], '2026-10-26').estado).toBe('erro')
    const sem = diasSemAntecipacao([ok(2026, { ultima_data: null, dias_desde_ultima: null, maior_intervalo_ano: null })], '2026-10-26')
    expect(sem).toMatchObject({ estado: 'sem-registro', dias: null, ultimaData: null })
  })

  it('leituras divergentes: vale a de última data mais recente', () => {
    const r = diasSemAntecipacao([
      ok(2025, { ultima_data: '2026-08-01', dias_desde_ultima: 86 }),
      ok(2026, { ultima_data: '2026-09-21', dias_desde_ultima: 35 }),
    ], '2026-10-26')
    expect(r).toMatchObject({ dias: 35, ultimaData: '2026-09-21' })
  })
})

// ── Por conta ──────────────────────────────────────────────────────────────────────────────────

describe('comparativoPorConta — conta × ano com volume, custo efetivo e custo %, MESMA fórmula dos cards', () => {
  const diverso = (ano: number) => ok(ano, {
    total: { volume: 1000, liquido: 981, desconto: 19, n: 4, desconto_pct: null },
    por_conta: [{ conta: 'Asaas', volume: 100, desconto: 10, n: 1 }, { conta: 'Blimboo', volume: 900, desconto: 9, n: 3 }],
  })

  it('anos em ordem CRESCENTE (colunas), contas na ordem do volume, célula por custoDoRecorte', () => {
    const c = comparativoPorConta([diverso(2026), diverso(2025)])
    expect(c.anos.map(a => a.rotulo)).toEqual(['2025', '2026*'])
    expect(c.linhas.map(l => l.conta)).toEqual(['Blimboo', 'Asaas'])
    const asaas = c.linhas.find(l => l.conta === 'Asaas')!
    expect(asaas.celulas.map(x => x.ano)).toEqual([2025, 2026])
    expect(asaas.celulas[0].volume).toBe(100)
    expect(asaas.celulas[0].custo).toEqual(custoDoRecorte({ volume: 100, desconto: 10 }))
    expect(asaas.celulas[0].custo?.pct).toBeCloseTo(10, 10)
    expect(asaas.celulas[0].custo?.efetivo).toBe(10)
  })

  it('soma a mesma conta entre os anos na ordenação: a de maior volume somado vem primeiro', () => {
    const c = comparativoPorConta([
      ok(2025),
      ok(2026, {
        total: { volume: 1000, liquido: 970, desconto: 30, n: 4, desconto_pct: null },
        por_conta: [{ conta: 'Asaas', volume: 100, desconto: 3, n: 1 }, { conta: 'Blimboo', volume: 900, desconto: 27, n: 3 }],
      }),
    ])
    // Asaas 700 + 100 = 800; Blimboo 300 + 900 = 1200
    expect(c.linhas.map(l => l.conta)).toEqual(['Blimboo', 'Asaas'])
  })

  it('Σ por conta ≡ total do registro AO CENTAVO, ano a ano (volume, desconto, títulos)', () => {
    const c = comparativoPorConta([
      ok(2025, {
        total: { volume: 0.3, liquido: 0.3, desconto: 0, n: 2, desconto_pct: null },
        por_conta: [{ conta: 'A', volume: 0.1, desconto: 0, n: 1 }, { conta: 'B', volume: 0.2, desconto: 0, n: 1 }],
      }),
      ok(2026, {
        total: { volume: 1234.57, liquido: 1234.57, desconto: 0, n: 2, desconto_pct: null },
        por_conta: [{ conta: 'A', volume: 1000.01, desconto: 0, n: 1 }, { conta: 'B', volume: 234.56, desconto: 0, n: 1 }],
      }),
    ])
    for (let i = 0; i < c.anos.length; i++) {
      const somaContas = c.linhas.reduce((s, l) => s + emCentavos(l.celulas[i].volume ?? 0), 0)
      expect(somaContas).toBe(emCentavos(c.total[i].volume ?? 0))
    }
    expect(c.total.map(t => t.volume)).toEqual([0.3, 1234.57])
    expect(c.fecha).toBe(true)
  })

  it('não fecha → fecha=false (volume, desconto ou títulos divergentes em QUALQUER ano)', () => {
    expect(comparativoPorConta([ok(2026, { por_conta: [{ conta: 'Asaas', volume: 999.99, desconto: 30, n: 4 }] })]).fecha).toBe(false)
    expect(comparativoPorConta([ok(2025), ok(2026, { por_conta: [{ conta: 'Asaas', volume: 1000, desconto: 29.99, n: 4 }] })]).fecha).toBe(false)
    expect(comparativoPorConta([ok(2026, { por_conta: [{ conta: 'Asaas', volume: 1000, desconto: 30, n: 3 }] })]).fecha).toBe(false)
  })

  it('sem conta nenhuma: sem linhas, total "ausente", fecha', () => {
    const c = comparativoPorConta([ok(2026, { por_conta: null, total: { volume: 0, liquido: 0, desconto: 0, n: 0, desconto_pct: null } })])
    expect(c.linhas).toEqual([])
    expect(c.total).toEqual([{ ano: 2026, volume: null, custo: null }])
    expect(c.fecha).toBe(true)
  })

  it('o total do ano usa a MESMA função e é a média PONDERADA (1,9%), não a simples das contas (5,5%)', () => {
    const c = comparativoPorConta([diverso(2026)])
    expect(c.total[0].custo?.pct).toBeCloseTo(1.9, 10)
    const taxas = c.linhas.map(l => l.celulas[0].custo!.pct!)
    expect(taxas.reduce((s, t) => s + t, 0) / taxas.length).toBeCloseTo(5.5, 10)
  })

  it('cards e comparativo concordam no custo do ano (um único módulo, inv. 2)', () => {
    const leituras = [diverso(2025), diverso(2026)]
    const cards = custoPorAno(leituras).linhas
    const comp = comparativoPorConta(leituras)
    for (const cel of comp.total) {
      expect(cel.custo).toEqual(cards.find(l => l.ano === cel.ano)!.custo)
    }
  })

  it('conta sem antecipação num ano → célula null ("—"), não custo zero', () => {
    const c = comparativoPorConta([
      diverso(2025),
      ok(2026, {
        total: { volume: 100, liquido: 90, desconto: 10, n: 1, desconto_pct: null },
        por_conta: [{ conta: 'Asaas', volume: 100, desconto: 10, n: 1 }],
      }),
    ])
    const blimboo = c.linhas.find(l => l.conta === 'Blimboo')!
    expect(blimboo.celulas.map(x => x.custo === null)).toEqual([false, true])
    expect(blimboo.celulas.map(x => x.volume)).toEqual([900, null])
  })

  it('ano que falhou: fora das colunas e em anosFalha', () => {
    const c = comparativoPorConta([diverso(2025), falha(2026)])
    expect(c.anos.map(a => a.ano)).toEqual([2025])
    expect(c.anosFalha).toEqual([2026])
    expect(comparativoPorConta([falha(2026)])).toEqual({ anos: [], linhas: [], total: [], anosFalha: [2026], fecha: true })
  })
})

describe('contasDosAnos', () => {
  it('união das contas dos anos, em ordem alfabética', () => {
    expect(contasDosAnos([ant(2026), ant(2025, { por_conta: [{ conta: 'Zeta', volume: 1, desconto: 0, n: 1 }] })]))
      .toEqual(['Asaas', 'Blimboo', 'Zeta'])
    expect(contasDosAnos([])).toEqual([])
  })
})

describe('schema: ano sem antecipação (arrays NULL, datas NULL) passa', () => {
  it('estado vazio do ano', () => {
    const r = antecipacoesSchema.safeParse({
      ano: 2027, relacao: 'futuro', mes_corrente: null,
      meses: Array.from({ length: 12 }, () => mes()),
      total: { volume: 0, liquido: 0, desconto: 0, n: 0, desconto_pct: null },
      por_conta: null, ultima_data: null, dias_desde_ultima: null, maior_intervalo_ano: null, atualizado_em: null,
    })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.por_conta).toEqual([])
  })
  it('meses com menos de 12 posições reprova', () => {
    expect(antecipacoesSchema.safeParse({ ...ant(2026), meses: [mes()] }).success).toBe(false)
  })
})

// ── A fixture, com os números da M0 ────────────────────────────────────────────────────────────

describe('a fixture normal reproduz a M0 e fecha as contas das antecipações (inv. 2)', () => {
  const d = fixtureGeral('normal', '2026-10-26', [2024, 2025, 2026])

  it('Σ por conta ≡ Σ série mensal ≡ total.volume, ano a ano', () => {
    for (const x of d.antecipacoes) {
      if (!x.leitura.ok) throw new Error('fixture com ano em erro')
      const l = x.leitura.dados
      const serie = l.meses.reduce((s, m) => s + emCentavos(m.volume), 0)
      const contas = l.por_conta.reduce((s, c) => s + emCentavos(c.volume), 0)
      expect(serie).toBe(emCentavos(l.total.volume))
      expect(contas).toBe(emCentavos(l.total.volume))
      expect(l.meses.reduce((s, m) => s + m.n, 0)).toBe(l.total.n)
    }
    const t = comparativoPorConta(d.antecipacoes)
    expect(t.fecha).toBe(true)
    // Σ dos 3 anos, em centavos: total, Asaas e Blimboo (M0)
    const soma = (cs: { volume: number | null }[]) => cs.reduce((s, c) => s + emCentavos(c.volume ?? 0), 0)
    expect(soma(t.total)).toBe(emCentavos(7245412.45))
    const asaas = t.linhas.find(l => l.conta === 'Asaas')!
    const blimboo = t.linhas.find(l => l.conta === 'Blimboo')!
    expect(soma(asaas.celulas)).toBe(emCentavos(3688686.34))
    expect(soma(blimboo.celulas)).toBe(emCentavos(3556726.11))
  })

  it('custo % ponderado de cada ano = o da M0', () => {
    const linhas = custoPorAno(d.antecipacoes).linhas
    const pct = Object.fromEntries(linhas.map(l => [l.ano, l.custo.pct]))
    expect(pct[2024]).toBeCloseTo(2.8898, 4)
    expect(pct[2025]).toBeCloseTo(2.6013, 4)
    expect(pct[2026]).toBeCloseTo(2.3342, 4)
  })

  it('35 dias sem antecipação e maior intervalo de 2026 = 117 dias (M0)', () => {
    expect(diasSemAntecipacao(d.antecipacoes, d.hoje)).toMatchObject({
      estado: 'ok', dias: 35, ultimaData: '2026-09-21',
      maiorIntervalo: { dias: 117 }, anoDoMaiorIntervalo: 2026,
    })
  })
})
