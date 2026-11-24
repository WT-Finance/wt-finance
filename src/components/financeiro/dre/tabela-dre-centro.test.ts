import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { fixtureDreCentro } from '@/lib/dre-centro/fixture'
import { montarAnoCentro } from '@/lib/dre-centro/montar'
import { BLOCOS, EMPRESA } from '@/lib/dre-centro/empresa-sintetica'
import { alternarCentro, centrosComPill, selecaoInicial, type CentroSelecionavel } from '@/lib/dre-centro/centros'
import type { TabelaDreCentroProps } from './tabela-dre-centro'

// Render no servidor da DRE por centro (v6.5.1, mockup do GATE 1): a prova automatizada de
// que as três visões e os dois estados montam sem erro de runtime — a conferência visual
// depende de login. `.test.ts` ⇒ `createElement`, sem JSX.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/financeiro/dre',
  useSearchParams: () => new URLSearchParams(''),
}))
// O ListDrawer abre por portal no document.body — inexistente no render estático. Só ele é trocado por um
// invólucro com o título; o conteúdo do drawer é o real.
vi.mock('@/components/shared/list-drawer', async () => {
  const { createElement: h } = await import('react')
  return {
    default: ({ titulo, subtitulo, children, rodape }: { titulo: string; subtitulo?: string; children: unknown; rodape?: unknown }) =>
      h('div', { 'data-drawer': titulo },
        h('p', { 'data-subtitulo': '' }, subtitulo ?? ''),
        h('div', { 'data-rolagem': '' }, children as never),
        h('div', { 'data-rodape': '' }, rodape as never)),
  }
})

const { default: TabelaDreCentro } = await import('./tabela-dre-centro')
const { default: SeletorCentro } = await import('./seletor-centro')
const { default: RateioCscDrawer } = await import('./rateio-csc-drawer')

const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS))
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
      '(=) RESULTADO OPERACIONAL DE CAIXA',
      '(+) Antecipação de recebíveis - C',
      '(−) Antecipação de recebíveis - D',
      '(−) Taxa de antecipação',
      '(=) RESULTADO DE CAIXA',
      'Memória',
      'Saldo operacional acumulado',
      'Total 2026',
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

  it('CSC: AV igual à dos demais centros (sem AV* nem a receita da empresa)', () => {
    const html = render({ ...BASE, seletorInicial: 'csc' })
    expect(html).not.toContain('AV*')
    expect(html).not.toContain('Receita Bruta da empresa')
  })

  // Pedidos do Yan no PR #311: "Lado a lado" virou "Todos", abre em Consolidado; Mensal = meses empilhados, sem acumulado.
  it('abre em Todos › Consolidado: um bloco por ano com os 5 centros e a AV e o Total do YTD', () => {
    const html = render(BASE)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todos</)
    expect(html).toMatch(/aria-pressed="true"[^>]*>Consolidado</)
    expect(html).not.toContain('Lado a lado')
    for (const t of ['>Trips<', '>Weddings<', '>Corporativo<', '>CSC<', '>Sem centro<', 'YTD 26', 'Total YTD 26']) {
      expect(html).toContain(t)
    }
    // um só ano coberto: cada centro uma vez no cabeçalho, sem blocos de mês
    expect(html.match(/>Weddings<\/th>/g)?.length).toBe(1)
    // pedidos do Yan (24/11): sem o "Quem cobre quem" e sem a frase do Δ% contra o ano sem centro
    for (const t of ['Quem cobre quem', 'Total das fontes', 'Sem Δ%']) expect(html).not.toContain(t)
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
    expect(linha('(=) RESULTADO DE CAIXA')).not.toContain('var(--warning')
    expect(linha('(=) RESULTADO OPERACIONAL DE CAIXA')).not.toContain('var(--warning')
  })

  // Seleção cumulativa (pedido do Yan no PR #311): alguns centros = colunas só deles, Total = soma deles.
  it('dois centros marcados: colunas só deles, sem Sem centro e sem Quem cobre quem; o Total avisa que é parcial', () => {
    const html = render({ ...BASE, seletorInicial: ['trips', 'corp'] })
    expect(html).toMatch(/aria-pressed="true"[^>]*>Consolidado</)
    expect(html.match(/>Trips<\/th>/g)?.length).toBe(1)
    expect(html.match(/>Corporativo<\/th>/g)?.length).toBe(1)
    for (const t of ['>Weddings</th>', '>CSC</th>', '>Sem centro</th>', 'Quem cobre quem']) expect(html).not.toContain(t)
    expect(html).toContain('Soma dos centros marcados')
    expect(html).toMatch(/aria-pressed="false"[^>]*>Todos</)
  })

  it('CSC vem primeiro nas pills e nas colunas (pedido do Yan no PR #311)', () => {
    const html = render(BASE)
    const ordem = (re: RegExp) => [...html.matchAll(re)].map(m => m[1])
    expect(ordem(/<button[^>]*>(CSC|Trips|Weddings|Corporativo)<\/button>/g)).toEqual(['CSC', 'Trips', 'Weddings', 'Corporativo'])
    expect(ordem(/>(CSC|Trips|Weddings|Corporativo|Sem centro)<\/th>/g)).toEqual(['CSC', 'Trips', 'Weddings', 'Corporativo', 'Sem centro'])
  })

  // Pedido do Yan no PR #311: sem asterisco de "ano em curso" — como a tabela da Empresa ("YTD 26").
  it('nenhum rótulo com asterisco, em nenhuma visão', () => {
    for (const p of [
      BASE,
      { ...BASE, visaoLadoInicial: 'mensal' as const },
      { ...BASE, seletorInicial: 'weddings' as const },
      { ...BASE, seletorInicial: ['trips', 'corp'] as const },
    ]) {
      expect(render(p)).not.toMatch(/(YTD \d{2}|Total( YTD)? \d{2,4})\*/)
    }
  })

  it('estados vazio e erro: mensagem no lugar da tabela', () => {
    expect(render({ ...BASE, seletorInicial: 'trips', leitura: { ok: false, motivo: 'vazio' } }))
      .toContain('A base de centro de custo ainda não foi carregada')
    expect(render({ ...BASE, seletorInicial: 'trips', leitura: { ok: false, motivo: 'erro' } }))
      .toContain('Não foi possível carregar a DRE por centro de custo')
  })
})

