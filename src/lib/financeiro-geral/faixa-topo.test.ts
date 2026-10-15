import { describe, expect, it } from 'vitest'
import { fmtBRL2 } from '@/lib/fmt'
import { faixaDoTopo } from './faixa-topo'
import {
  antecipacoesSchema, custosFinanceirosSchema, prazosSchema, prejuizosSchema, recebiveisSchema,
} from './schemas'
import type { DadosGeral } from './tipos'

const meses = (total: number) => [total, ...Array.from({ length: 11 }, () => 0)]
const serie = (total: number) => ({ meses: meses(total), total })
const rel = (ano: number) => ({
  ano, relacao: ano === 2026 ? 'corrente' : 'fechado', mes_corrente: ano === 2026 ? 10 : null,
})
const MES = { volume: 0, liquido: 0, desconto: 0, n: 0 }

const recebiveis = recebiveisSchema.parse({
  carga: { carga_id: 'c1', data_posicao: '2026-10-15', gravado_em: '2026-10-15T13:00:00-03:00' },
  a_vencer: { n: 100, valor: 900000 },
  inadimplente: { n: 20, valor: 195708.79, faixas: [{ faixa: '90+', n: 20, valor: 195708.79 }] },
  marcacao_em_aberto: [],
  concentracao: { top: [], valor_top: 120000, pct_top: 61.3 },
  recuperado_ano: { ano: 2026, n: 1, valor: 1228.64 },
  comparativo: { data_posicao: '2026-09-25', inadimplente_n: 18, inadimplente_valor: 150000, a_vencer_valor: 800000 },
  evolucao: [],
  historico_desde: '2026-09-25',
})

const ant = (ano: number, volume = 1343423.51) => antecipacoesSchema.parse({
  ...rel(ano),
  meses: Array.from({ length: 12 }, () => MES),
  total: { volume, liquido: volume * 0.97, desconto: volume * 0.03, n: 14, desconto_pct: 3 },
  ano_anterior_ytd: { volume: 1000000, desconto: 30000, n: 10 },
  por_conta: [], ultima_data: '2026-10-05', dias_desde_ultima: 10,
  maior_intervalo_ano: null, atualizado_em: null,
})
const prej = (ano: number) => prejuizosSchema.parse({
  ...rel(ano), prejuizo: serie(-205629.09), reversao: serie(80119.24), liquido: serie(-125509.85),
  ano_anterior_ytd: { prejuizo: -150000, reversao: 0, liquido: -150000 }, bandeja: [], atualizado_em: null,
})
const cust = (ano: number) => custosFinanceirosSchema.parse({
  ...rel(ano), grupos: [], custos: serie(-180), fin: serie(-150), receita_bruta: serie(9000),
  ano_anterior_ytd: { custos: -120, fin: -90, receita_bruta: 8000 }, atualizado_em: null,
})
const prazos = prazosSchema.parse({
  atual: {
    data: '2026-10-15', saldo_receber: 1, saldo_pagar: 1, entrada_12m: 1, pagamento_12m: 1,
    janela_de: '2025-10-01', janela_ate: '2026-09-30', pmr: 40, pmp: 52.5, folga: 12.5,
  },
  serie: [], historico_desde: '2026-09-25',
})

const dados = (over: Partial<DadosGeral> = {}): DadosGeral => ({
  anos: [2025, 2026], anosDisponiveis: [2024, 2025, 2026], hoje: '2026-10-15',
  recebiveis: { ok: true, dados: recebiveis },
  prazos: { ok: true, dados: prazos },
  antecipacoes: [2025, 2026].map(ano => ({ ano, leitura: { ok: true as const, dados: ant(ano, ano === 2026 ? 1343423.51 : 5) } })),
  prejuizos: [2025, 2026].map(ano => ({ ano, leitura: { ok: true as const, dados: prej(ano) } })),
  custos: [2025, 2026].map(ano => ({ ano, leitura: { ok: true as const, dados: cust(ano) } })),
  podeGerir: false,
  ...over,
})

