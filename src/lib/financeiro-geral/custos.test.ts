import { describe, expect, it } from 'vitest'
import { comporTabelaCustos, pctCustosSobreRb, variacaoCustos } from './custos'
import { custosFinanceirosSchema, type CustosFinanceiros } from './schemas'
import type { LeituraAno } from './tipos'

/** 12 meses com o total no 1º (o que importa aqui é o TOTAL do ano, não a distribuição). */
const meses = (total: number) => [total, ...Array.from({ length: 11 }, () => 0)]
const serie = (total: number) => ({ meses: meses(total), total })

const grupo = (g: string, tipo: 'custo' | 'outros', total: number, cats: [number, string, number][] = []) => ({
  grupo: g, tipo, meses: meses(total), total,
  categorias: cats.map(([id, rotulo, t]) => ({ categoria_id: id, rotulo, meses: meses(t), total: t })),
})

function custos(ano: number, over: Record<string, unknown> = {}): CustosFinanceiros {
  const grupos = [
    grupo('cartao', 'custo', -100, [[1, 'Taxa do Cartão de Crédito/Débito', -100]]),
    grupo('antecipacao', 'custo', -40, [[2, 'Taxa de Antecipação', -40]]),
    grupo('juros_iof', 'custo', -30, [[3, 'Juros e Multa', -20], [4, 'IOF', -10]]),
    grupo('tarifas', 'custo', -10),
    grupo('cambio', 'outros', 5),
    grupo('receitas_financeiras', 'outros', 25),
  ]
  return custosFinanceirosSchema.parse({
    ano, relacao: ano === 2026 ? 'corrente' : 'fechado', mes_corrente: ano === 2026 ? 10 : null,
    grupos,
    custos: serie(-180),
    fin: serie(-150),
    receita_bruta: serie(9000),
    ano_anterior_ytd: { custos: -120, fin: -90, receita_bruta: 8000 },
    atualizado_em: '2026-10-15T10:00:00-03:00',
    ...over,
  })
}

const ok = (ano: number, over?: Record<string, unknown>): LeituraAno<CustosFinanceiros> =>
  ({ ano, leitura: { ok: true, dados: custos(ano, over) } })
const falha = (ano: number): LeituraAno<CustosFinanceiros> => ({ ano, leitura: { ok: false } })

