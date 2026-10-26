import { describe, expect, it } from 'vitest'
import { fixtureGeral } from './fixture'
import { emCentavos, pctDe } from './numeros'
import {
  ROTULO_SEM_NOME, avisoInadimplenteAVencer, faixasDeAtraso, funilDosRecebiveis, pontosSemanais,
  rotuloDemaisDevedores, rotuloHistoricoDesde, rotuloIntervaloSemana, rotuloMaiorAtraso, rotuloPosicao,
  semBase, tabelaDevedores,
} from './recebiveis'
import { recebiveisSchema, type Recebiveis } from './schemas'

const contagem = (n: number, valor: number) => ({ n, valor })

function recebiveis(over: Record<string, unknown> = {}): Recebiveis {
  return recebiveisSchema.parse({
    carga: { carga_id: 'c1', data_posicao: '2026-10-15', gravado_em: '2026-10-15T13:00:00-03:00' },
    em_aberto: contagem(4830, 12146832.84),
    vencido: contagem(182, 1029384.12),
    inadimplente: { n: 21, valor: 199767.74, faixas: [] },
    devedores: { top: [], demais: { devedores: 0, n: 0, valor: 0 } },
    referencia_semana: null,
    evolucao_semanal: [],
    historico_desde: null,
    ...over,
  })
}

describe('pctDe', () => {
  it('proporção em pontos percentuais; total zero → null (nunca Infinity/NaN)', () => {
    expect(pctDe(25, 100)).toBe(25)
    expect(pctDe(1, 0)).toBeNull()
    expect(pctDe(1, 0.001)).toBeNull()
    expect(pctDe(Number.NaN, 10)).toBeNull()
  })
})

describe('funilDosRecebiveis — os três cards', () => {
  const referencia = {
    data_posicao: '2026-10-08',
    em_aberto: contagem(4790, 11930500.2),
    vencido: contagem(170, 951200.55),
    inadimplente: contagem(19, 181420.3),
  }

  it('valor, n e as proporções do funil (vencido ÷ em aberto; inadimplente ÷ vencidos)', () => {
    const f = funilDosRecebiveis(recebiveis({ referencia_semana: referencia }))
    expect(f.emAberto).toMatchObject({ valor: 12146832.84, n: 4830 })
    expect(f.vencido).toMatchObject({ valor: 1029384.12, n: 182 })
    expect(f.inadimplente).toMatchObject({ valor: 199767.74, n: 21 })
    expect(f.vencido.pctDoEmAberto).toBeCloseTo((1029384.12 / 12146832.84) * 100, 8)
    expect(f.inadimplente.pctDosVencidos).toBeCloseTo((199767.74 / 1029384.12) * 100, 8)
  })

  it('Δ contra a referência da semana e a data da referência para o rótulo "vs DD/MM"', () => {
    const f = funilDosRecebiveis(recebiveis({ referencia_semana: referencia }))
    expect(f.referencia).toEqual({ dataPosicao: '2026-10-08', rotulo: 'vs 08/10' })
    expect(f.emAberto.delta.pct).toBeCloseTo(((12146832.84 - 11930500.2) / 11930500.2) * 100, 8)
    expect(f.inadimplente.delta.pct).toBeCloseTo(((199767.74 - 181420.3) / 181420.3) * 100, 8)
  })

  it('polaridade: em aberto sem juízo; vencido e inadimplente "menor é melhor" (subir = desfavorável)', () => {
    const f = funilDosRecebiveis(recebiveis({ referencia_semana: referencia }))
    expect(f.emAberto.delta.sentido).toBeNull()
    expect(f.vencido.delta.sentido).toBe('desfavoravel')
    expect(f.inadimplente.delta.sentido).toBe('desfavoravel')
    // e descendo, favorável
    const desceu = funilDosRecebiveis(recebiveis({
      referencia_semana: { ...referencia, inadimplente: contagem(30, 300000), vencido: contagem(200, 2000000) },
    }))
    expect(desceu.vencido.delta.sentido).toBe('favoravel')
    expect(desceu.inadimplente.delta.sentido).toBe('favoravel')
  })

  it('sem referência (referencia_semana null): sem Δ nem rótulo — nunca zero', () => {
    const f = funilDosRecebiveis(recebiveis({ referencia_semana: null }))
    expect(f.referencia).toBeNull()
    for (const c of [f.emAberto, f.vencido, f.inadimplente]) expect(c.delta).toEqual({ pct: null, sentido: null })
  })

  it('denominador zero → % null (sem Infinity/NaN)', () => {
    const f = funilDosRecebiveis(recebiveis({
      em_aberto: contagem(0, 0), vencido: contagem(0, 0), inadimplente: { n: 0, valor: 0, faixas: [] },
    }))
    expect(f.vencido.pctDoEmAberto).toBeNull()
    expect(f.inadimplente.pctDosVencidos).toBeNull()
  })

  it('referência com inadimplente zerado: Δ sem número (variação sobre zero é indefinida)', () => {
    const f = funilDosRecebiveis(recebiveis({ referencia_semana: { ...referencia, inadimplente: contagem(0, 0) } }))
    expect(f.inadimplente.delta).toEqual({ pct: null, sentido: null })
  })
})