describe('faixaDoTopo — os 5 indicadores', () => {
  it('cinco, na ordem das seções', () => {
    expect(faixaDoTopo(dados()).map(i => i.chave)).toEqual(['inadimplencia', 'antecipacoes', 'prejuizos', 'custos', 'prazos'])
  })

  it('Inadimplência: SÓ a marcação, na posição da carga, "10 maiores = X%" sem nome, Δ contra a carga do mês anterior', () => {
    const i = faixaDoTopo(dados())[0]
    expect(i.estado).toBe('ok')
    expect(i.valor).toBe(fmtBRL2(195708.79))
    expect(i.escopo).toBe('na carga de 15/10')
    expect(i.apoio).toEqual(['20 títulos marcados', '10 maiores = 61,3%'])
    expect(i.referencia).toBe('vs carga de 25/09')
    expect(i.variacao?.pct).toBeCloseTo(((195708.79 - 150000) / 150000) * 100, 6)
    expect(i.variacao?.sentido).toBe('desfavoravel') // inadimplência subiu
    expect(JSON.stringify(i)).not.toMatch(/Cliente|pessoa/i)
  })

  it('Inadimplência sem carga: estado vazio com explicação (não zero)', () => {
    const semBase = recebiveisSchema.parse({
      ...recebiveis, carga: null, a_vencer: { n: 0, valor: 0 }, inadimplente: { n: 0, valor: 0, faixas: [] },
      concentracao: { top: [], valor_top: 0, pct_top: null }, comparativo: null, historico_desde: null,
    })
    const i = faixaDoTopo(dados({ recebiveis: { ok: true, dados: semBase } }))[0]
    expect(i).toMatchObject({ estado: 'vazio', valor: null })
    expect(i.mensagem).toMatch(/ainda não teve carga/)
  })

  it('Inadimplência sem comparativo (1ª carga): sem Δ nem referência', () => {
    const r = recebiveisSchema.parse({ ...recebiveis, comparativo: null })
    const i = faixaDoTopo(dados({ recebiveis: { ok: true, dados: r } }))[0]
    expect(i.variacao).toBeNull()
    expect(i.referencia).toBeNull()
  })

  it('fluxo usa o ano MAIS RECENTE selecionado, com "*" no parcial e o Δ no mesmo recorte do ano anterior', () => {
    const [, a, p, c] = faixaDoTopo(dados())
    expect(a.escopo).toBe('2026*')
    expect(a.valor).toBe(fmtBRL2(1343423.51))
    expect(a.referencia).toBe('vs 2025 (jan–out)')
    expect(a.apoio).toEqual(['14 antecipações', 'Última há 10 dias'])
    expect(a.variacao?.sentido).toBeNull() // volume antecipado: sem juízo
    expect(p.valor).toBe(fmtBRL2(-205629.09))
    expect(p.apoio).toEqual([`Recuperado ${fmtBRL2(80119.24)}`, `Líquido ${fmtBRL2(-125509.85)}`])
    expect(p.variacao?.sentido).toBe('desfavoravel')
    expect(c.valor).toBe(fmtBRL2(-180))
    expect(c.apoio).toHaveLength(1)
    expect(c.apoio[0]).toMatch(/2,0% da RB$/) // −2,0%: custo negativo sobre RB positiva
    expect(c.variacao?.sentido).toBe('desfavoravel')
  })

  it('selecionando só ano fechado: sem "*" e a referência é o ano anterior inteiro', () => {
    const d = dados({
      anos: [2025],
      antecipacoes: [{ ano: 2025, leitura: { ok: true, dados: ant(2025) } }],
      prejuizos: [{ ano: 2025, leitura: { ok: true, dados: prej(2025) } }],
      custos: [{ ano: 2025, leitura: { ok: true, dados: cust(2025) } }],
    })
    const [, a] = faixaDoTopo(d)
    expect(a.escopo).toBe('2025')
    expect(a.referencia).toBe('vs 2024')
  })

  it('Prazos: o destaque é a folga, com PMR e PMP de apoio e a janela no escopo', () => {
    const i = faixaDoTopo(dados())[4]
    expect(i.valor).toBe('+12,5 dias')
    expect(i.apoio).toEqual(['PMR 40,0 dias', 'PMP 52,5 dias'])
    expect(i.escopo).toContain('janela de 12 meses')
  })

  it('cada indicador degrada SOZINHO: uma leitura falha não derruba as outras', () => {
    const d = dados({
      recebiveis: { ok: false },
      custos: [{ ano: 2025, leitura: { ok: true, dados: cust(2025) } }, { ano: 2026, leitura: { ok: false } }],
    })
    const f = faixaDoTopo(d)
    expect(f.map(i => i.estado)).toEqual(['erro', 'ok', 'ok', 'erro', 'ok'])
    expect(f[0].valor).toBeNull()
  })

  it('o ano mais recente falhou: não usa o anterior em silêncio (erro, não número de outro ano)', () => {
    const d = dados({
      prejuizos: [{ ano: 2025, leitura: { ok: true, dados: prej(2025) } }, { ano: 2026, leitura: { ok: false } }],
    })
    expect(faixaDoTopo(d)[2].estado).toBe('erro')
  })

  it('prazos sem foto: vazio; leitura vazia de fluxo (lista []): erro', () => {
    const semFoto = prazosSchema.parse({ atual: null, serie: null, historico_desde: null })
    expect(faixaDoTopo(dados({ prazos: { ok: true, dados: semFoto } }))[4].estado).toBe('vazio')
    expect(faixaDoTopo(dados({ antecipacoes: [] }))[1].estado).toBe('erro')
  })
})
