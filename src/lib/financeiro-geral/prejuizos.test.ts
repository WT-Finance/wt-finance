import { describe, expect, it } from 'vitest'
import { fixtureGeral } from './fixture'
import { emCentavos } from './numeros'
import {
  LIMITE_TOP_PESSOAS, ROTULO_SEM_PESSOA, bandejaDosAnos, resumoDoAno, resumosDosAnos, rotuloDemaisPessoas,
  tabelaPorPessoa,
} from './prejuizos'
import { prejuizosSchema, type Prejuizos } from './schemas'
import type { LeituraAno } from './tipos'

const meses = (total: number) => [total, ...Array.from({ length: 11 }, () => 0)]
const serie = (total: number) => ({ meses: meses(total), total })

type Pessoa = { pessoa: string | null; n: number; valor: number }

function prej(ano: number, over: Record<string, unknown> = {}): Prejuizos {
  return prejuizosSchema.parse({
    ano, relacao: ano === 2026 ? 'corrente' : 'fechado', mes_corrente: ano === 2026 ? 10 : null,
    prejuizo: serie(-205629.09),
    ano_anterior_ytd: { prejuizo: -150000 },
    por_pessoa: [],
    bandeja: [],
    atualizado_em: '2026-10-15T10:00:00-03:00',
    ...over,
  })
}
const ok = (ano: number, over?: Record<string, unknown>): LeituraAno<Prejuizos> =>
  ({ ano, leitura: { ok: true, dados: prej(ano, over) } })
const falha = (ano: number): LeituraAno<Prejuizos> => ({ ano, leitura: { ok: false } })

/** Um ano cujo total é exatamente a soma das pessoas (o contrato da RPC). */
function okComPessoas(ano: number, pessoas: Pessoa[]): LeituraAno<Prejuizos> {
  const total = pessoas.reduce((s, p) => s + emCentavos(p.valor), 0) / 100
  return ok(ano, { prejuizo: serie(total), por_pessoa: pessoas })
}

describe('resumoDoAno — só o bruto', () => {
  it('bruto no sinal da DRE, rótulo com "*" no ano parcial e a referência do Δ', () => {
    const r = resumoDoAno(prej(2026))
    expect(r).toMatchObject({ ano: 2026, rotulo: '2026*', prejuizo: -205629.09, referencia: 'vs 2025 (jan–out)' })
    expect(resumoDoAno(prej(2025))).toMatchObject({ rotulo: '2025', referencia: 'vs 2024' })
    expect(Object.keys(r).sort()).toEqual(['ano', 'deltaPrejuizo', 'prejuizo', 'referencia', 'rotulo'])
  })

  it('Δ do bruto vs ano_anterior_ytd.prejuizo: aumentou o prejuízo (mais negativo) = desfavorável', () => {
    const r = resumoDoAno(prej(2026))
    expect(r.deltaPrejuizo.pct).toBeCloseTo(((-205629.09 + 150000) / 150000) * 100, 6)
    expect(r.deltaPrejuizo.sentido).toBe('desfavoravel')
    expect(resumoDoAno(prej(2026, { prejuizo: serie(-100000) })).deltaPrejuizo.sentido).toBe('favoravel')
  })

  it('ano anterior sem prejuízo (zero), null ou ausente → sem Δ, nunca Infinity', () => {
    expect(resumoDoAno(prej(2026, { ano_anterior_ytd: { prejuizo: 0 } })).deltaPrejuizo.pct).toBeNull()
    expect(resumoDoAno(prej(2026, { ano_anterior_ytd: { prejuizo: null } })).deltaPrejuizo.pct).toBeNull()
    expect(resumoDoAno(prej(2026, { ano_anterior_ytd: null })).deltaPrejuizo.pct).toBeNull()
    const sem: Record<string, unknown> = { ...prej(2026) }
    delete sem.ano_anterior_ytd
    expect(resumoDoAno(prejuizosSchema.parse(sem)).deltaPrejuizo).toEqual({ pct: null, sentido: null })
  })

  it('ano sem prejuízo nenhum: zero, sem quebrar', () => {
    expect(resumoDoAno(prej(2025, { prejuizo: serie(0) })).prejuizo).toBe(0)
  })
})

describe('resumosDosAnos — do mais recente ao mais antigo; falha reportada', () => {
  it('ordem decrescente e anosFalha', () => {
    const r = resumosDosAnos([ok(2024), falha(2025), ok(2026)])
    expect(r.linhas.map(l => l.ano)).toEqual([2026, 2024])
    expect(r.anosFalha).toEqual([2025])
  })
})