describe('faixasDeAtraso — SOBRE OS INADIMPLENTES', () => {
  const inad = (faixas: { faixa: '1-30' | '31-60' | '61-90' | '90+' | 'nao_vencido'; n: number; valor: number }[], n: number, valor: number) =>
    recebiveis({ inadimplente: { n, valor, faixas } }).inadimplente

  it('as 4 faixas de atraso SEMPRE, na ordem, mesmo zeradas; sem "a vencer" quando não há', () => {
    const t = faixasDeAtraso(inad([{ faixa: '90+', n: 3, valor: 300 }, { faixa: '1-30', n: 1, valor: 100 }], 4, 400))
    expect(t.linhas.map(l => l.faixa)).toEqual(['1-30', '31-60', '61-90', '90+'])
    expect(t.linhas.map(l => l.n)).toEqual([1, 0, 0, 3])
    expect(t.linhas.map(l => l.pct)).toEqual([25, 0, 0, 75])
    expect(t.linhas[0].rotulo).toBe('1 a 30 dias')
    expect(t.linhas[3].rotulo).toBe('Mais de 90 dias')
  })

  it('"a vencer" só quando n > 0 (o título marcado e ainda não vencido do inv. 3) — entra como primeira linha', () => {
    const faixas = [
      { faixa: 'nao_vencido' as const, n: 0, valor: 0 }, { faixa: '90+' as const, n: 2, valor: 200 },
    ]
    expect(faixasDeAtraso(inad(faixas, 2, 200)).linhas.map(l => l.faixa)).toEqual(['1-30', '31-60', '61-90', '90+'])
    const com = faixasDeAtraso(inad([{ faixa: 'nao_vencido', n: 1, valor: 50 }, { faixa: '90+', n: 2, valor: 200 }], 3, 250))
    expect(com.linhas.map(l => l.faixa)).toEqual(['nao_vencido', '1-30', '31-60', '61-90', '90+'])
    expect(com.linhas[0].rotulo).toBe('A vencer')
    expect(com.fecha).toBe(true)
  })

  it('sem inadimplente: 4 zeradas, % null e total fechado (sem divisão por zero)', () => {
    const t = faixasDeAtraso(inad([], 0, 0))
    expect(t.linhas).toHaveLength(4)
    expect(t.linhas.every(l => l.n === 0 && l.valor === 0 && l.pct === null)).toBe(true)
    expect(t.total).toEqual({ n: 0, valor: 0, pct: null })
    expect(t.fecha).toBe(true)
  })

  it('Σ linhas ≡ inadimplente AO CENTAVO (em centavos inteiros) — com valores que dão dízima em float', () => {
    const faixas = [
      { faixa: '1-30' as const, n: 4, valor: 18432.15 },
      { faixa: '31-60' as const, n: 3, valor: 22610.48 },
      { faixa: '61-90' as const, n: 2, valor: 14985.3 },
      { faixa: '90+' as const, n: 12, valor: 143739.81 },
    ]
    const i = inad(faixas, 21, 199767.74)
    const t = faixasDeAtraso(i)
    expect(t.linhas.reduce((s, l) => s + emCentavos(l.valor), 0)).toBe(emCentavos(199767.74))
    expect(emCentavos(t.total.valor)).toBe(19976774)
    expect(t.total.n).toBe(21)
    expect(t.total.pct).toBeCloseTo(100, 8)
    expect(t.fecha).toBe(true)
  })

  it('NÃO fecha → fecha=false (1 centavo de diferença não passa)', () => {
    const t = faixasDeAtraso(inad([{ faixa: '90+', n: 2, valor: 199.99 }], 2, 200))
    expect(t.fecha).toBe(false)
    // e o nº de títulos também conta
    expect(faixasDeAtraso(inad([{ faixa: '90+', n: 1, valor: 200 }], 2, 200)).fecha).toBe(false)
  })
})

