import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  NAV_GROUPS, NAV_ITEMS, hrefAtivoDoGrupo, itemAtivo, itensVisiveis, subVisivel,
} from './nav-model'
import { AREAS, areasDaRota, type Area } from '@/lib/auth/areas'

// ─────────────────────────────────────────────────────────────────────────────────────
// VARREDURA DE NÃO-REGRESSÃO DA NAVEGAÇÃO (v5.6.0/M2 — invariante 12 do briefing).
//
// A seção nova "Gestão de Pessoas" mexeu na navegação RAIZ, que afeta TODAS as páginas
// (lição da v3.2). O briefing pedia "checklist de regressão em cada rota existente antes do
// PR da M2"; checklist em prosa é verificado uma vez e envelhece. Aqui ele é MECÂNICO: roda
// no `npm test` desta e de todas as versões futuras.
//
// O que a varredura pega:
//   1. rota de página nova (ou existente) que não aparece na sidebar nem foi declarada como
//      deliberadamente fora dela — o caso "a tela existe e ninguém acha";
//   2. item de sidebar apontando para rota que não existe — o 404 que só o usuário descobre;
//   3. rota que acende DOIS itens de 1º nível, ou nenhum — colisão de prefixo (o risco direto
//      de uma seção nova: `/gestao-pessoas` × `/gestao-pessoas/inventario`);
//   4. divergência entre QUEM VÊ o item e QUEM ALCANÇA a rota — a "quarta ponta" que a M1 já
//      pagou uma vez (item visível + `requireArea` negando = usuário jogado em /sem-acesso);
//   5. desktop e drawer mobile saindo de moldes diferentes.
//
// Desktop e mobile compartilham o MESMO `SidebarContent` (logo, o mesmo modelo) — a sonda de
// fonte no fim deste arquivo é o que garante que continuem compartilhando.
// ─────────────────────────────────────────────────────────────────────────────────────

const RAIZ_APP = resolve(__dirname, '../../app')

/** Toda rota de página do App Router, lida do disco (a fonte da verdade não é uma lista minha). */
function rotasDeDisco(dir = RAIZ_APP, prefixo = ''): string[] {
  const achadas: string[] = []
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (entrada.isDirectory()) {
      // Convenção do Next: `_pasta` é privada e `(grupo)` não entra na URL.
      if (entrada.name.startsWith('_')) continue
      const segmento = entrada.name.startsWith('(') ? '' : `/${entrada.name}`
      achadas.push(...rotasDeDisco(join(dir, entrada.name), prefixo + segmento))
    } else if (entrada.name === 'page.tsx' || entrada.name === 'page.ts') {
      achadas.push(prefixo === '' ? '/' : prefixo)
    }
  }
  return achadas
}

/** Rotas SEM sessão ou SEM área (o proxy/guard as isenta) — não têm por que estar na sidebar. */
const PUBLICAS = new Set([
  '/', '/login', '/solicitar-acesso', '/auth/confirm', '/trocar-senha', '/sem-acesso',
])

/**
 * Rotas protegidas que ficam FORA da sidebar de propósito. Cada uma com o motivo — é este
 * campo que obriga a próxima versão a DECIDIR (entra na navegação ou entra aqui) em vez de
 * deixar a tela órfã por esquecimento.
 */
const FORA_DA_SIDEBAR: Record<string, string> = {
  '/admin/solicitacoes':                'v4.18/M5: alcançada pelo botão "Gerenciar solicitações" dentro de Solicitações',
  '/admin/solicitacoes/movimentacoes':  'v4.18/M5: sub-rota de /admin/solicitacoes',
  '/admin/api-externa':                 'v5.4.0/M2: chaves de integração, alcançada por link direto (só gestão)',
  '/admin/api-externa/documentacao':    'v5.4.0/Round4: documentação para o integrador, por link',
  '/admin/uploads/financeiro':          'sub-rota do Upload de Arquivos, alcançada de dentro da tela',
  '/financeiro':                        'página do grupo Financeiro; a sidebar leva direto às subabas',
  '/financeiro/dre/estrutura':          'v5.3.0: editor da estrutura, alcançado de dentro da DRE',
  '/financeiro/dre/estrutura-competencia': 'v5.8.0: editor da estrutura do regime de competência, alcançado de dentro da DRE (irmã da de cima)',
  '/metas/comparacao':                  'v5.1.9: Modo de Comparação, aberto pelo botão do Acompanhamento',
  '/metas/tv':                          'v5.1.0: Modo TV (tela cheia), aberto por link do Acompanhamento',
}

