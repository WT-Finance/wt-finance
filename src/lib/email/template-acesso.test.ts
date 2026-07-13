import { describe, it, expect } from 'vitest'
import { templateNotificacaoAcessoSolicitado } from './template'

describe('templateNotificacaoAcessoSolicitado (v5.0.1)', () => {
  it('assunto interno Janus + campos do solicitante + botão com link', () => {
    const t = templateNotificacaoAcessoSolicitado({
      emailSolicitante: 'joao.silva@empresa.com.br',
      nomeSolicitante:  'João Silva',
      quando:           '13 de julho de 2026, 11:35',
      link:             'https://app.exemplo.com/admin/acessos',
    })
    expect(t.assunto).toBe('Nova solicitação de acesso | Janus')
    expect(t.html).toContain('joao.silva@empresa.com.br')
    expect(t.html).toContain('João Silva')
    expect(t.html).toContain('13 de julho de 2026, 11:35')
    expect(t.html).toContain('Acessar a plataforma')
    expect(t.html).toContain('https://app.exemplo.com/admin/acessos')
    expect(t.text).toContain('joao.silva@empresa.com.br')
  })

  it('sem link → sem botão; sem nome/quando → sem essas linhas', () => {
    const t = templateNotificacaoAcessoSolicitado({ emailSolicitante: 'a@b.com' })
    expect(t.html).not.toContain('Acessar a plataforma')
    expect(t.html).not.toContain('Nome informado')
    expect(t.html).not.toContain('Solicitado em')
    expect(t.html).toContain('a@b.com')
  })

  it('escapa HTML no nome (anti-injeção)', () => {
    const t = templateNotificacaoAcessoSolicitado({
      emailSolicitante: 'x@y.com', nomeSolicitante: '<b>hack</b>',
    })
    expect(t.html).not.toContain('<b>hack</b>')
    expect(t.html).toContain('&lt;b&gt;hack&lt;/b&gt;')
  })
})
