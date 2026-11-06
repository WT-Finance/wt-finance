import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fixtureDreCentro } from '@/lib/dre-centro/fixture'
import { montarAnoCentro } from '@/lib/dre-centro/montar'
import { BLOCOS, EMPRESA } from '@/lib/dre-centro/empresa-sintetica'
import type { TabelaDreCentroProps } from './tabela-dre-centro'

// Render no servidor da DRE por centro (v6.5.1, mockup do GATE 1): a prova automatizada de
// que as três visões e os dois estados montam sem erro de runtime — a conferência visual
// depende de login. `.test.ts` ⇒ `createElement`, sem JSX.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/financeiro/dre',
  useSearchParams: () => new URLSearchParams(''),
}))

const { default: TabelaDreCentro } = await import('./tabela-dre-centro')
const { default: SeletorCentro } = await import('./seletor-centro')

const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS), 1_000_000)
const BASE: Omit<TabelaDreCentroProps, 'seletor'> = {
  leitura: { ok: true, anos: [ano] },
  anosDisponiveis: [2024, 2025, 2026],
  mesJanela: 11,
}
const render = (p: TabelaDreCentroProps) => renderToStaticMarkup(createElement(TabelaDreCentro, p))

describe('TabelaDreCentro', () => {
  it('um centro, Mensal: árvore, bloco de antecipação, memória e notas', () => {
    const html = render({ ...BASE, seletor: 'weddings' })
    for (const t of [
      'Demonstrativo de Resultado por Fluxo de Caixa · Weddings',
      '(=) Resultado operacional de caixa',
      '(+) Antecipação de recebíveis - C',
      '(−) Antecipação de recebíveis - D',
      '(−) Taxa de antecipação',
      '(=) Resultado de caixa',
      'Memória',
      'Saldo operacional acumulado',
      'Cobertura de centro em 2026',
      'Taxa ainda não lançada no Monde',
      'Total 2026*',
      'Realizado + Previsto',
    ]) expect(html).toContain(t)
    // anos sem cobertura desabilitados; o resultado do exercício não aparece com o rótulo antigo
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="2025 não tem centro de custo/)
    expect(html).not.toContain('(=) Resultado do exercício')
    expect(html).not.toContain('Quem cobre quem')
  })

  it('CSC: AV sobre a receita da empresa (AV*)', () => {
    expect(render({ ...BASE, seletor: 'csc' })).toContain('AV*')
  })

  it('Lado a lado: colunas por centro, Total e o card Quem cobre quem', () => {
    const html = render({ ...BASE, seletor: 'lado' })
    for (const t of ['Centros lado a lado', '>Trips<', '>Weddings<', '>Corp<', '>CSC<', '>Sem centro<', '>Total<', 'Quem cobre quem', 'Total das fontes']) {
      expect(html).toContain(t)
    }
  })

  it('estados vazio e erro: mensagem no lugar da tabela', () => {
    expect(render({ ...BASE, seletor: 'trips', leitura: { ok: false, motivo: 'vazio' } }))
      .toContain('A base de centro de custo ainda não foi carregada')
    expect(render({ ...BASE, seletor: 'trips', leitura: { ok: false, motivo: 'erro' } }))
      .toContain('Não foi possível carregar a DRE por centro de custo')
  })
})

describe('SeletorCentro', () => {
  it('Empresa + cinco centros + Lado a lado, com o atual pressionado', () => {
    const html = renderToStaticMarkup(createElement(SeletorCentro, { atual: 'empresa' }))
    for (const t of ['Empresa', 'Trips', 'Weddings', 'Corp', 'CSC', 'Sem centro', 'Lado a lado']) expect(html).toContain(`>${t}<`)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Empresa</)
  })
})