describe('tabelaPorPessoa — uma tabela só, somando os anos carregados', () => {
  it('soma a MESMA pessoa entre os anos e ordena pela magnitude (valores negativos)', () => {
    const t = tabelaPorPessoa([
      okComPessoas(2025, [{ pessoa: 'Pessoa A', n: 1, valor: -100 }, { pessoa: 'Pessoa B', n: 2, valor: -300 }]),
      okComPessoas(2026, [{ pessoa: 'Pessoa A', n: 3, valor: -250.5 }, { pessoa: 'Pessoa C', n: 1, valor: -10 }]),
    ])
    expect(t.linhas.map(l => [l.pessoa, l.valor, l.n])).toEqual([
      ['Pessoa A', -350.5, 4], ['Pessoa B', -300, 2], ['Pessoa C', -10, 1],
    ])
    expect(t.linhas.map(l => l.posicao)).toEqual([1, 2, 3])
    expect(t.anos).toEqual([2025, 2026])
    expect(t.demais).toBeNull()
  })

  it('% sobre o TOTAL (sinal positivo: prejuízo ÷ prejuízo)', () => {
    const t = tabelaPorPessoa([okComPessoas(2026, [
      { pessoa: 'A', n: 1, valor: -75 }, { pessoa: 'B', n: 1, valor: -25 },
    ])])
    expect(t.linhas.map(l => l.pct)).toEqual([75, 25])
    expect(t.total).toEqual({ n: 2, valor: -100 })
  })

  it('sem pessoa (null) agrupa sozinho, vira "(sem pessoa)", visível e contado; nunca descartado', () => {
    const t = tabelaPorPessoa([
      okComPessoas(2025, [{ pessoa: null, n: 1, valor: -40 }, { pessoa: 'A', n: 1, valor: -60 }]),
      okComPessoas(2026, [{ pessoa: null, n: 2, valor: -10 }]),
    ])
    const sem = t.linhas.find(l => l.semPessoa)!
    expect(sem).toMatchObject({ pessoa: ROTULO_SEM_PESSOA, n: 3, valor: -50 })
    expect(ROTULO_SEM_PESSOA).toBe('(sem pessoa)')
    expect(t.fecha).toBe(true)
    // pessoa literalmente chamada "null" NÃO se confunde com o null
    const t2 = tabelaPorPessoa([okComPessoas(2026, [{ pessoa: 'null', n: 1, valor: -1 }, { pessoa: null, n: 1, valor: -1 }])])
    expect(t2.linhas).toHaveLength(2)
  })

  it('top 10 + "demais N pessoas" + total; Σ linhas + demais ≡ total', () => {
    const pessoas: Pessoa[] = Array.from({ length: 14 }, (_, i) => ({
      pessoa: `Pessoa ${String(i + 1).padStart(2, '0')}`, n: 1, valor: -(1000 - i * 10) - 0.07,
    }))
    const t = tabelaPorPessoa([okComPessoas(2026, pessoas)])
    expect(LIMITE_TOP_PESSOAS).toBe(10)
    expect(t.linhas).toHaveLength(10)
    expect(t.demais).toMatchObject({ pessoas: 4, rotulo: 'demais 4 pessoas', n: 4 })
    const soma = t.linhas.reduce((s, l) => s + emCentavos(l.valor), 0) + emCentavos(t.demais!.valor)
    expect(soma).toBe(emCentavos(t.total.valor))
    expect(t.total.n).toBe(14)
    expect(rotuloDemaisPessoas(1)).toBe('demais 1 pessoa')
  })

  it('desempate determinístico: valores iguais caem no nome, e o corte top/demais não depende da ordem de entrada', () => {
    const base: Pessoa[] = ['Zeca', 'Ana', 'Bia'].map(pessoa => ({ pessoa, n: 1, valor: -100 }))
    const a = tabelaPorPessoa([okComPessoas(2026, base)], 2)
    const b = tabelaPorPessoa([okComPessoas(2026, [...base].reverse())], 2)
    expect(a.linhas.map(l => l.pessoa)).toEqual(['Ana', 'Bia'])
    expect(b.linhas.map(l => l.pessoa)).toEqual(['Ana', 'Bia'])
    expect(a.demais).toMatchObject({ pessoas: 1 })
  })

  it('Σ linhas ≡ Σ dos prejuizo.total dos anos carregados AO CENTAVO (centavos inteiros, valores que dão dízima em float)', () => {
    const t = tabelaPorPessoa([
      okComPessoas(2025, [{ pessoa: 'A', n: 1, valor: -0.1 }, { pessoa: 'B', n: 1, valor: -0.2 }]),
      okComPessoas(2026, [{ pessoa: 'A', n: 1, valor: -33333.33 }, { pessoa: 'C', n: 1, valor: -66666.67 }]),
    ])
    const somaPessoas = t.linhas.reduce((s, l) => s + emCentavos(l.valor), 0) + emCentavos(t.demais?.valor ?? 0)
    const somaAnos = emCentavos(-0.1 - 0.2) + emCentavos(-33333.33 - 66666.67)
    expect(somaPessoas).toBe(somaAnos)
    expect(emCentavos(t.total.valor)).toBe(somaAnos)
    expect(t.fecha).toBe(true)
  })

  it('ano que falhou fica FORA da soma e é reportado; os outros seguem de pé', () => {
    const t = tabelaPorPessoa([
      okComPessoas(2025, [{ pessoa: 'A', n: 1, valor: -100 }]), falha(2026),
    ])
    expect(t.anos).toEqual([2025])
    expect(t.anosFalha).toEqual([2026])
    expect(t.total.valor).toBe(-100)
    expect(t.fecha).toBe(true)
  })

  it('todos falharam / sem lançamento: tabela vazia, sem quebrar', () => {
    const f = tabelaPorPessoa([falha(2025), falha(2026)])
    expect(f).toMatchObject({ linhas: [], demais: null, total: { n: 0, valor: 0 }, anos: [], anosFalha: [2025, 2026], fecha: true })
    const vazio = tabelaPorPessoa([ok(2026, { prejuizo: serie(0), por_pessoa: null })])
    expect(vazio.linhas).toEqual([])
    expect(vazio.fecha).toBe(true)
  })

  it('NÃO fecha quando por_pessoa não soma o total do ano (fecha=false)', () => {
    const t = tabelaPorPessoa([ok(2026, { prejuizo: serie(-100), por_pessoa: [{ pessoa: 'A', n: 1, valor: -99.99 }] })])
    expect(t.fecha).toBe(false)
  })

  it('por_pessoa NULL (jsonb_agg de vazio) vira []', () => {
    expect(prej(2026, { por_pessoa: null }).por_pessoa).toEqual([])
  })
})

