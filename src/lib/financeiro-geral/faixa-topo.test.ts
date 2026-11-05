import { describe, expect, it } from 'vitest'
import { fmtBRL2 } from '@/lib/fmt'
import { custoDoRecorte, fmtCustoPct } from './antecipacoes'
import { faixaDoTopo } from './faixa-topo'
import { fixtureGeral } from './fixture'
import { recebiveisSchema } from './schemas'
import type { DadosGeral } from './tipos'

const HOJE = '2026-10-26'
const normal = (anos: number[] = [2025, 2026]) => fixtureGeral('normal', HOJE, anos)

describe('faixaDoTopo — os 3 indicadores', () => {
  it('três, na ordem das seções, sem tiles de custos nem de prazos', () => {
    const f = faixaDoTopo(normal())
    expect(f.map(i => i.chave)).toEqual(['inadimplencia', 'prejuizos', 'antecipacoes'])
    expect(f.map(i => i.estado)).toEqual(['ok', 'ok', 'ok'])
  })

  it('Inadimplência: valor da marcação, "em DD/MM", só a contagem de títulos (sem "% dos vencidos"), Δ contra a referência da semana', () => {
    const i = faixaDoTopo(normal())[0]
    expect(i.valor).toBe(fmtBRL2(199767.74))
    expect(i.escopo).toBe('em 15/10')
    expect(i.apoio).toEqual(['21 títulos marcados'])
    expect(JSON.stringify(i)).not.toMatch(/dos vencidos/)
    expect(i.referencia).toBe('vs 08/10')
    expect(i.variacao?.pct).toBeCloseTo(((199767.74 - 181420.3) / 181420.3) * 100, 6)
    expect(i.variacao?.sentido).toBe('desfavoravel') // inadimplência subiu: menor é melhor
    // Sem nome de pessoa na faixa
    expect(JSON.stringify(i)).not.toMatch(/Devedor|Pessoa/)
  })

  it('Inadimplência sem referência da semana (1ª carga): sem Δ nem rótulo', () => {
    const d = normal()
    if (!d.recebiveis.ok) throw new Error('fixture')
    const r = recebiveisSchema.parse({ ...d.recebiveis.dados, referencia_semana: null })
    const i = faixaDoTopo({ ...d, recebiveis: { ok: true, dados: r } })[0]
    expect(i.estado).toBe('ok')
    expect(i.variacao).toBeNull()
    expect(i.referencia).toBeNull()
  })

  it('Inadimplência sem carga: estado vazio com explicação (não zero)', () => {
    const i = faixaDoTopo(fixtureGeral('vazio', HOJE, [2026]))[0]
    expect(i).toMatchObject({ estado: 'vazio', valor: null })
    expect(i.mensagem).toMatch(/ainda não teve carga/)
  })

  it('Prejuízos: o bruto do ano CORRENTE, com "*" e o Δ no mesmo recorte do ano anterior', () => {
    const p = faixaDoTopo(normal())[1]
    expect(p.valor).toBe(fmtBRL2(-224574.79))
    expect(p.escopo).toBe('2026*')
    expect(p.referencia).toBe('vs 2025*')
    expect(p.variacao?.sentido).toBe('desfavoravel') // prejuízo cresceu
    expect(p.apoio).toEqual(['123 lançamentos'])
  })

  it('Prejuízos não depende das pills: só o ano passado selecionado ainda mostra o ano CORRENTE (nunca o anterior)', () => {
    expect(faixaDoTopo(normal([2024, 2025, 2026]))[1].escopo).toBe('2026*')
    const so2025 = faixaDoTopo(normal([2025]))[1]
    expect(so2025.estado).toBe('ok')
    expect(so2025.escopo).toBe('2026*')
    expect(so2025.valor).toBe(fmtBRL2(-224574.79))
  })

  it('Prejuízos: a leitura do ano corrente FALHOU → erro (não usa o anterior)', () => {
    const d = normal()
    const corrente = { ...d.corrente, prejuizos: { ano: 2026, leitura: { ok: false as const } } }
    expect(faixaDoTopo({ ...d, corrente })[1].estado).toBe('erro')
  })

  it('Antecipações: duas metades — custo efetivo do ano corrente (R$ e %) | dias sem antecipar com a data da última', () => {
    const d = normal()
    const a = faixaDoTopo(d)[2]
    const leitura = d.corrente.antecipacoes.leitura
    if (!leitura.ok) throw new Error('fixture')
    const custo = custoDoRecorte(leitura.dados.total)
    expect(a.estado).toBe('ok')
    expect(a.variacao).toBeNull()
    const [esq, dir] = a.metades!
    expect(esq).toMatchObject({ rotulo: 'Custo efetivo 2026*', estado: 'ok', valor: fmtBRL2(custo.efetivo) })
    expect(esq.apoio).toEqual([fmtCustoPct(custo.pct)])
    expect(dir).toMatchObject({ rotulo: 'Sem antecipar', estado: 'ok', valor: '35 dias' })
    expect(dir.apoio).toEqual(['Última em 21/09/2026'])
    // O "maior intervalo" saiu do tile.
    expect(JSON.stringify(a)).not.toMatch(/Maior intervalo/)
  })

  it('Antecipações não depende das pills: só ano passado selecionado ainda mostra o custo e os dias do ano corrente', () => {
    const a = faixaDoTopo(normal([2024]))[2]
    expect(a.estado).toBe('ok')
    expect(a.metades![0].rotulo).toBe('Custo efetivo 2026*')
    expect(a.metades![0].estado).toBe('ok')
    expect(a.metades![1].valor).toBe('35 dias')
  })

  it('Antecipações no próprio dia: "hoje"', () => {
    const d = fixtureGeral('normal', '2026-09-21', [2026])
    const dir = faixaDoTopo(d)[2].metades![1]
    expect(dir.valor).toBe('hoje')
    expect(dir.rotulo).toBe('Última antecipação')
  })

  it('Antecipações: sem antecipação no ano corrente → a metade do custo diz isso (nunca R$ 0,00), a dos dias segue', () => {
    const d = normal()
    const leitura = d.corrente.antecipacoes.leitura
    if (!leitura.ok) throw new Error('fixture')
    const total = { ...leitura.dados.total, volume: 0, liquido: 0, desconto: 0, n: 0 }
    const corrente = { ...d.corrente, antecipacoes: { ano: 2026, leitura: { ok: true as const, dados: { ...leitura.dados, total } } } }
    const a = faixaDoTopo({ ...d, corrente })[2]
    expect(a.estado).toBe('ok')
    const [esq, dir] = a.metades!
    expect(esq).toMatchObject({ estado: 'vazio', valor: null, mensagem: 'Sem antecipação em 2026.' })
    expect(esq.apoio).toEqual([])
    expect(dir).toMatchObject({ estado: 'ok', valor: '35 dias' })
  })

  it('Antecipações: sem leitura do ano corrente → a metade do custo fica vazia com a mensagem, sem derrubar a dos dias', () => {
    const d = normal()
    // O ano corrente sai da leitura: o custo (que é do ano corrente) não pode usar o de outro ano.
    const leitura = d.antecipacoes.find(x => x.ano === 2025)
    if (!leitura) throw new Error('fixture')
    const a = faixaDoTopo({ ...d, corrente: { ...d.corrente, antecipacoes: leitura } })[2]
    const [esq, dir] = a.metades!
    expect(esq).toMatchObject({ estado: 'vazio', mensagem: 'Sem leitura do ano corrente.' })
    expect(dir.estado).toBe('ok')
  })

  it('cada indicador degrada SOZINHO: uma leitura falha não derruba as outras', () => {
    const d: DadosGeral = { ...normal(), recebiveis: { ok: false } }
    const f = faixaDoTopo(d)
    expect(f.map(i => i.estado)).toEqual(['erro', 'ok', 'ok'])
    expect(f[0].valor).toBeNull()
  })

  it('estado erro da fixture: os três em erro; estado vazio: nenhum número inventado', () => {
    expect(faixaDoTopo(fixtureGeral('erro', HOJE, [2025, 2026])).map(i => i.estado)).toEqual(['erro', 'erro', 'erro'])
    const v = faixaDoTopo(fixtureGeral('vazio', HOJE, [2025, 2026]))
    expect(v.map(i => i.estado)).toEqual(['vazio', 'ok', 'vazio'])
    expect(v[0].valor).toBeNull()
    expect(v[2].valor).toBeNull()
    expect(v[2].mensagem).toBe('Nenhuma antecipação registrada.')
  })

  it('leitura de antecipações do ano corrente falhou: erro (as pills não interferem)', () => {
    const d = normal()
    const corrente = { ...d.corrente, antecipacoes: { ano: 2026, leitura: { ok: false as const } } }
    expect(faixaDoTopo({ ...d, corrente })[2].estado).toBe('erro')
    expect(faixaDoTopo({ ...d, antecipacoes: [] })[2].estado).toBe('ok')
  })
})