/** Todos os hrefs que a sidebar oferece (1º nível navegável + subabas). */
const HREFS_NAVEGAVEIS: { href: string; visibilidade: Area[]; onde: string }[] = [
  ...NAV_ITEMS.filter(i => !NAV_GROUPS[i.href]).map(i => ({
    href: i.href,
    visibilidade: i.areasAny ?? (i.area ? [i.area] : []),
    onde: `item "${i.label}"`,
  })),
  ...Object.entries(NAV_GROUPS).flatMap(([pai, subs]) => subs.map(s => ({
    href: s.href,
    visibilidade: s.areasAny ?? [s.area],
    onde: `subaba "${s.label}" de ${pai}`,
  }))),
]

const ROTAS = rotasDeDisco()

describe('inventário de rotas × sidebar', () => {
  it('achou as rotas do App Router no disco (a varredura não pode rodar vazia)', () => {
    expect(ROTAS.length).toBeGreaterThan(20)
    expect(ROTAS).toContain('/gestao-pessoas/inventario')
    expect(ROTAS).toContain('/executiva')
  })

  it('toda rota protegida está na sidebar OU declarada fora dela com motivo', () => {
    const orfas = ROTAS.filter(r => {
      if (PUBLICAS.has(r)) return false
      if (FORA_DA_SIDEBAR[r]) return false
      return !HREFS_NAVEGAVEIS.some(h => h.href === r)
    })
    expect(orfas, 'rota sem entrada na sidebar: acrescente o item ou declare em FORA_DA_SIDEBAR').toEqual([])
  })

  it('todo href da sidebar aponta para uma rota que existe', () => {
    const quebrados = HREFS_NAVEGAVEIS.filter(h => !ROTAS.includes(h.href))
    expect(quebrados.map(h => `${h.onde} → ${h.href}`)).toEqual([])
  })

  it('FORA_DA_SIDEBAR não guarda rota que deixou de existir', () => {
    const mortas = Object.keys(FORA_DA_SIDEBAR).filter(r => !ROTAS.includes(r))
    expect(mortas).toEqual([])
  })
})

describe('quem VÊ o item ALCANÇA a rota (as pontas do RBAC)', () => {
  // A divergência custou um flip inteiro na M1: item visível na sidebar + `requireArea`
  // exigindo outra área = usuário clicando e caindo em /sem-acesso, sem erro em nenhum gate.
  it.each(HREFS_NAVEGAVEIS)('$onde → $href', ({ href, visibilidade }) => {
    const donas = areasDaRota(href)
    expect(donas, `${href} não tem dono em areasDaRota`).not.toBeNull()
    const forasteiras = visibilidade.filter(a => !donas!.includes(a))
    expect(forasteiras, 'área que MOSTRA o item mas não LIBERA a rota').toEqual([])
  })

  it('toda área citada pela navegação existe no catálogo AREAS', () => {
    const citadas = new Set<string>(HREFS_NAVEGAVEIS.flatMap(h => h.visibilidade))
    for (const grupo of Object.values(NAV_GROUPS)) {
      for (const s of grupo) { citadas.add(s.area); (s.areasAny ?? []).forEach(a => citadas.add(a)) }
    }
    expect([...citadas].filter(a => !AREAS.includes(a as Area))).toEqual([])
  })
})

