import { describe, expect, it } from 'vitest'
import { fixtureGeral } from './fixture'
import {
  antecipacaoHistoricoSchema, antecipacoesSchema, prejuizosSchema, recebiveisSchema,
} from './schemas'

// Os schemas validam o retorno REAL das RPCs de leitura. A prova contra a RPC viva é do
// `rpc-contrato.test.ts`; aqui, o que dá para provar sem banco: o formato do contrato passa, e os
// estados-limite que o Postgres de fato serializa (array vazio como NULL, objeto sem base) também.

const meses = (t: number) => [t, ...Array.from({ length: 11 }, () => 0)]
const serie = (t: number) => ({ meses: meses(t), total: t })

describe('prejuizosSchema', () => {
  const prej = {
    ano: 2025, relacao: 'fechado', mes_corrente: null,
    prejuizo: serie(-10),
    ano_anterior_ytd: { prejuizo: -1 },
    por_pessoa: [{ pessoa: 'Pessoa 01', n: 2, valor: -7 }, { pessoa: null, n: 1, valor: -3 }],
    bandeja: [{ categoria_id: 3, rotulo: 'Perdas diversas', total: -2 }],
    atualizado_em: '2026-10-15T09:00:00+00:00',
  }
  it('formato do contrato passa (pessoa NULL = sem pessoa); bandeja e por_pessoa NULL → []', () => {
    expect(prejuizosSchema.safeParse(prej).success).toBe(true)
    expect(prejuizosSchema.parse({ ...prej, bandeja: null }).bandeja).toEqual([])
    expect(prejuizosSchema.parse({ ...prej, por_pessoa: null }).por_pessoa).toEqual([])
  })
  it('a série bruta é o núcleo: sem ela, ou sem por_pessoa, reprova', () => {
    for (const chave of ['prejuizo', 'por_pessoa']) {
      const sem: Record<string, unknown> = { ...prej }
      delete sem[chave]
      expect(prejuizosSchema.safeParse(sem).success, chave).toBe(false)
    }
  })
  it('ano_anterior_ytd ausente NÃO derruba a seção (só tira o Δ)', () => {
    const sem: Record<string, unknown> = { ...prej }
    delete sem.ano_anterior_ytd
    expect(prejuizosSchema.safeParse(sem).success).toBe(true)
  })
  it('12 meses exatos e relação dentro do domínio', () => {
    expect(prejuizosSchema.safeParse({ ...prej, prejuizo: { meses: [1, 2], total: 3 } }).success).toBe(false)
    expect(prejuizosSchema.safeParse({ ...prej, relacao: 'passado' }).success).toBe(false)
  })
})

describe('recebiveisSchema (o contrato novo é coberto em recebiveis.test.ts)', () => {
  it('o formato da fixture normal passa; carga NULL é "sem base", não erro', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    expect(d.recebiveis.ok).toBe(true)
    const vazio = fixtureGeral('vazio', '2026-10-26', [2026])
    expect(vazio.recebiveis.ok && vazio.recebiveis.dados.carga).toBeNull()
  })
  it('referencia_semana NULL passa; chave ausente reprova', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    if (!d.recebiveis.ok) throw new Error('fixture')
    const base = d.recebiveis.dados
    expect(recebiveisSchema.safeParse({ ...base, referencia_semana: null }).success).toBe(true)
    const sem: Record<string, unknown> = { ...base }
    delete sem.referencia_semana
    expect(recebiveisSchema.safeParse(sem).success).toBe(false)
  })
})

describe('antecipacoesSchema', () => {
  it('as leituras da fixture (ano com dado e ano vazio) passam; maior_intervalo_ano NULL passa', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026, 2027])
    for (const x of d.antecipacoes) expect(x.leitura.ok).toBe(true)
    const ano27 = d.antecipacoes.find(x => x.ano === 2027)!
    expect(ano27.leitura.ok && ano27.leitura.dados.maior_intervalo_ano).toBeNull()
  })
  it('maior_intervalo_ano com chave ausente é drift e reprova', () => {
    const d = fixtureGeral('normal', '2026-10-26', [2026])
    const l = d.antecipacoes[0].leitura
    if (!l.ok) throw new Error('fixture')
    const sem: Record<string, unknown> = { ...l.dados }
    delete sem.maior_intervalo_ano
    expect(antecipacoesSchema.safeParse(sem).success).toBe(false)
  })
})

describe('antecipacaoHistoricoSchema', () => {
  it('NULL (nenhuma entrada) vira []', () => {
    expect(antecipacaoHistoricoSchema.parse(null)).toEqual([])
  })
})

describe('a fixture passa pelos schemas em todos os estados', () => {
  it.each(['normal', 'vazio'] as const)('estado %s: toda leitura é ok e re-passa nos schemas', estado => {
    const d = fixtureGeral(estado, '2026-10-26', [2024, 2025, 2026])
    if (!d.recebiveis.ok) throw new Error('recebíveis')
    expect(recebiveisSchema.safeParse(d.recebiveis.dados).success).toBe(true)
    for (const x of d.antecipacoes) {
      if (!x.leitura.ok) throw new Error('antecipações')
      expect(antecipacoesSchema.safeParse(x.leitura.dados).success).toBe(true)
    }
    for (const x of d.prejuizos) {
      if (!x.leitura.ok) throw new Error('prejuízos')
      expect(prejuizosSchema.safeParse(x.leitura.dados).success).toBe(true)
    }
  })
})
