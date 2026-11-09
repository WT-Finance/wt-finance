import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DreMensalLike, DreLinha, ConsolidadoAno } from '@/lib/dre/schemas'
import { chaveDeLinha } from '@/lib/dre/identidade'

// ── Guarda da visão Empresa (v6.5.1, inv. 9) ─────────────────────────────────
// A DRE por centro de custo nasce num componente IRMÃO e a `TabelaDre` só ganha `export` nos
// primitivos que o irmão reusa. Este snapshot foi gravado ANTES de qualquer mudança no arquivo:
// enquanto ele passar, o markup da tabela de hoje (as duas visões que o render estático alcança —
// Consolidado, que é o default, e o fail-safe sem dados — e o call-site de competência) é o mesmo
// byte a byte. "Não toquei no caminho da Empresa" vira medida, não afirmação.
// `.test.ts` (o include do vitest) ⇒ `createElement`, sem JSX.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/financeiro/dre',
  useSearchParams: () => new URLSearchParams(''),
}))

const { default: TabelaDre } = await import('./tabela-dre')

const m = (base: number): number[] => Array.from({ length: 12 }, (_, i) => Math.round((base + i * 37.5) * 100) / 100)

const LINHAS: DreLinha[] = [
  { t: 'blocoH', chave: 'ENT_H', rotulo: '(+) Entradas', estrela: false, meses: m(1000), venc: 0, total: 12000 },
  { t: 'cat', g: 'ENT_H', categoria_id: 1, rotulo: 'Entrada de clientes', estrela: false, meses: m(1000), venc: 10, total: 12000 },
  { t: 'tot', chave: 'RB_H', rotulo: '(=) Receita bruta', estrela: false, meses: m(1000), venc: 0, total: 12000 },
  { t: 'sub', chave: 'ADM', rotulo: '(−) Despesas administrativas', estrela: true, meses: m(-300), venc: 0, total: -3600 },
  { t: 'cat', g: 'ADM', categoria_id: 2, rotulo: 'Honorários', estrela: false, meses: m(-300), venc: 0, total: -3600 },
  { t: 'sub', chave: 'FIN', rotulo: '(+/−) Resultado financeiro', estrela: false, meses: m(-20), venc: 0, total: -240 },
  { t: 'cat', g: 'FIN', categoria_id: 38, rotulo: 'Taxa de Antecipação', estrela: false, meses: m(-20), venc: 0, total: -240 },
  { t: 'tot', chave: 'REX', rotulo: '(=) Resultado do exercício', estrela: false, meses: m(680), venc: 0, total: 8160 },
]

function payload(ano: number, relacao: DreMensalLike['relacao'], mes: number | null): DreMensalLike {
  return {
    ano, hoje: `${ano}-11-06`, relacao, mes_corrente: mes, token_estrutura: null,
    linhas: LINHAS.map(l => ({ ...l, prev_corrente: relacao === 'corrente' ? 50 : null })),
    bandeja: [{ categoria_id: 99, rotulo: 'Órfã', grupo_monde: 'Outros', meses: m(1), venc: 0, total: 12 }],
  }
}

function consolidado(ano: number, corrente: boolean): ConsolidadoAno {
  const porLinha: ConsolidadoAno['porLinha'] = {}
  for (const l of LINHAS) {
    const k = chaveDeLinha(l)
    if (k) porLinha[k] = { total: l.total, ytd: l.meses.slice(0, 10).reduce((s, v) => s + v, 0), venc: l.venc }
  }
  return { ano, corrente, porLinha }
}

const BASE = {
  ano: 2026,
  anosDisponiveis: [2024, 2025, 2026],
  anosSeguintes: [],
  consolidadoAnos: [consolidado(2024, false), consolidado(2025, false), consolidado(2026, true)],
  mesJanela: 10,
}

function render(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(TabelaDre, props as never))
}

describe('TabelaDre — markup congelado (guarda da visão Empresa)', () => {
  it('caixa, ano corrente (Consolidado + Realizado, o default)', () => {
    expect(render({ ...BASE, dados: payload(2026, 'corrente', 11) })).toMatchSnapshot()
  })

  it('caixa, sem dados (fail-safe)', () => {
    expect(render({ ...BASE, dados: null })).toMatchSnapshot()
  })

  it('competência (semPrevisto, título e parâmetro próprios)', () => {
    expect(render({
      ...BASE,
      dados: payload(2025, 'fechado', null),
      ano: 2025,
      titulo: 'Demonstrativo de Resultado por Competência',
      paramAno: 'anoComp',
      semPrevisto: true,
      mesParcial: null,
    })).toMatchSnapshot()
  })
})
