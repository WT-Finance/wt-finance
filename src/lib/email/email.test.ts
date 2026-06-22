import { describe, it, expect, beforeEach, vi } from 'vitest'

// `server-only` lança fora de um contexto de servidor (RSC); em vitest (node)
// neutralizamos o import para exercitar config/enviar. nodemailer é mockado para
// não tocar a rede — o que importa aqui é o CONTRATO fallback-safe da camada.
vi.mock('server-only', () => ({}))
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import { templateSenhaProvisoria } from './template'
import { getConfigSmtp, _resetConfigSmtpCache } from './config'
import { enviarSenhaProvisoria } from './index'

const CHAVES_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'] as const
function limparEnvSmtp() { CHAVES_SMTP.forEach(k => { delete process.env[k] }) }
function configCompleta() {
  process.env.SMTP_HOST = 'smtp.office365.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'conta@welcometrips.com.br'
  process.env.SMTP_PASS = 'segredo'
  _resetConfigSmtpCache()
}

describe('templateSenhaProvisoria — criação × reset', () => {
  it('criação: assunto/intro próprios, senha presente em html e text, nome no html', () => {
    const t = templateSenhaProvisoria({ nome: 'Maria', senha: 'ABC-123_xy', tipo: 'criacao' })
    expect(t.assunto).toContain('acesso foi criado')
    expect(t.text).toContain('ABC-123_xy')
    expect(t.html).toContain('ABC-123_xy')
    expect(t.html).toContain('Maria')
    expect(t.text).toContain('primeiro acesso')
  })

  it('reset: assunto distinto da criação', () => {
    const c = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' })
    const r = templateSenhaProvisoria({ senha: 'x', tipo: 'reset' })
    expect(r.assunto).toContain('redefinida')
    expect(r.assunto).not.toBe(c.assunto)
  })

  it('sem nome → saudação genérica "Olá"', () => {
    const t = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' })
    expect(t.html).toContain('Olá,')
    expect(t.text.startsWith('Olá,')).toBe(true)
  })

  it('escapa HTML do nome (anti-injeção)', () => {
    const t = templateSenhaProvisoria({ nome: '<b>x</b>', senha: 'y', tipo: 'reset' })
    expect(t.html).toContain('&lt;b&gt;')
    expect(t.html).not.toContain('<b>x</b>')
  })
})

describe('getConfigSmtp — fallback-safe (config opcional)', () => {
  beforeEach(() => { _resetConfigSmtpCache(); limparEnvSmtp() })

  it('sem variáveis → null (cai no fallback)', () => {
    expect(getConfigSmtp()).toBeNull()
  })

  it('config completa → objeto; secure parseado; from default = user', () => {
    configCompleta()
    const cfg = getConfigSmtp()
    expect(cfg).not.toBeNull()
    expect(cfg?.host).toBe('smtp.office365.com')
    expect(cfg?.port).toBe(587)
    expect(cfg?.secure).toBe(false)
    expect(cfg?.from).toBe('conta@welcometrips.com.br') // SMTP_FROM ausente → default = user
  })

  it('faltando uma essencial (sem SMTP_PASS) → null', () => {
    process.env.SMTP_HOST = 'h'; process.env.SMTP_USER = 'u'
    _resetConfigSmtpCache()
    expect(getConfigSmtp()).toBeNull()
  })
})

describe('enviarSenhaProvisoria — NUNCA lança (boolean)', () => {
  beforeEach(() => {
    sendMailMock.mockReset()
    _resetConfigSmtpCache(); limparEnvSmtp()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('SMTP não configurado → false, sem tentar enviar (fallback)', async () => {
    const ok = await enviarSenhaProvisoria({ para: 'x@y.com', senha: 's', tipo: 'criacao' })
    expect(ok).toBe(false)
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('envio bem-sucedido → true', async () => {
    configCompleta()
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    const ok = await enviarSenhaProvisoria({ para: 'x@y.com', senha: 's', tipo: 'reset' })
    expect(ok).toBe(true)
    expect(sendMailMock).toHaveBeenCalledOnce()
  })

  it('erro de envio → false (sem propagar exceção)', async () => {
    configCompleta()
    sendMailMock.mockRejectedValueOnce(new Error('SMTP timeout'))
    const ok = await enviarSenhaProvisoria({ para: 'x@y.com', senha: 's', tipo: 'criacao' })
    expect(ok).toBe(false)
  })
})