describe('avisoInadimplenteAVencer — inv. 3', () => {
  it('título marcado e ainda não vencido → {n, valor}; senão null', () => {
    const a = recebiveis({ inadimplente: { n: 3, valor: 250, faixas: [
      { faixa: 'nao_vencido', n: 1, valor: 50 }, { faixa: '90+', n: 2, valor: 200 },
    ] } }).inadimplente
    expect(avisoInadimplenteAVencer(a)).toEqual({ n: 1, valor: 50 })
    expect(avisoInadimplenteAVencer(recebiveis({ inadimplente: { n: 2, valor: 200, faixas: [
      { faixa: 'nao_vencido', n: 0, valor: 0 }, { faixa: '90+', n: 2, valor: 200 },
    ] } }).inadimplente)).toBeNull()
    expect(avisoInadimplenteAVencer(recebiveis().inadimplente)).toBeNull()
  })
})

describe('tabelaDevedores — top 10 por devedor + demais + total', () => {
  const dev = (valor: number, over: Record<string, unknown> = {}) =>
    ({ pessoa: 'Devedor X', n: 1, valor, maior_atraso: 30, ...over })

  it('posição 1..N, % sobre o TOTAL inadimplente (não sobre o top) e maior atraso', () => {
    const r = recebiveis({ devedores: {
      top: [dev(50, { pessoa: 'Devedor A', n: 2, maior_atraso: 142 }), dev(25, { pessoa: 'Devedor B' })],
      demais: { devedores: 0, n: 0, valor: 0 },
    } })
    const t = tabelaDevedores(r.devedores, { n: 3, valor: 100 })
    expect(t.linhas.map(l => l.posicao)).toEqual([1, 2])
    expect(t.linhas.map(l => l.pct)).toEqual([50, 25])
    expect(t.linhas[0]).toMatchObject({ devedor: 'Devedor A', semNome: false, n: 2, maiorAtraso: 142 })
  })

  it('devedor null vira "(sem nome)", VISÍVEL e contado (inv. 4)', () => {
    const r = recebiveis({ devedores: {
      top: [dev(80), dev(20, { pessoa: null })], demais: { devedores: 0, n: 0, valor: 0 },
    } })
    const t = tabelaDevedores(r.devedores, { n: 2, valor: 100 })
    expect(t.linhas[1]).toMatchObject({ devedor: ROTULO_SEM_NOME, semNome: true, valor: 20 })
    expect(ROTULO_SEM_NOME).toBe('(sem nome)')
    expect(t.fecha).toBe(true)
  })

  it('"demais N devedores" só quando houver; singular no 1; total = Σ top + demais', () => {
    const r = recebiveis({ devedores: {
      top: [dev(60)], demais: { devedores: 8, n: 9, valor: 40 },
    } })
    const t = tabelaDevedores(r.devedores, { n: 10, valor: 100 })
    expect(t.demais).toMatchObject({ devedores: 8, rotulo: 'demais 8 devedores', n: 9, valor: 40, pct: 40 })
    expect(t.total).toEqual({ n: 10, valor: 100, pct: 100 })
    expect(rotuloDemaisDevedores(1)).toBe('demais 1 devedor')
    const sem = tabelaDevedores(recebiveis({ devedores: { top: [dev(100)], demais: { devedores: 0, n: 0, valor: 0 } } }).devedores, { n: 1, valor: 100 })
    expect(sem.demais).toBeNull()
  })

  it('Σ top + demais ≡ inadimplente AO CENTAVO, com os números reais da M0 (21 títulos, 18 devedores)', () => {
    const top = [
      48210.6, 31875.25, 24100, 19320.4, 14780.95, 11250, 8640.3, 6420.15, 5105.8, 3890.45,
    ].map((v, i) => dev(v, { pessoa: `Devedor ${String.fromCharCode(65 + i)}`, n: i < 2 ? 2 : 1 }))
    const r = recebiveis({ devedores: { top, demais: { devedores: 8, n: 9, valor: 26173.84 } } })
    const t = tabelaDevedores(r.devedores, { n: 21, valor: 199767.74 })
    const somaCentavos = t.linhas.reduce((s, l) => s + emCentavos(l.valor), 0) + emCentavos(t.demais?.valor ?? 0)
    expect(somaCentavos).toBe(emCentavos(199767.74))
    expect(emCentavos(t.total.valor)).toBe(19976774)
    expect(t.total.n).toBe(21)
    expect(t.fecha).toBe(true)
  })

  it('não fecha → fecha=false; demais com devedores=0 mas valor não nulo entra no total (nada descartado)', () => {
    const r = recebiveis({ devedores: { top: [dev(60)], demais: { devedores: 0, n: 1, valor: 39.99 } } })
    const t = tabelaDevedores(r.devedores, { n: 2, valor: 100 })
    expect(t.demais).toBeNull()
    expect(emCentavos(t.total.valor)).toBe(emCentavos(99.99))
    expect(t.fecha).toBe(false)
  })

  it('sem inadimplente: tabela vazia, total zero, % null', () => {
    const t = tabelaDevedores(recebiveis().devedores, { n: 0, valor: 0 })
    expect(t).toEqual({ linhas: [], demais: null, total: { n: 0, valor: 0, pct: null }, fecha: true })
  })

  it('rótulo do maior atraso', () => {
    expect(rotuloMaiorAtraso(null)).toBe('—')
    expect(rotuloMaiorAtraso(-3)).toBe('a vencer')
    expect(rotuloMaiorAtraso(0)).toBe('a vencer')
    expect(rotuloMaiorAtraso(1)).toBe('1 dia')
    expect(rotuloMaiorAtraso(142)).toBe('142 dias')
  })
})