describe('SeletorCentro', () => {
  const sel = (cs: CentroSelecionavel[]) =>
    renderToStaticMarkup(createElement(SeletorCentro, { selecao: new Set(cs), onAlternar: () => {}, onTodos: () => {} }))
  const pill = (html: string, rotulo: string) => html.match(new RegExp(`<button[^>]*>${rotulo}</button>`))?.[0] ?? ''

  it('quatro centros + Todos (sem Empresa: ela é a tabela de cima; sem pill de Sem centro)', () => {
    const html = sel(['csc'])
    for (const t of ['Trips', 'Weddings', 'Corporativo', 'CSC', 'Todos']) expect(html).toContain(`>${t}<`)
    for (const t of ['Empresa', 'Sem centro', 'Lado a lado']) expect(html).not.toContain(`>${t}<`)
    // sem o rótulo "Centro de custo ?" visível (pedido do Yan no PR #311); o nome fica só no aria-label do grupo
    expect(html).not.toMatch(/>\s*Centro de custo/)
    expect(html).toContain('aria-label="Centro de custo"')
    expect(html).toMatch(/aria-pressed="true"[^>]*>CSC</)
  })

  it('seleção parcial: os marcados no estilo da seleção normal, Todos apagado', () => {
    const html = sel(['trips', 'corp'])
    expect(pill(html, 'Trips')).toContain('aria-pressed="true"')
    expect(pill(html, 'Trips')).toContain('background:var(--brand-soft)')
    expect(pill(html, 'Weddings')).toContain('aria-pressed="false"')
    expect(pill(html, 'Todos')).toContain('aria-pressed="false"')
  })

  it('as quatro marcadas: acende Todos e os centros ficam no cinza mais escuro (≠ seleção normal)', () => {
    const html = sel(['trips', 'weddings', 'corp', 'csc'])
    expect(pill(html, 'Todos')).toContain('aria-pressed="true"')
    expect(pill(html, 'Todos')).toContain('background:var(--brand-soft)')
    for (const c of ['Trips', 'Weddings', 'Corporativo', 'CSC']) {
      expect(pill(html, c)).toContain('aria-pressed="true"')
      expect(pill(html, c)).toContain('color-mix(in srgb, var(--brand) 30%, var(--brand-soft))')
      expect(pill(html, c)).not.toContain('background:var(--brand-soft)')
    }
  })
})

