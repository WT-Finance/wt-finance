import { describe, expect, it } from 'vitest'
import { volumePorConta } from './antecipacoes'
import { fixtureGeral } from './fixture'
import { emCentavos } from './numeros'
import { tabelaPorPessoa } from './prejuizos'
import { faixasDeAtraso, pontosSemanais, tabelaDevedores } from './recebiveis'
import type { DadosGeral } from './tipos'

const HOJE = '2026-10-26'
const ANOS = [2024, 2025, 2026]

function recebiveisDe(d: DadosGeral) {
  if (!d.recebiveis.ok) throw new Error('fixture sem recebíveis')
  return d.recebiveis.dados
}

/** Todo número da árvore, com o caminho — para provar "centavos exatos, sem dízima". */
function folhasNumericas(x: unknown, caminho = '', saida: [string, number][] = []): [string, number][] {
  if (typeof x === 'number') saida.push([caminho, x])
  else if (Array.isArray(x)) x.forEach((v, i) => folhasNumericas(v, `${caminho}[${i}]`, saida))
  else if (x && typeof x === 'object') {
    for (const [k, v] of Object.entries(x)) folhasNumericas(v, `${caminho}.${k}`, saida)
  }
  return saida
}

describe('fixtureGeral — estado normal (números da M0)', () => {
  const d = fixtureGeral('normal', HOJE, ANOS)

  it('o funil da posição de 15/10: em aberto, vencidos e inadimplentes', () => {
    const r = recebiveisDe(d)
    expect(r.carga?.data_posicao).toBe('2026-10-15')
    expect(r.em_aberto).toEqual({ n: 4830, valor: 12146832.84 })
    expect(r.vencido).toEqual({ n: 182, valor: 1029384.12 })
    expect(r.inadimplente).toMatchObject({ n: 21, valor: 199767.74 })
  })

  it('18 devedores rotulados, sem nome real: 10 no top e 8 em "demais"', () => {
    const r = recebiveisDe(d)
    expect(r.devedores.top).toHaveLength(10)
    expect(r.devedores.demais.devedores).toBe(8)
    expect(r.devedores.top.map(t => t.pessoa)).toEqual(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(l => `Devedor ${l}`),
    )
  })

  it('completudes do inv. 2 nos recebíveis, em centavos inteiros', () => {
    const r = recebiveisDe(d)
    const faixas = faixasDeAtraso(r.inadimplente)
    expect(faixas.linhas.reduce((s, l) => s + emCentavos(l.valor), 0)).toBe(emCentavos(r.inadimplente.valor))
    expect(faixas.fecha).toBe(true)
    const dev = tabelaDevedores(r.devedores, r.inadimplente)
    expect(dev.linhas.reduce((s, l) => s + emCentavos(l.valor), 0) + emCentavos(dev.demais?.valor ?? 0))
      .toBe(emCentavos(r.inadimplente.valor))
    expect(dev.fecha).toBe(true)
  })

  it('tem referência da semana (FICTÍCIA, 08/10) e histórico com UMA lacuna', () => {
    const r = recebiveisDe(d)
    expect(r.referencia_semana?.data_posicao).toBe('2026-10-08')
    // posição de hoje = a semana da carga, para a série terminar na carga (sem semanas à frente)
    const pontos = pontosSemanais(r, '2026-10-15')
    expect(pontos.filter(p => p.lacuna)).toHaveLength(1)
    expect(pontos.filter(p => p.lacuna)[0].semana).toBe('2026-09-21')
    expect(pontos.at(-1)).toMatchObject({ parcial: true, lacuna: false, inadimplenteValor: 199767.74 })
  })

  it('prejuízo bruto por ano = M0, com pessoas e série somando exato (inv. 2)', () => {
    const totais = Object.fromEntries(d.prejuizos.map(x => [x.ano, x.leitura.ok ? x.leitura.dados.prejuizo.total : null]))
    expect(totais).toEqual({ 2024: -77892.96, 2025: -175808.35, 2026: -224574.79 })
    const l2026 = d.prejuizos.find(x => x.ano === 2026)!
    if (!l2026.leitura.ok) throw new Error('fixture')
    expect(l2026.leitura.dados.por_pessoa).toHaveLength(50)
    expect(l2026.leitura.dados.por_pessoa.reduce((s, p) => s + p.n, 0)).toBe(123)
    // 2026 corrente até out: nov e dez zerados
    expect(l2026.leitura.dados.prejuizo.meses.slice(10)).toEqual([0, 0])
    expect(tabelaPorPessoa(d.prejuizos).fecha).toBe(true)
  })

  it('antecipações por ano = M0; contas Asaas e Blimboo; Σ por conta ≡ Σ volume', () => {
    const porAno = Object.fromEntries(d.antecipacoes.map(x => {
      if (!x.leitura.ok) throw new Error('fixture')
      const t = x.leitura.dados.total
      return [x.ano, [t.volume, t.desconto]]
    }))
    expect(porAno).toEqual({
      2024: [1521381.14, 43964.39], 2025: [3926091.12, 102130.34], 2026: [1797940.19, 41968.28],
    })
    const t = volumePorConta(d.antecipacoes)
    expect(t.linhas.map(l => l.conta).sort()).toEqual(['Asaas', 'Blimboo'])
    expect(t.fecha).toBe(true)
  })

  it('a última antecipação é 21/09/2026 e o maior intervalo de 2026 é 117 dias; dias derivados de hoje', () => {
    const l = d.antecipacoes.find(x => x.ano === 2026)!.leitura
    if (!l.ok) throw new Error('fixture')
    expect(l.dados.ultima_data).toBe('2026-09-21')
    expect(l.dados.dias_desde_ultima).toBe(35)
    expect(l.dados.maior_intervalo_ano?.dias).toBe(117)
    const outroDia = fixtureGeral('normal', '2026-11-02', [2026]).antecipacoes[0].leitura
    expect(outroDia.ok && outroDia.dados.dias_desde_ultima).toBe(42)
  })

  it('todo valor monetário está em centavos exatos (sem dízima de ponto flutuante)', () => {
    const tudo = folhasNumericas({ r: d.recebiveis, a: d.antecipacoes, p: d.prejuizos })
    const ruins = tudo.filter(([caminho, v]) => !caminho.endsWith('.desconto_pct') && Math.round(v * 100) / 100 !== v)
    expect(ruins).toEqual([])
    expect(tudo.length).toBeGreaterThan(200)
  })

  it('nenhum nome real: só rótulos "Devedor X" e "Pessoa NN"', () => {
    const nomes: string[] = []
    const r = recebiveisDe(d)
    r.devedores.top.forEach(t => nomes.push(String(t.pessoa)))
    for (const x of d.prejuizos) if (x.leitura.ok) x.leitura.dados.por_pessoa.forEach(p => nomes.push(String(p.pessoa)))
    expect(nomes.length).toBeGreaterThan(100)
    expect(nomes.every(n => /^(Devedor [A-R]|Pessoa \d{2})$/.test(n))).toBe(true)
  })

  it('é determinística', () => {
    expect(fixtureGeral('normal', HOJE, ANOS)).toEqual(d)
  })
})