describe('a fixture normal fecha as contas do prejuízo (inv. 2)', () => {
  it('Σ pessoas ≡ Σ série mensal ≡ total, ano a ano e na soma dos três anos', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2024, 2025, 2026])
    for (const x of d.prejuizos) {
      if (!x.leitura.ok) throw new Error('fixture com ano em erro')
      const l = x.leitura.dados
      const serieC = l.prejuizo.meses.reduce((s, v) => s + emCentavos(v), 0)
      const pessoasC = l.por_pessoa.reduce((s, p) => s + emCentavos(p.valor), 0)
      expect(serieC).toBe(emCentavos(l.prejuizo.total))
      expect(pessoasC).toBe(emCentavos(l.prejuizo.total))
    }
    const t = tabelaPorPessoa(d.prejuizos)
    expect(t.fecha).toBe(true)
    expect(emCentavos(t.total.valor)).toBe(emCentavos(-77892.96) + emCentavos(-175808.35) + emCentavos(-224574.79))
  })
})

describe('bandejaDosAnos — categoria de prejuízo/perda fora do mapa é VISÍVEL', () => {
  it('vazia quando o mapa conhece tudo (e quando o array vem NULL do Postgres)', () => {
    expect(bandejaDosAnos([ok(2025), ok(2026)])).toEqual([])
    expect(bandejaDosAnos([ok(2025, { bandeja: null })])).toEqual([])
  })

  it('une a mesma categoria entre anos e soma', () => {
    const b = bandejaDosAnos([
      ok(2026, { bandeja: [{ categoria_id: 9, rotulo: 'Perdas diversas', total: -10.5 }] }),
      ok(2025, { bandeja: [{ categoria_id: 9, rotulo: 'Perdas diversas', total: -4.25 }, { categoria_id: 7, rotulo: 'Prejuízo X', total: -1 }] }),
    ])
    expect(b).toHaveLength(2)
    const perdas = b.find(x => x.categoriaId === 9)!
    expect(perdas.porAno).toEqual([{ ano: 2025, total: -4.25 }, { ano: 2026, total: -10.5 }])
    expect(perdas.total).toBe(-14.75)
  })

  it('ano que falhou não entra (nem derruba os outros)', () => {
    const b = bandejaDosAnos([
      { ano: 2025, leitura: { ok: false } },
      ok(2026, { bandeja: [{ categoria_id: 1, rotulo: 'A', total: -2 }] }),
    ])
    expect(b.map(x => x.categoriaId)).toEqual([1])
  })
})

describe('schema: o contrato novo', () => {
  it('chaves extras do que a RPC ainda emite até a poda são descartadas; a série bruta segue', () => {
    const r = prejuizosSchema.parse({ ...prej(2026), campo_legado: serie(1) })
    expect('campo_legado' in r).toBe(false)
    expect(r.prejuizo.total).toBe(-205629.09)
  })
  it('sem por_pessoa (chave ausente) é drift e reprova', () => {
    const sem: Record<string, unknown> = { ...prej(2026) }
    delete sem.por_pessoa
    expect(prejuizosSchema.safeParse(sem).success).toBe(false)
  })
})