describe('seleção cumulativa (módulo puro)', () => {
  it('alternar marca e desmarca; o último marcado não sai', () => {
    let s = selecaoInicial('trips')
    s = alternarCentro(s, 'corp')
    expect([...s].sort()).toEqual(['corp', 'trips'])
    s = alternarCentro(s, 'trips')
    expect([...s]).toEqual(['corp'])
    expect([...alternarCentro(s, 'corp')]).toEqual(['corp'])
  })

  it('com Todos aceso, clicar num centro marca só ele e desmarca os outros', () => {
    const todos = selecaoInicial('lado')
    expect([...alternarCentro(todos, 'weddings')]).toEqual(['weddings'])
    // fora do Todos segue cumulativo: três marcados + o quarto = Todos de novo
    const tres = selecaoInicial(['trips', 'weddings', 'corp'])
    expect(alternarCentro(tres, 'csc').size).toBe(4)
  })

  it('com o rateio ligado o CSC sai das pills; "Todos" = os três que sobram', () => {
    const tres = centrosComPill(true)
    expect(tres).toEqual(['trips', 'weddings', 'corp'])
    expect(centrosComPill(false)).toEqual(['csc', 'trips', 'weddings', 'corp'])
    // com os três marcados (Todos aceso), clicar num deles marca só ele
    expect([...alternarCentro(new Set(tres), 'corp', tres)]).toEqual(['corp'])
  })

  it('abertura: Todos (e "Sem centro", sem pill) = os quatro marcados; lista vazia = os quatro', () => {
    expect(selecaoInicial('lado').size).toBe(4)
    expect(selecaoInicial('sem_centro').size).toBe(4)
    expect(selecaoInicial([]).size).toBe(4)
    expect([...selecaoInicial(['csc', 'trips'])].sort()).toEqual(['csc', 'trips'])
  })
})

// ── Rateio do CSC (0308, decisões do Yan no PR #311) ─────────────────────────
describe('Rateio do CSC no card', () => {
  const salvar = async () => ({ ok: true })
  const salvo = { itens: [{ categoria_id: null, bloco_chave: 'RH', pct_trips: 50, pct_weddings: 30, pct_corp: 20 }], atualizado_em: null }
  const pill = (html: string, rotulo: string) => html.match(new RegExp(`<button[^>]*>${rotulo}</button>`))?.[0] ?? ''

  it('sem a action de salvar não há botão Rateio; com ela há, depois de "Todos"', () => {
    expect(render(BASE)).not.toContain('>Rateio<')
    const html = render({ ...BASE, salvarRateio: salvar, rateio: { itens: [], atualizado_em: null } })
    expect(html.indexOf('>Rateio<')).toBeGreaterThan(html.indexOf('>Todos<'))
    // não existe mais a chave "Com rateio": o estado é a cor da própria pill (decisão do Yan, 24/11)
    expect(html).not.toContain('Com rateio')
  })

  // A página entrega UMA leitura, já com o rateio aplicado (get_dre_caixa_centro_rateio; sem rateio salvo ela é a sem
  // rateio). Buscar as duas estourava o timeout de 8 s do banco (logs do preview, 24/11).
  it('sem rateio salvo: pill BRANCA com contorno e letras âmbar (desligado) e a coluna CSC aparece', () => {
    const html = render({ ...BASE, salvarRateio: salvar, rateio: { itens: [], atualizado_em: null } })
    expect(pill(html, 'Rateio')).toContain('aria-pressed="false"')
    expect(pill(html, 'Rateio')).toContain('background:var(--surface)')
    expect(pill(html, 'Rateio')).toContain('border-color:var(--warning)')
    expect(pill(html, 'Rateio')).toContain('color:var(--warning-deep)')
    expect(pill(html, 'Rateio')).not.toContain('var(--warning-bg)')
    expect(html).toContain('YTD 26')
    expect(pill(html, 'CSC')).not.toContain('disabled=""')
    expect(html).toContain('>CSC</th>')
  })

  it('rateio ligado: pill CSC APAGADA (visível, desabilitada) e sem coluna CSC; o Total avisa que o CSC segue somado', () => {
    const html = render({ ...BASE, salvarRateio: salvar, rateio: salvo })
    const csc = pill(html, 'CSC')
    expect(csc).toContain('disabled=""')
    expect(csc).toContain('aria-pressed="false"')
    expect(csc).toContain('está repartido entre Trips, Weddings e Corporativo')
    expect(html).not.toContain('>CSC</th>')
    // Todos = os três que sobram com pill, acende
    expect(html).toMatch(/aria-pressed="true"[^>]*>Todos</)
    expect(html).toContain('o que ficou no CSC sem percentual continua somado aqui')
  })

  it('com rateio salvo: pill ÂMBAR (ligado)', () => {
    const html = render({ ...BASE, salvarRateio: salvar, rateio: salvo })
    expect(pill(html, 'Rateio')).toContain('aria-pressed="true"')
    expect(pill(html, 'Rateio')).toContain('background:var(--warning-bg)')
    expect(pill(html, 'Rateio')).toContain('color:var(--warning-deep)')
  })
})