describe('fixtureGeral — anos e tempo', () => {
  it('só entram os anos de `anos`, crescente e sem repetir; as pills vão até o ano de hoje', () => {
    const d = fixtureGeral('normal', HOJE, [2026, 2025, 2025])
    expect(d.anos).toEqual([2025, 2026])
    expect(d.antecipacoes.map(x => x.ano)).toEqual([2025, 2026])
    expect(d.prejuizos.map(x => x.ano)).toEqual([2025, 2026])
    expect(d.anosDisponiveis).toEqual([2024, 2025, 2026])
    expect(d.hoje).toBe(HOJE)
  })

  it('relação e mês corrente derivam de hoje (nada hardcoded)', () => {
    const d = fixtureGeral('normal', '2027-03-10', [2025, 2026, 2027, 2028])
    const rel = Object.fromEntries(d.antecipacoes.map(x => {
      if (!x.leitura.ok) throw new Error('fixture')
      return [x.ano, [x.leitura.dados.relacao, x.leitura.dados.mes_corrente]]
    }))
    expect(rel).toEqual({ 2025: ['fechado', null], 2026: ['fechado', null], 2027: ['corrente', 3], 2028: ['futuro', null] })
    expect(d.anosDisponiveis).toEqual([2024, 2025, 2026, 2027])
  })

  it('ano sem dado na fixture (ex.: 2027) vem zerado, mas válido', () => {
    const l = fixtureGeral('normal', '2027-03-10', [2027]).prejuizos[0].leitura
    if (!l.ok) throw new Error('fixture')
    expect(l.dados.prejuizo.total).toBe(0)
    expect(l.dados.por_pessoa).toEqual([])
  })

  it('o Δ do ano usa o recorte da própria leitura: 2026 contra jan–out de 2025 (não o ano inteiro)', () => {
    const d = fixtureGeral('normal', HOJE, [2025, 2026])
    const p2025 = d.prejuizos.find(x => x.ano === 2025)!.leitura
    const p2026 = d.prejuizos.find(x => x.ano === 2026)!.leitura
    if (!p2025.ok || !p2026.ok) throw new Error('fixture')
    const jan_out = p2025.dados.prejuizo.meses.slice(0, 10).reduce((s, v) => s + emCentavos(v), 0)
    expect(emCentavos(p2026.dados.ano_anterior_ytd?.prejuizo ?? 0)).toBe(jan_out)
    expect(p2026.dados.ano_anterior_ytd?.prejuizo).not.toBe(p2025.dados.prejuizo.total)
    // ano fechado compara contra o ano anterior inteiro
    expect(p2025.dados.ano_anterior_ytd?.prejuizo).toBe(-77892.96)
  })
})