describe('pontosSemanais — segunda a domingo, lacuna é null, nunca zero', () => {
  const item = (semana: string, data_posicao: string, valor: number, n = 5, vencido = 1000) => ({
    semana, data_posicao, inadimplente_n: n, inadimplente_valor: valor, vencido_valor: vencido,
  })

  it('sem histórico → []', () => {
    expect(pontosSemanais(recebiveis({ historico_desde: null }), '2026-10-26')).toEqual([])
    // histórico nulo com item perdido: continua [] (a RPC não emite isso; a regra é a do contrato)
    expect(pontosSemanais(recebiveis({ historico_desde: null, evolucao_semanal: [] }), '2026-10-15')).toEqual([])
  })

  it('um ponto por segunda, da semana do histórico até a semana de hoje; semana sem item é LACUNA (null)', () => {
    const r = recebiveis({
      historico_desde: '2026-09-17', // quinta → semana de 14/09
      evolucao_semanal: [
        item('2026-09-14', '2026-09-17', 100, 3, 700),
        // semana de 21/09: sem carga
        item('2026-09-28', '2026-10-02', 300, 6, 900),
      ],
    })
    const p = pontosSemanais(r, '2026-10-02')
    expect(p.map(x => x.semana)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28'])
    expect(p.map(x => x.rotulo)).toEqual(['14/09', '21/09', '28/09'])
    expect(p.map(x => x.inadimplenteValor)).toEqual([100, null, 300])
    expect(p[1]).toMatchObject({
      lacuna: true, dataPosicao: null, inadimplenteN: null, vencidoValor: null, inadimplenteValor: null,
    })
    expect(p[0]).toMatchObject({ lacuna: false, dataPosicao: '2026-09-17', inadimplenteN: 3, vencidoValor: 700 })
    // lacuna NUNCA vira zero
    expect(p.some(x => x.lacuna && x.inadimplenteValor === 0)).toBe(false)
  })

  it('a semana de hoje é a ÚNICA marcada parcial — com e sem foto nela', () => {
    const r = recebiveis({
      historico_desde: '2026-10-15',
      evolucao_semanal: [item('2026-10-12', '2026-10-15', 199767.74)],
    })
    const sem = pontosSemanais(r, '2026-10-20') // terça de 19/10, ainda sem carga na semana
    expect(sem.map(x => x.parcial)).toEqual([false, true])
    expect(sem[1]).toMatchObject({ semana: '2026-10-19', lacuna: true })

    const com = pontosSemanais(r, '2026-10-15') // hoje cai na semana que já tem foto
    expect(com).toHaveLength(1)
    expect(com[0]).toMatchObject({ parcial: true, lacuna: false, inadimplenteValor: 199767.74 })
  })

  it('hoje numa SEGUNDA-feira: a semana parcial começa em hoje (26/10/2026)', () => {
    const r = recebiveis({ historico_desde: '2026-10-15', evolucao_semanal: [item('2026-10-12', '2026-10-15', 1)] })
    const p = pontosSemanais(r, '2026-10-26')
    expect(p.map(x => x.semana)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26'])
    expect(p.map(x => x.parcial)).toEqual([false, false, true])
    // domingo ainda é a semana anterior
    expect(pontosSemanais(r, '2026-10-25').at(-1)?.semana).toBe('2026-10-19')
  })

  it('TODA semana presente em evolucao_semanal aparece (nada vira lacuna falsa), mesmo fora do intervalo esperado', () => {
    const r = recebiveis({
      historico_desde: '2026-10-15',
      evolucao_semanal: [
        item('2026-10-05', '2026-10-08', 11), // antes do histórico_desde declarado
        item('2026-10-12', '2026-10-15', 22),
      ],
    })
    const p = pontosSemanais(r, '2026-10-15')
    expect(p.map(x => x.semana)).toEqual(['2026-10-05', '2026-10-12'])
    expect(p.map(x => x.inadimplenteValor)).toEqual([11, 22])
    // propriedade geral: cada item de entrada tem um ponto com o MESMO valor
    for (const e of r.evolucao_semanal) {
      expect(p.find(x => x.semana === e.semana)?.inadimplenteValor).toBe(e.inadimplente_valor)
    }
  })

  it('item cuja "semana" não é segunda (terça, 13/10) cai na semana certa — nunca vira lacuna falsa', () => {
    const r = recebiveis({
      historico_desde: '2026-10-15',
      evolucao_semanal: [item('2026-10-13', '2026-10-15', 77)],
    })
    const p = pontosSemanais(r, '2026-10-15')
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ semana: '2026-10-12', lacuna: false, inadimplenteValor: 77 })
  })

  it('atravessa a virada do ano e o dia 29/02 sem pular segunda', () => {
    const r = recebiveis({ historico_desde: '2025-12-30', evolucao_semanal: [] })
    expect(pontosSemanais(r, '2026-01-12').map(x => x.semana)).toEqual(['2025-12-29', '2026-01-05', '2026-01-12'])
    const bis = recebiveis({ historico_desde: '2024-02-26', evolucao_semanal: [] })
    expect(pontosSemanais(bis, '2024-03-11').map(x => x.semana)).toEqual(['2024-02-26', '2024-03-04', '2024-03-11'])
  })

  it('histórico depois de hoje e sem dado → []', () => {
    expect(pontosSemanais(recebiveis({ historico_desde: '2026-12-01' }), '2026-10-26')).toEqual([])
  })

  it('rótulo do intervalo da semana', () => {
    expect(rotuloIntervaloSemana('2026-10-12')).toBe('12/10 a 18/10')
    expect(rotuloIntervaloSemana('2026-12-28')).toBe('28/12 a 03/01')
  })
})