describe('RateioCscDrawer', () => {
  const grupos = [
    { chave: 'ADM', rotulo: '(−) Despesas Administrativas', categorias: [{ categoria_id: 10, rotulo: 'Aluguel' }] },
    { chave: 'RH', rotulo: '(−) Despesas Operacionais RH', categorias: [{ categoria_id: 20, rotulo: 'Salários' }] },
  ]
  const draw = (salvo: Parameters<typeof RateioCscDrawer>[0]['salvo']) => renderToStaticMarkup(createElement(RateioCscDrawer, {
    grupos, salvo, onSalvar: async () => ({ ok: true }), onClose: () => {},
  }))
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A categoria leva o grupo no rótulo acessível ("Grupo › Categoria" — nomes repetem entre grupos).
  const input = (html: string, rotulo: string, centro: string) =>
    html.match(new RegExp(`<input[^>]*aria-label="${esc(rotulo)} — % ${centro}"[^>]*>`))?.[0] ?? ''

  it('grupo preenchido trava as categorias dele, que mostram o % do grupo; grupo vazio deixa a categoria livre', () => {
    const html = draw({
      itens: [
        { categoria_id: null, bloco_chave: 'RH', pct_trips: 50, pct_weddings: 30, pct_corp: 20 },
        { categoria_id: 10, bloco_chave: null, pct_trips: 100, pct_weddings: 0, pct_corp: 0 },
      ],
      atualizado_em: null,
    })
    expect(html).toContain('data-drawer="Rateio do CSC"')
    expect(html).toContain('Reparte o que foi alocado como CSC para os demais centros de custo (Trips, Weddings e Corporativo).')
    // a tabela tem contorno próprio
    expect(html).toMatch(/<div class="overflow-hidden rounded-lg border border-wt-border"><table/)
    const salarios = input(html, '(−) Despesas Operacionais RH › Salários', 'Trips')
    expect(salarios).toContain('disabled=""')
    expect(salarios).toContain('value="50"')
    expect(html).toContain('(pelo grupo)')
    const aluguel = input(html, '(−) Despesas Administrativas › Aluguel', 'Trips')
    expect(aluguel).not.toContain('disabled=""')
    expect(aluguel).toContain('value="100"')
    // cabeçalho só com o nome do centro; o "%" é sufixo dentro de cada campo (pedido do Yan)
    for (const c of ['Trips', 'Weddings', 'Corporativo']) {
      expect(html).toMatch(new RegExp(`<th[^>]*>${c}</th>`))
      expect(html).not.toContain(`${c} %</th>`)
    }
    expect(html).toMatch(/<input[^>]*aria-label="\(−\) Despesas Administrativas › Aluguel — % Trips"[^>]*\/><span aria-hidden="true"[^>]*>%<\/span>/)
    // o rodapé (Cancelar/Salvar) vai no slot próprio do ListDrawer, fora da área rolável
    expect(html).toMatch(/data-rodape=""[^]*>Aplicar</)
    expect(html.split('data-rodape')[0]).not.toContain('>Aplicar<')
    expect(html).not.toContain('Salvar rateio') // o botão virou "Aplicar" (pedido do Yan)
    // Limpar e Preencher vazios no rodapé, antes de Cancelar/Aplicar
    const rodape = html.split('data-rodape')[1]
    for (const b of ['Limpar', 'Preencher vazios', 'Cancelar', 'Aplicar']) expect(rodape).toMatch(new RegExp(`<button[^>]*>${b}</button>`))
    expect(rodape.indexOf('>Preencher vazios<')).toBeLessThan(rodape.indexOf('>Aplicar<'))
  })

  it('categorias de mesmo nome em grupos diferentes: rótulos acessíveis e ids de erro distintos (revisor, MÉDIO)', () => {
    const repetidas = [
      { chave: 'ADM', rotulo: 'ADM', categorias: [{ categoria_id: 1, rotulo: 'Outros' }] },
      { chave: 'RH', rotulo: 'RH', categorias: [{ categoria_id: 2, rotulo: 'Outros' }] },
    ]
    const html = renderToStaticMarkup(createElement(RateioCscDrawer, {
      grupos: repetidas, salvo: { itens: [], atualizado_em: null }, onSalvar: async () => ({ ok: true }), onClose: () => {},
    }))
    expect(html).toContain('aria-label="ADM › Outros — % Trips"')
    expect(html).toContain('aria-label="RH › Outros — % Trips"')
  })

  it('percentual órfão (grupo que saiu da DRE) é avisado; leitura falha bloqueia o Salvar', () => {
    const orfao = draw({ itens: [{ categoria_id: null, bloco_chave: 'SUMIU', pct_trips: 100, pct_weddings: 0, pct_corp: 0, ativo: false }], atualizado_em: null })
    expect(orfao).toContain('não está mais na DRE')
    const falha = draw(null)
    expect(falha).toContain('Não foi possível ler o rateio salvo')
    expect(falha).toMatch(/<button[^>]*disabled=""[^>]*>Aplicar<\/button>/)
  })
})
