import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { config } from './proxy'

// A camada 1 do enforcement (ADR-0109) depende de UM regex: o `matcher` do proxy. Um termo
// a mais isenta uma rota da exigência de sessão em silêncio; um termo a menos faz o proxy
// responder 307/HTML no lugar de um asset estático — e NENHUM dos dois aparece em `tsc`,
// `lint`, `build` ou nos testes de UI. Os dois lados já custaram caro:
//   • de menos → v5.3.3: `/fonts/avenir/*.otf` interceptado, `OTS parsing error`, tipografia
//     caída para fonte de sistema nas telas sem sessão;
//   • de mais  → auto-auditoria S11: isenção por EXTENSÃO (`.png`) deixava uma rota dinâmica
//     `/api/.../[id]` com id terminado em `.png` escapar do proxy.
// Este teste fixa mecanicamente as duas bordas. Regex ancorado = como o Next o aplica ao
// pathname (comportamento conferido com requests reais no fechamento da v5.3.3).

const matcher = new RegExp(`^${config.matcher[0]}$`)

/** true = o request passa pelo proxy (exige sessão fora das rotas públicas). */
const passaPeloProxy = (pathname: string) => matcher.test(pathname)

describe('matcher do proxy — assets estáticos isentos', () => {
  const fontes = readdirSync(new URL('../public/fonts/avenir', import.meta.url))
    .filter(f => f.endsWith('.otf'))

  it('achou as fontes reais em public/fonts/avenir (senão o teste abaixo é vazio)', () => {
    expect(fontes.length).toBeGreaterThan(0)
  })

  it.each(fontes)('/fonts/avenir/%s NÃO passa pelo proxy', nome => {
    expect(passaPeloProxy(`/fonts/avenir/${nome}`)).toBe(false)
    // o browser pede a URL percent-encoded (os nomes têm espaço) — precisa valer nas duas formas
    expect(passaPeloProxy(`/fonts/avenir/${encodeURIComponent(nome)}`)).toBe(false)
  })

  it.each([
    '/logos/logo-janus.svg',
    '/logos/welcome-group-vert.svg',
    '/_next/static/chunks/main.js',
    '/favicon.ico',
    '/icon.svg',
    '/icon.png',
    '/icon0.png',
    '/icon1.png',
    '/apple-icon.png',
  ])('%s NÃO passa pelo proxy', p => {
    expect(passaPeloProxy(p)).toBe(false)
  })
})

describe('matcher do proxy — superfícies reais SEMPRE passam (camada 1 intacta)', () => {
  it.each([
    ['raiz', '/'],
    ['página protegida', '/financeiro'],
    ['página protegida aninhada', '/financeiro/dre/estrutura'],
    ['página que exige sessão', '/trocar-senha'],
    ['área admin', '/admin/uploads'],
    ['rota de API', '/api/setores'],
    ['rota de API aninhada', '/api/dashboard/performance/cagr'],
    ['página pública (o proxy decide, não o matcher)', '/login'],
    ['página pública de pré-cadastro', '/solicitar-acesso'],
    ['API com bypass próprio no handler (isenção é no código, não no matcher)', '/api/monde/ingest'],
  ])('%s: %s passa pelo proxy', (_rotulo, p) => {
    expect(passaPeloProxy(p)).toBe(true)
  })

  // As bordas que a isenção por prefixo poderia furar se estivesse escrita frouxa.
  it.each([
    ['id dinâmico terminado em .png não escapa (lição S11)', '/api/uploads/abc.png'],
    ['id dinâmico terminado em .otf não escapa', '/api/uploads/abc.otf'],
    ['"fonts" no meio do path não é isento', '/api/algo/fonts/x.otf'],
    ['"logos" no meio do path não é isento', '/api/algo/logos/x.svg'],
    ['prefixo sem a barra não é isento', '/fonts'],
    ['prefixo em caixa alta não é isento', '/FONTS/avenir/x.otf'],
    ['sufixo parecido não é isento', '/meus-fonts/x.otf'],
  ])('%s: %s passa pelo proxy', (_rotulo, p) => {
    expect(passaPeloProxy(p)).toBe(true)
  })
})