describe('rótulos', () => {
  it('posição "na carga de DD/MM" e histórico desde', () => {
    expect(rotuloPosicao('2026-10-15')).toBe('na carga de 15/10')
    expect(rotuloHistoricoDesde('2026-09-25')).toBe('histórico desde 25/09/2026')
    expect(rotuloHistoricoDesde(null)).toBeNull()
  })
})

describe('contrato: o retorno SEM BASE passa no schema e é lido como sem base', () => {
  const semCarga = {
    carga: null,
    em_aberto: contagem(0, 0),
    vencido: contagem(0, 0),
    inadimplente: { n: 0, valor: 0, faixas: [] },
    devedores: { top: [], demais: { devedores: 0, n: 0, valor: 0 } },
    referencia_semana: null,
    evolucao_semanal: [],
    historico_desde: null,
  }
  it('arrays vazios e arrays NULL (jsonb_agg de vazio) viram []', () => {
    const r = recebiveisSchema.parse(semCarga)
    expect(semBase(r)).toBe(true)
    const comNulls = recebiveisSchema.parse({
      ...semCarga,
      inadimplente: { n: 0, valor: 0, faixas: null },
      devedores: { top: null, demais: { devedores: 0, n: 0, valor: 0 } },
      evolucao_semanal: null,
    })
    expect(comNulls.inadimplente.faixas).toEqual([])
    expect(comNulls.devedores.top).toEqual([])
    expect(comNulls.evolucao_semanal).toEqual([])
  })
  it('chave que SOME é drift e reprova (referencia_semana, devedores)', () => {
    for (const chave of ['referencia_semana', 'devedores', 'em_aberto', 'vencido']) {
      const semChave: Record<string, unknown> = { ...semCarga }
      delete semChave[chave]
      expect(recebiveisSchema.safeParse(semChave).success, chave).toBe(false)
    }
  })
  it('faixa fora do domínio reprova; maior_atraso null passa', () => {
    expect(recebiveisSchema.safeParse({
      ...semCarga, inadimplente: { n: 1, valor: 1, faixas: [{ faixa: '5-10', n: 1, valor: 1 }] },
    }).success).toBe(false)
    expect(recebiveisSchema.safeParse({
      ...semCarga, devedores: { top: [{ pessoa: null, n: 1, valor: 1, maior_atraso: null }], demais: { devedores: 0, n: 0, valor: 0 } },
    }).success).toBe(true)
  })
})

describe('a fixture normal alimenta o funil e as tabelas', () => {
  it('as completudes valem sobre o dado de demonstração', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    if (!d.recebiveis.ok) throw new Error('fixture sem recebíveis')
    const r = d.recebiveis.dados
    expect(faixasDeAtraso(r.inadimplente).fecha).toBe(true)
    expect(tabelaDevedores(r.devedores, r.inadimplente).fecha).toBe(true)
  })
})
