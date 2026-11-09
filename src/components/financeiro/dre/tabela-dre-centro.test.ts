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

const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS), Array.from({ length: 12 }, () => 100_000))
const BASE: TabelaDreCentroProps = {
  leitura: { ok: true, anos: [ano] },
  anosDisponiveis: [2024, 2025, 2026],
  mesJanela: 11,
}
const render = (p: TabelaDreCentroProps) => renderToStaticMarkup(createElement(TabelaDreCentro, p))

describe('TabelaDreCentro', () => {
  it('um centro, Mensal: árvore, bloco de antecipação, memória e notas', () => {
    const html = render({ ...BASE, seletorInicial: 'weddings' })
    for (const t of [
      'Demonstrativo de Resultado por Centro de Custo',
      '(=) Resultado operacional de caixa',
      '(+) Antecipação de recebíveis - C',
      '(−) Antecipação de recebíveis - D',
      '(−) Taxa de antecipação',
      '(=) Resultado de caixa',
      'Memória',
      'Saldo operacional acumulado',
      'Total 2026*',
    ]) expect(html).toContain(t)
    // pedidos do Yan no PR #311: sem notas sob a tabela e sem as pills Realizado / Realizado + Previsto
    for (const t of ['Cobertura de centro', 'Taxa ainda não lançada', 'Tomado e ainda não devolvido', 'Memória (fora das somas)',
      '2026 em curso', 'Realizado + Previsto', 'Só o que já aconteceu', 'Por que não há previsto']) expect(html).not.toContain(t)
    // anos sem cobertura desabilitados; o resultado do exercício não aparece com o rótulo antigo
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="2025 não tem centro de custo/)
    expect(html).not.toContain('(=) Resultado do exercício')
    expect(html).not.toContain('Quem cobre quem')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Weddings</)
  })

  it('CSC: AV sobre a receita da empresa (AV*)', () => {
    expect(render({ ...BASE, seletorInicial: 'csc' })).toContain('AV*')
  })

  // Pedidos do Yan no PR #311: "Lado a lado" virou "Todos", abre em Consolidado; Mensal = meses empilhados, sem acumulado.
  it('abre em Todos › Consolidado: um bloco por ano com os 5 centros e a AV, Total do YTD e o Quem cobre quem', () => {
    const html = render(BASE)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todos</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Consolidado</)
    expect(html).not.toContain('Lado a lado')
    for (const t of ['>Trips<', '>Weddings<', '>Corp<', '>CSC<', '>Sem centro<', 'YTD 26*', 'Total YTD 26*', 'Quem cobre quem', 'Total das fontes']) {
      expect(html).toContain(t)
    }
    // um só ano coberto: cada centro uma vez no cabeçalho, sem blocos de mês (o "Jan" que existe é o do Quem cobre quem)
    expect(html.match(/>Weddings<\/th>/g)?.length).toBe(1)
  })

  it('Todos › Mensal: um bloco por mês com os 5 centros, sem o acumulado, e o Total', () => {
    const html = render({ ...BASE, visaoLadoInicial: 'mensal' })
    expect(html).toMatch(/aria-pressed="true"[^>]*>Mensal</)
    for (const t of ['>Jan<', '>Out<', '>Total<', '>Sem centro<']) expect(html).toContain(t)
    expect(html).not.toContain('Acumulado')
    // o mês corrente (parcial) também vira bloco, com o sufixo em caixa normal
    expect(html).toMatch(/Nov<span[^>]*>\s*·\s*parcial<\/span>/)
    // no cabeçalho da tabela, cada centro aparece uma vez por mês (11)
    expect(html.match(/>Weddings<\/th>/g)?.length).toBe(11)
  })

  it('linhas de antecipação no âmbar do previsto (a mesma régua da DRE de caixa da Empresa)', () => {
    const html = render({ ...BASE, seletorInicial: 'weddings' })
    const linha = (rotulo: string) => html.split('<tr').find(tr => tr.includes(rotulo)) ?? ''
    for (const r of ['(+) Antecipação de recebíveis - C', '(−) Antecipação de recebíveis - D', '(−) Taxa de antecipação']) {
      expect(linha(r)).toContain('var(--warning-bg)')
    }
    expect(linha('(=) Resultado de caixa')).not.toContain('var(--warning')
    expect(linha('(=) Resultado operacional de caixa')).not.toContain('var(--warning')
  })

  it('estados vazio e erro: mensagem no lugar da tabela', () => {
    expect(render({ ...BASE, seletorInicial: 'trips', leitura: { ok: false, motivo: 'vazio' } }))
      .toContain('A base de centro de custo ainda não foi carregada')
    expect(render({ ...BASE, seletorInicial: 'trips', leitura: { ok: false, motivo: 'erro' } }))
      .toContain('Não foi possível carregar a DRE por centro de custo')
  })
})

describe('SeletorCentro', () => {
  it('quatro centros + Todos (sem Empresa: ela é a tabela de cima; sem pill de Sem centro), com o atual pressionado', () => {
    const html = renderToStaticMarkup(createElement(SeletorCentro, { atual: 'csc', onEscolher: () => {} }))
    for (const t of ['Trips', 'Weddings', 'Corp', 'CSC', 'Todos']) expect(html).toContain(`>${t}<`)
    for (const t of ['Empresa', 'Sem centro', 'Lado a lado']) expect(html).not.toContain(`>${t}<`)
    expect(html).toMatch(/aria-pressed="true"[^>]*>CSC</)
  })
})
