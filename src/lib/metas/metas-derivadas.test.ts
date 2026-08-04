import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUBSETOR_ORDER } from '@/lib/config'
import {
  somarPorMes, aplicarRampaWeddings, mesDerivado, decomporFaturamentoWeddings, SETOR_WEDDINGS,
  type MetaSetorRow, type MetaSubsetorRow,
} from './metas-derivadas'

// ── Guards da derivação de metas (v5.4.4) ────────────────────────────────────
// A meta de Weddings passou a ser a SOMA das metas de subsetor. Três coisas podem
// quebrar em silêncio aqui, e cada uma tem teste próprio abaixo:
//  1. a lista canônica de subsetores viver em dois lugares (SQL e TS) e divergir;
//  2. o Group somar a linha CRUA de Weddings enquanto o card mostra a derivada;
//  3. a rampa (mês sem subsetor mantém a meta antiga) deixar de valer e zerar a tela.

const setor = (setor_nome: string, mes: number, valor_meta: number, pct_receita: number | null = null): MetaSetorRow =>
  ({ ano: 2026, setor_nome, mes, valor_meta, pct_receita })

const sub = (
  subsetor: string, mes: number, valorMeta: number,
  pctReceita: number | null = null, metaContratos: number | null = null,
): MetaSubsetorRow => ({ subsetor, ano: 2026, mes, valorMeta, metaContratos, pctReceita })