describe('item ativo — sem colisão de prefixo entre seções', () => {
  const paiDe = (href: string): string =>
    Object.keys(NAV_GROUPS).find(p => href === p || href.startsWith(`${p}/`)) ?? href

  it.each(HREFS_NAVEGAVEIS)('$href acende exatamente um item de 1º nível', ({ href }) => {
    const acesos = NAV_ITEMS.filter(i =>
      NAV_GROUPS[i.href] ? href === i.href || href.startsWith(`${i.href}/`) : itemAtivo(i.href, href),
    )
    expect(acesos.map(i => i.label)).toEqual([NAV_ITEMS.find(i => i.href === paiDe(href))!.label])
  })

  it('dentro do grupo, a subaba ativa é a de prefixo MAIS ESPECÍFICO', () => {
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/financeiro'], '/financeiro/fluxo-caixa/gerencial'))
      .toBe('/financeiro/fluxo-caixa/gerencial')
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/financeiro'], '/financeiro/fluxo-caixa'))
      .toBe('/financeiro/fluxo-caixa')
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/metas'], '/metas/cadastro')).toBe('/metas/cadastro')
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/metas'], '/metas')).toBe('/metas')
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/gestao-pessoas'], '/gestao-pessoas/inventario'))
      .toBe('/gestao-pessoas/inventario')
    // Rota de OUTRA seção nunca acende subaba deste grupo.
    expect(hrefAtivoDoGrupo(NAV_GROUPS['/gestao-pessoas'], '/admin/acessos')).toBeNull()
  })
})

describe('estrutura do modelo', () => {
  it('todo grupo tem item-pai em NAV_ITEMS, sem área própria e com pelo menos uma subaba', () => {
    for (const [pai, subs] of Object.entries(NAV_GROUPS)) {
      const item = NAV_ITEMS.find(i => i.href === pai)
      expect(item, `grupo ${pai} sem item-pai`).toBeDefined()
      expect(item!.area, `${pai} é grupo: a permissão vem das subabas`).toBeNull()
      expect(subs.length).toBeGreaterThan(0)
    }
  })

  it('hrefs únicos em cada nível', () => {
    const nivel1 = NAV_ITEMS.map(i => i.href)
    expect(new Set(nivel1).size).toBe(nivel1.length)
    const subs = Object.values(NAV_GROUPS).flat().map(s => s.href)
    expect(new Set(subs).size).toBe(subs.length)
  })

  it('subaba de um grupo vive DENTRO do prefixo do pai', () => {
    for (const [pai, subs] of Object.entries(NAV_GROUPS)) {
      for (const s of subs) {
        expect(s.href === pai || s.href.startsWith(`${pai}/`), `${s.href} fora de ${pai}`).toBe(true)
      }
    }
  })
})

describe('filtro por permissão — a seção nova não vaza nem apaga o que já existia', () => {
  const TODAS = [...AREAS] as string[]
  const rotulos = (permissoes: string[]) => itensVisiveis(permissoes).map(i => i.label)

  it('com todas as permissões, a ordem da sidebar é a da v5.6.1 (Gestão de Pessoas abaixo de Financeiro)', () => {
    expect(rotulos(TODAS)).toEqual([
      'Executiva', 'Performance', 'Metas', 'Financeiro', 'Gestão de Pessoas',
      'Solicitações', 'Upload de Arquivos', 'Usuários e Acessos', 'Design System',
    ])
  })

  it('SEM a área nova, "Gestão de Pessoas" não aparece — e nada mais muda', () => {
    const semNova = TODAS.filter(a => a !== 'gestao-pessoas/inventario')
    expect(rotulos(semNova)).toEqual(rotulos(TODAS).filter(l => l !== 'Gestão de Pessoas'))
  })

  it('SÓ com a área nova, aparece SÓ a seção nova', () => {
    expect(rotulos(['gestao-pessoas/inventario'])).toEqual(['Gestão de Pessoas'])
    const subs = NAV_GROUPS['/gestao-pessoas'].filter(s => subVisivel(s, ['gestao-pessoas/inventario']))
    expect(subs.map(s => s.href)).toEqual(['/gestao-pessoas/inventario'])
  })

  it('sem permissão nenhuma, a navegação fica vazia (deny-by-default)', () => {
    expect(rotulos([])).toEqual([])
  })

  it('a seção nova NÃO é liberada por área vizinha de administração', () => {
    for (const vizinha of ['admin/acessos', 'admin/design-system', 'admin/uploads']) {
      expect(rotulos([vizinha])).not.toContain('Gestão de Pessoas')
    }
  })

  it('cada rota da sidebar é alcançável por quem tem a permissão dela, e só', () => {
    for (const { href, visibilidade } of HREFS_NAVEGAVEIS) {
      for (const area of visibilidade) {
        const pai = Object.keys(NAV_GROUPS).find(p => href === p || href.startsWith(`${p}/`))
        const esperado = pai ?? href
        expect(itensVisiveis([area]).map(i => i.href)).toContain(esperado)
      }
    }
  })
})