describe('fixtureGeral — estado vazio e estado erro', () => {
  it('vazio: sem carga, listas vazias, anos zerados — estado normal de "sem dado", não erro', () => {
    const d = fixtureGeral('vazio', HOJE, ANOS)
    const r = recebiveisDe(d)
    expect(r.carga).toBeNull()
    expect(r.em_aberto).toEqual({ n: 0, valor: 0 })
    expect(r.inadimplente.faixas).toEqual([])
    expect(r.devedores.top).toEqual([])
    expect(r.evolucao_semanal).toEqual([])
    expect(r.referencia_semana).toBeNull()
    expect(r.historico_desde).toBeNull()
    for (const x of d.antecipacoes) {
      if (!x.leitura.ok) throw new Error('vazio não é erro')
      expect(x.leitura.dados.total).toMatchObject({ volume: 0, n: 0, desconto_pct: null })
      expect(x.leitura.dados.por_conta).toEqual([])
      expect(x.leitura.dados.ultima_data).toBeNull()
      expect(x.leitura.dados.maior_intervalo_ano).toBeNull()
    }
    for (const x of d.prejuizos) {
      if (!x.leitura.ok) throw new Error('vazio não é erro')
      expect(x.leitura.dados.prejuizo.total).toBe(0)
      expect(x.leitura.dados.por_pessoa).toEqual([])
    }
  })

  it('erro: toda leitura { ok: false }', () => {
    const d = fixtureGeral('erro', HOJE, ANOS)
    expect(d.recebiveis).toEqual({ ok: false })
    expect(d.antecipacoes).toHaveLength(3)
    expect(d.antecipacoes.every(x => !x.leitura.ok)).toBe(true)
    expect(d.prejuizos.every(x => !x.leitura.ok)).toBe(true)
  })

  it('podeGerir: ligado por padrão no mockup, desligável', () => {
    expect(fixtureGeral('normal', HOJE, ANOS).podeGerir).toBe(true)
    expect(fixtureGeral('normal', HOJE, ANOS, false).podeGerir).toBe(false)
  })
})