describe('lista canônica de subsetores — SQL × TS', () => {
  // O CHECK da 0233 e SUBSETOR_ORDER têm de ser IGUAIS byte a byte, inclusive
  // acentos ('PRODUÇÃO') e o separador do par CONVIDADOS (' - ', com espaços).
  // Divergir um acento não quebra build nem tsc: a gravação passa a falhar no
  // banco, em produção, para um subsetor só. Este teste é o único guard mecânico.
  const sql = readFileSync(
    new URL('../../../supabase/migrations/0233_metas_subsetor.sql', import.meta.url),
    'utf8',
  )

  const blocosCheck = [...sql.matchAll(/CHECK\s*\(subsetor IN\s*\(([\s\S]*?)\)\)/g)]
    .map(m => [...m[1].matchAll(/'([^']*)'/g)].map(q => q[1]))

  it('a migration realmente declara o CHECK (senão o teste passaria vazio)', () => {
    // Sem isto, um refactor que removesse o CHECK deixaria os `for` abaixo sem
    // iteração e o teste ficaria verde sem verificar nada.
    expect(blocosCheck.length).toBeGreaterThanOrEqual(2) // tabela + histórico
  })

  it('cada CHECK lista exatamente os 5 de SUBSETOR_ORDER, na mesma ordem', () => {
    for (const literais of blocosCheck) {
      expect(literais).toEqual([...SUBSETOR_ORDER])
    }
  })
})

describe('somarPorMes', () => {
  it('soma valorMeta e pondera pctReceita pela própria meta', () => {
    const r = somarPorMes([
      { ano: 2026, mes: 3, valorMeta: 300, pctReceita: 10 },
      { ano: 2026, mes: 3, valorMeta: 100, pctReceita: 30 },
    ])
    expect(r).toHaveLength(1)
    expect(r[0].valorMeta).toBe(400)
    // (300·10 + 100·30) / 400 = 15 — não é a média simples (20).
    expect(r[0].pctReceita).toBeCloseTo(15, 6)
  })

  it('ignora na ponderação as linhas SEM alvo, sem achatar a média', () => {
    const r = somarPorMes([
      { ano: 2026, mes: 3, valorMeta: 100, pctReceita: 20 },
      { ano: 2026, mes: 3, valorMeta: 900, pctReceita: null },
    ])
    expect(r[0].valorMeta).toBe(1000)
    expect(r[0].pctReceita).toBeCloseTo(20, 6) // e NÃO 2
  })

  it('devolve pctReceita null quando nenhuma linha do mês tem alvo', () => {
    const r = somarPorMes([{ ano: 2026, mes: 3, valorMeta: 100, pctReceita: null }])
    expect(r[0].pctReceita).toBeNull()
  })

  it('separa por (ano, mes)', () => {
    const r = somarPorMes([
      { ano: 2025, mes: 12, valorMeta: 10, pctReceita: null },
      { ano: 2026, mes: 12, valorMeta: 20, pctReceita: null },
      { ano: 2026, mes: 1, valorMeta: 30, pctReceita: null },
    ])
    expect(r).toHaveLength(3)
    expect(r.find(x => x.ano === 2026 && x.mes === 12)?.valorMeta).toBe(20)
  })
})

describe('aplicarRampaWeddings', () => {
  const trips = setor('Lazer', 3, 1000, 14)
  const weddings = setor(SETOR_WEDDINGS, 3, 2_048_746.41, 14)
  const corp = setor('Corporativo', 3, 500, 14)

  it('mês COM subsetor cadastrado → Weddings vira a soma', () => {
    const { rows, mesesDerivados } = aplicarRampaWeddings(
      [trips, weddings, corp],
      [sub('PLANEJAMENTO', 3, 700, 12), sub('PRODUÇÃO', 3, 300, 20)],
    )
    const w = rows.find(r => r.setor_nome === SETOR_WEDDINGS && r.mes === 3)
    expect(w?.valor_meta).toBe(1000)
    // (700·12 + 300·20) / 1000 = 14,4
    expect(w?.pct_receita).toBeCloseTo(14.4, 6)
    expect(mesDerivado(mesesDerivados, 2026, 3)).toBe(true)
  })

  it('mês SEM subsetor cadastrado → mantém a meta antiga (a rampa)', () => {
    const { rows, mesesDerivados } = aplicarRampaWeddings([trips, weddings, corp], [])
    const w = rows.find(r => r.setor_nome === SETOR_WEDDINGS && r.mes === 3)
    expect(w?.valor_meta).toBe(2_048_746.41)
    expect(w?.pct_receita).toBe(14)
    expect(mesDerivado(mesesDerivados, 2026, 3)).toBe(false)
  })

  it('a virada é POR MÊS — um mês preenchido não afeta os outros', () => {
    const marco = setor(SETOR_WEDDINGS, 3, 2_048_746.41, 14)
    const abril = setor(SETOR_WEDDINGS, 4, 1_762_255.41, 14)
    const { rows, mesesDerivados } = aplicarRampaWeddings(
      [marco, abril],
      [sub('PLANEJAMENTO', 4, 42, 10)],
    )
    expect(rows.find(r => r.mes === 3)?.valor_meta).toBe(2_048_746.41) // antiga
    expect(rows.find(r => r.mes === 4)?.valor_meta).toBe(42)           // derivada
    expect(mesDerivado(mesesDerivados, 2026, 3)).toBe(false)
    expect(mesDerivado(mesesDerivados, 2026, 4)).toBe(true)
  })

  it('mês legitimamente ZERADO nos subsetores derruba a meta a zero (não ressuscita a antiga)', () => {
    // O gatilho é "existe linha", não "soma > 0". É deliberado: se fosse soma > 0,
    // seria impossível cadastrar um mês zerado, e o valor antigo voltaria sozinho.
    const { rows, mesesDerivados } = aplicarRampaWeddings([weddings], [sub('PRODUÇÃO', 3, 0)])
    expect(rows.find(r => r.setor_nome === SETOR_WEDDINGS)?.valor_meta).toBe(0)
    expect(mesDerivado(mesesDerivados, 2026, 3)).toBe(true)
  })

  it('cria a linha de Weddings quando o mês tem subsetor mas nunca teve meta de setor', () => {
    const { rows } = aplicarRampaWeddings([trips], [sub('PRODUÇÃO', 3, 555, 9)])
    const w = rows.find(r => r.setor_nome === SETOR_WEDDINGS && r.mes === 3)
    expect(w).toBeDefined()
    expect(w?.valor_meta).toBe(555)
    expect(w?.pct_receita).toBeCloseTo(9, 6)
  })

  it('não toca nas linhas dos outros setores nem muta a entrada', () => {
    const entrada = [trips, weddings, corp]
    const copia = structuredClone(entrada)
    const { rows } = aplicarRampaWeddings(entrada, [sub('PRODUÇÃO', 3, 1)])
    expect(rows.find(r => r.setor_nome === 'Lazer')?.valor_meta).toBe(1000)
    expect(rows.find(r => r.setor_nome === 'Corporativo')?.valor_meta).toBe(500)
    expect(entrada).toEqual(copia) // a rampa é pura
  })

  it('ignora meta_contratos na soma em R$', () => {
    // COMERCIAL tem duas metas; só a de R$ compõe a de Weddings. Se os contratos
    // entrassem na soma, a meta do setor viria inflada em 140 unidades.
    const { rows } = aplicarRampaWeddings(
      [weddings],
      [sub('COMERCIAL', 3, 145_000, 14, 140), sub('PRODUÇÃO', 3, 5_000, 14)],
    )
    expect(rows.find(r => r.setor_nome === SETOR_WEDDINGS)?.valor_meta).toBe(150_000)
  })
})

describe('Group == Trips + Weddings(derivada) + Corporativo', () => {
  // O Group é somado por `metasDoSetor(rows,'todos')`, que usa `somarPorMes` sobre as
  // MESMAS linhas já passadas pela rampa. Este teste reproduz esse encadeamento: é o
  // par de números vizinhos que a tela mostra, e o que provaria a regressão caso
  // alguém movesse a derivação para dentro de `metasDoSetor`.
  it('o Group enxerga a Weddings derivada, não a linha crua', () => {
    const rowsCrus = [
      setor('Lazer', 3, 1_730_750.02, 14),
      setor(SETOR_WEDDINGS, 3, 2_048_746.41, 14),
      setor('Corporativo', 3, 1_268_695.00, 14),
    ]
    const subs = [sub('PLANEJAMENTO', 3, 600_000, 14), sub('PRODUÇÃO', 3, 400_000, 14)]

    const { rows } = aplicarRampaWeddings(rowsCrus, subs)
    const group = somarPorMes(
      rows.map(r => ({ ano: r.ano, mes: r.mes, valorMeta: r.valor_meta, pctReceita: r.pct_receita })),
    )

    const wDerivada = rows.find(r => r.setor_nome === SETOR_WEDDINGS)!.valor_meta
    expect(wDerivada).toBe(1_000_000)
    expect(group[0].valorMeta).toBe(1_730_750.02 + 1_000_000 + 1_268_695.00)
    // E explicitamente NÃO a soma com a linha crua:
    expect(group[0].valorMeta).not.toBe(1_730_750.02 + 2_048_746.41 + 1_268_695.00)
  })
})

describe('decomporFaturamentoWeddings — a reconciliação tem de reconciliar', () => {
  // A expansão mostra "soma dos subsetores + não classificados + defasagem = Weddings".
  // Se as parcelas não somarem o total, a linha que existe para explicar o buraco passa a
  // ser mais um número errado na tela.
  const cent = (v: number) => Math.round(v * 100)

  it('as parcelas somam o total do setor — caso REAL de 04/08 à tarde', () => {
    // Monde 80.696,38 · upload 48.144,44 (Hospedagens 40.748,00 + Extras 7.396,44) · nada
    // não classificado. A defasagem é 40% do número: foi o print do Yan que a expôs.
    const d = decomporFaturamentoWeddings(80_696.38, [0, 0, 0, 40_748.00, 7_396.44], 0)
    expect(cent(d.soma5)).toBe(cent(48_144.44))
    expect(d.naoClassificado).toBe(0)
    expect(cent(d.defasagem)).toBe(cent(32_551.94))
    expect(cent(d.soma5 + d.naoClassificado + d.defasagem)).toBe(cent(80_696.38))
  })

  it('inclui o balde não classificado na conta — caso REAL do ano 2026', () => {
    const d = decomporFaturamentoWeddings(
      10_915_158.83,
      [181_745.13, 1_672_399.14, 2_267_448.82, 5_576_642.48, 665_503.58],
      72_717.41,
    )
    expect(cent(d.soma5)).toBe(cent(10_363_739.15))
    expect(cent(d.naoClassificado)).toBe(cent(72_717.41))
    expect(cent(d.soma5 + d.naoClassificado + d.defasagem)).toBe(cent(10_915_158.83))
  })

  it('defasagem ZERO quando as fontes concordam (agosto pela manhã)', () => {
    const d = decomporFaturamentoWeddings(48_144.44, [0, 0, 0, 40_748.00, 7_396.44], 0)
    expect(cent(d.defasagem)).toBe(0)
  })

  it('defasagem NEGATIVA quando o upload está à frente do Monde', () => {
    // Possível na direção contrária (upload recarregado antes do pull do Monde). A conta
    // continua fechando; a tela nomeia o sinal.
    const d = decomporFaturamentoWeddings(100, [80, 40], 0)
    expect(d.defasagem).toBe(-20)
    expect(d.soma5 + d.naoClassificado + d.defasagem).toBe(100)
  })
})