describe('comporTabelaCustos — grupos × ano fechando no FIN', () => {
  it('ordem: custos (Cartão, Antecipação, Juros e IOF, Tarifas), subtotal, Câmbio, Receitas, Resultado', () => {
    const t = comporTabelaCustos([ok(2025)])
    expect(t.linhas.map(l => l.rotulo)).toEqual([
      'Cartão', 'Antecipação', 'Juros e IOF', 'Tarifas', 'Custos financeiros',
      'Câmbio', 'Receitas financeiras', 'Resultado financeiro',
    ])
    expect(t.linhas.map(l => l.tipo)).toEqual([
      'grupo', 'grupo', 'grupo', 'grupo', 'subtotal', 'grupo', 'grupo', 'resultado',
    ])
  })

  it('fecha: custos + câmbio + receitas = Resultado financeiro (= bloco FIN), sem divergência', () => {
    const t = comporTabelaCustos([ok(2025)])
    const v = (rot: string) => t.linhas.find(l => l.rotulo === rot)!.celulas[0].total!
    expect(v('Custos financeiros') + v('Câmbio') + v('Receitas financeiras')).toBeCloseTo(v('Resultado financeiro'), 2)
    expect(t.divergencias).toEqual([])
  })

  it('% da RB do mesmo ano, no sinal da DRE (custo negativo sobre RB positiva)', () => {
    const t = comporTabelaCustos([ok(2025)])
    const cartao = t.linhas[0].celulas[0]
    expect(cartao.total).toBe(-100)
    expect(cartao.pctRb).toBeCloseTo((-100 / 9000) * 100, 6)
    expect(pctCustosSobreRb(custos(2025))).toBeCloseTo((-180 / 9000) * 100, 6)
  })

  it('RB zero → % nulo, nunca Infinity', () => {
    const t = comporTabelaCustos([ok(2025, { receita_bruta: serie(0) })])
    expect(t.linhas[0].celulas[0].pctRb).toBeNull()
    expect(pctCustosSobreRb(custos(2025, { receita_bruta: serie(0) }))).toBeNull()
  })

  it('categorias do grupo vêm junto (para conferir contra a DRE) e somam o grupo', () => {
    const t = comporTabelaCustos([ok(2025)])
    const juros = t.linhas.find(l => l.rotulo === 'Juros e IOF')!
    expect(juros.categorias.map(c => c.rotulo)).toEqual(['Juros e Multa', 'IOF'])
    expect(juros.categorias.reduce((s, c) => s + c.celulas[0].total!, 0)).toBe(juros.celulas[0].total)
  })

  it('multi-ano: uma célula por ano, anos em ordem crescente, "*" no ano parcial', () => {
    const t = comporTabelaCustos([ok(2026), ok(2025)])
    expect(t.anos.map(a => a.rotulo)).toEqual(['2025', '2026*'])
    expect(t.linhas[0].celulas.map(c => c.ano)).toEqual([2025, 2026])
  })

  it('ano que falhou vira coluna com "—" (null), sem derrubar os outros', () => {
    const t = comporTabelaCustos([ok(2025), falha(2026)])
    expect(t.anos.map(a => [a.ano, a.falhou])).toEqual([[2025, false], [2026, true]])
    for (const l of t.linhas) {
      expect(l.celulas[0].total).not.toBeNull()
      expect(l.celulas[1]).toEqual({ ano: 2026, total: null, pctRb: null })
    }
  })

  it('grupo que um ano não tem é ZERO real nesse ano (ano carregado), não ausência', () => {
    const semTarifas = ok(2025, { grupos: [
      grupo('cartao', 'custo', -100), grupo('antecipacao', 'custo', -40), grupo('juros_iof', 'custo', -30),
      grupo('cambio', 'outros', 5), grupo('receitas_financeiras', 'outros', 25),
    ], custos: serie(-170), fin: serie(-140) })
    const t = comporTabelaCustos([semTarifas, ok(2026)])
    const tarifas = t.linhas.find(l => l.rotulo === 'Tarifas')!
    expect(tarifas.celulas.map(c => c.total)).toEqual([0, -10])
  })

  it('bandeja "Não classificado" é VISÍVEL e fica por último entre os grupos "outros"', () => {
    const t = comporTabelaCustos([ok(2025, { grupos: [
      grupo('cartao', 'custo', -100), grupo('antecipacao', 'custo', -40), grupo('juros_iof', 'custo', -30), grupo('tarifas', 'custo', -10),
      grupo('nao_classificado', 'outros', -7, [[99, 'Categoria nova', -7]]),
      grupo('cambio', 'outros', 5), grupo('receitas_financeiras', 'outros', 25),
    ], fin: serie(-157), custos: serie(-180) })])
    expect(t.temBandeja).toBe(true)
    const rot = t.linhas.map(l => l.rotulo)
    expect(rot.indexOf('Não classificado')).toBeGreaterThan(rot.indexOf('Receitas financeiras'))
    expect(rot.indexOf('Não classificado')).toBeLessThan(rot.indexOf('Resultado financeiro'))
    expect(t.linhas.find(l => l.rotulo === 'Não classificado')!.bandeja).toBe(true)
  })

  it('sem bandeja: nenhuma linha "Não classificado"', () => {
    const t = comporTabelaCustos([ok(2025)])
    expect(t.temBandeja).toBe(false)
    expect(t.linhas.some(l => l.rotulo === 'Não classificado')).toBe(false)
  })

  it('grupo desconhecido não derruba a seção: cai depois dos conhecidos, com o nome cru', () => {
    const t = comporTabelaCustos([ok(2025, { grupos: [
      grupo('cartao', 'custo', -100), grupo('multa_nova', 'custo', -5),
    ], custos: serie(-105), fin: serie(-105) })])
    expect(t.linhas.map(l => l.rotulo).slice(0, 3)).toEqual(['Cartão', 'multa_nova', 'Custos financeiros'])
  })

  it('DETECTA quando os grupos não fecham no FIN (a página está errada, não a DRE)', () => {
    const t = comporTabelaCustos([ok(2025, { fin: serie(-149) })])
    expect(t.divergencias).toEqual([{ ano: 2025, tipo: 'grupos-vs-fin', diferenca: -1 }])
    const t2 = comporTabelaCustos([ok(2025, { custos: serie(-179.5) })])
    expect(t2.divergencias.map(d => d.tipo)).toContain('grupos-vs-custos')
  })

  it('resíduo de ponto flutuante não vira divergência', () => {
    const t = comporTabelaCustos([ok(2025, { grupos: [
      grupo('cartao', 'custo', -0.1), grupo('antecipacao', 'custo', -0.2),
    ], custos: serie(-0.3), fin: serie(-0.3) })])
    expect(t.divergencias).toEqual([])
  })

  it('ano sem nenhum lançamento: sem movimento (a seção explica o vazio)', () => {
    // A RPC devolve SEMPRE os 6 grupos curados, com zeros num ano vazio.
    const zerados = [
      grupo('cartao', 'custo', 0), grupo('antecipacao', 'custo', 0), grupo('juros_iof', 'custo', 0),
      grupo('tarifas', 'custo', 0), grupo('cambio', 'outros', 0), grupo('receitas_financeiras', 'outros', 0),
    ]
    const t = comporTabelaCustos([ok(2025, { grupos: zerados, custos: serie(0), fin: serie(0), receita_bruta: serie(0) })])
    expect(t.temMovimento).toBe(false)
    expect(comporTabelaCustos([ok(2025, { grupos: null, custos: serie(0), fin: serie(0), receita_bruta: serie(0) })]).temMovimento).toBe(false)
    expect(comporTabelaCustos([ok(2025)]).temMovimento).toBe(true)
    expect(comporTabelaCustos([falha(2025)]).temMovimento).toBe(false)
  })
})

describe('variacaoCustos', () => {
  it('custo cresceu (mais negativo) = Δ negativo e desfavorável, no mesmo recorte do ano anterior', () => {
    const v = variacaoCustos(custos(2026))
    expect(v.pct).toBeCloseTo(-50, 6)
    expect(v.sentido).toBe('desfavoravel')
  })
  it('sem ano anterior → sem Δ', () => {
    expect(variacaoCustos(custos(2026, { ano_anterior_ytd: null })).pct).toBeNull()
  })
})
