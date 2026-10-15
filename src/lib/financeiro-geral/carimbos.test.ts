import { describe, expect, it } from 'vitest'
import { carimboDoFluxo, carimboGeral, carimboMaisRecente } from './carimbos'
import type { DadosGeral } from './tipos'

describe('carimboMaisRecente', () => {
  it('escolhe pelo INSTANTE, não pela string (offsets diferentes)', () => {
    // 10:00-03:00 = 13:00Z; 12:00+00:00 = 12:00Z → o primeiro é o mais recente
    expect(carimboMaisRecente(['2026-10-15T12:00:00+00:00', '2026-10-15T10:00:00-03:00'])).toBe('2026-10-15T10:00:00-03:00')
  })
  it('ignora nulo, vazio e lixo; vazio → null', () => {
    expect(carimboMaisRecente([null, undefined, '', 'não é data'])).toBeNull()
    expect(carimboMaisRecente([])).toBeNull()
    expect(carimboMaisRecente([null, '2026-10-01T00:00:00Z'])).toBe('2026-10-01T00:00:00Z')
  })
})

describe('carimboDoFluxo', () => {
  it('o mais recente entre os anos', () => {
    expect(carimboDoFluxo([
      { atualizado_em: '2026-10-01T00:00:00Z' }, { atualizado_em: null }, { atualizado_em: '2026-10-09T00:00:00Z' },
    ])).toBe('2026-10-09T00:00:00Z')
  })
})

describe('carimboGeral', () => {
  const base: DadosGeral = {
    anos: [2026], anosDisponiveis: [2026], hoje: '2026-10-15', podeGerir: false,
    recebiveis: { ok: false }, prazos: { ok: false }, antecipacoes: [], prejuizos: [], custos: [],
  }
  it('sem nenhuma fonte carregada → null (o carimbo some, o título fica)', () => {
    expect(carimboGeral(base)).toBeNull()
  })
  it('lê a gravação da carga de contas a receber quando é a fonte mais nova', () => {
    const d: DadosGeral = {
      ...base,
      recebiveis: {
        ok: true,
        dados: {
          carga: { carga_id: 'x', data_posicao: '2026-10-15', gravado_em: '2026-10-15T14:00:00-03:00' },
          a_vencer: { n: 0, valor: 0 }, inadimplente: { n: 0, valor: 0, faixas: [] }, marcacao_em_aberto: [],
          concentracao: { top: [], valor_top: 0, pct_top: null }, recuperado_ano: { ano: 2026, n: 0, valor: 0 },
          comparativo: null, evolucao: [], historico_desde: null,
        },
      },
    }
    expect(carimboGeral(d)).toBe('2026-10-15T14:00:00-03:00')
  })
})