describe('sonda: desktop e drawer mobile saem do MESMO molde', () => {
  // Não há DOM neste ambiente (vitest `node`), então a paridade das duas variantes é verificada
  // na fonte: as duas montam `SidebarContent`, que consome `nav-model`. Se alguém duplicar a
  // navegação numa variante só (a regressão clássica de "arrumei no desktop"), isto reprova.
  const fonte = readFileSync(resolve(__dirname, 'sidebar.tsx'), 'utf8')

  it('SidebarContent é montado nas duas variantes', () => {
    expect(fonte.match(/<SidebarContent\b/g)?.length).toBe(2)
  })

  it('a variante mobile recebe o mesmo usuário e fecha o drawer ao navegar', () => {
    const mobile = fonte.slice(fonte.indexOf('Mobile drawer'))
    expect(mobile).toMatch(/<SidebarContent[^>]*usuario=\{usuario\}/)
    expect(mobile).toMatch(/onNav=\{onMobileClose\}/)
  })

  it('a lista de navegação NÃO é redeclarada dentro do componente', () => {
    expect(fonte).not.toMatch(/const\s+NAV_ITEMS\s*[:=]/)
    expect(fonte).not.toMatch(/const\s+NAV_GROUPS\s*[:=]/)
    expect(fonte).toMatch(/from '@\/components\/layout\/nav-model'/)
  })
})

describe('molde de abas do Inventário (M2)', () => {
  // O briefing manda a estrutura de abas no molde de `gerencial-section.tsx` (abas SEMPRE
  // montadas, alternando por `hidden` — busca e filtros de cada aba sobrevivem à troca) com a
  // acessibilidade de `acessos-content.tsx` (role=tablist/tab/tabpanel). Sonda de fonte pelo
  // mesmo motivo do bloco acima: sem DOM, é aqui que a regressão aparece.
  const fonte = readFileSync(
    resolve(__dirname, '../gestao-pessoas/inventario/inventario-content.tsx'), 'utf8',
  )

  it('tablist com os três painéis rotulados', () => {
    expect(fonte).toMatch(/role="tablist"/)
    expect(fonte).toMatch(/aria-label="Seções do inventário de ativos"/)
    expect(fonte.match(/role="tab"/g)?.length).toBe(1)          // dentro do .map das abas
    expect(fonte.match(/role="tabpanel"/g)?.length).toBe(3)
    expect(fonte.match(/aria-labelledby="tab-/g)?.length).toBe(3)
    expect(fonte.match(/aria-controls=/g)?.length).toBe(1)
    expect(fonte).toMatch(/aria-selected=\{ativa\}/)
  })

  it('as três abas ficam montadas, alternando por `hidden` (nunca desmontadas)', () => {
    expect(fonte.match(/\? '' : 'hidden'/g)?.length).toBe(3)
  })
})
