import { describe, it, expect, beforeEach, vi } from 'vitest'

// `server-only` lança fora de um contexto de servidor (RSC); em vitest (node)
// neutralizamos o import para exercitar config/enviar. nodemailer é mockado para
// não tocar a rede — o que importa aqui é o CONTRATO fallback-safe da camada.
vi.mock('server-only', () => ({}))
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import { templateSenhaProvisoria, templateNotificacaoSolicitacao } from './template'
import { getConfigSmtp, getAppBaseUrl, _resetConfigSmtpCache } from './config'
import {
  enviarSenhaProvisoria, enviarNotificacaoSolicitacao, enviarNotificacaoAcessoSolicitado,
  MAX_CONEXOES_SMTP, _setEsperaRetryMs,
} from './index'

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

  it('embute o lockup duplo [Janus] | [Welcome Group] via CID, com alt text', () => {
    const t = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' })
    expect(t.html).toContain('cid:welcome-logo')
    expect(t.html).toContain('cid:janus-logo')
    expect(t.html).toContain('alt=')
    expect(t.html).toContain('alt="Janus"')
    expect(t.html).toContain('Welcome Group')
  })

  it('textos internos usam "Janus" (não "WT Finance")', () => {
    const t = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' })
    expect(t.assunto).toContain('Janus')
    expect(t.text).toContain('plataforma Janus')
    expect(t.text).toContain('— Janus')
    expect(t.html).toContain('JANUS')
  })

  it('formato do assunto interno = "[Assunto] | Janus" (checkpoint v4.40.0)', () => {
    expect(templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' }).assunto).toBe('Seu acesso foi criado | Janus')
    expect(templateSenhaProvisoria({ senha: 'x', tipo: 'reset' }).assunto).toBe('Sua senha foi redefinida | Janus')
    const n = templateNotificacaoSolicitacao({
      movimentacao: 'criada', titulo: 'Contas a pagar #15',
      atribuidoRotulo: 'Yan', autorRotulo: 'Yan', quando: null, justificativa: null, link: null,
    })
    expect(n.assunto).toBe('Solicitação criada: Contas a pagar #15 | Janus')
  })

  it('botão "Acessar a plataforma" aparece só com linkAcesso (html e text)', () => {
    const com = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao', linkAcesso: 'https://app.exemplo.com' })
    expect(com.html).toContain('Acessar a plataforma')
    expect(com.html).toContain('https://app.exemplo.com')
    expect(com.text).toContain('https://app.exemplo.com')
    const sem = templateSenhaProvisoria({ senha: 'x', tipo: 'criacao' })
    expect(sem.html).not.toContain('Acessar a plataforma')
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

describe('getAppBaseUrl — da config, nunca hardcoded', () => {
  beforeEach(() => { delete process.env.APP_BASE_URL; delete process.env.VERCEL_PROJECT_PRODUCTION_URL })

  it('APP_BASE_URL definido → retorna sem barra final', () => {
    process.env.APP_BASE_URL = 'https://wt.exemplo.com/'
    expect(getAppBaseUrl()).toBe('https://wt.exemplo.com')
  })
  it('sem APP_BASE_URL → cai em VERCEL_PROJECT_PRODUCTION_URL (prefixa https)', () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'wt-finance.vercel.app'
    expect(getAppBaseUrl()).toBe('https://wt-finance.vercel.app')
  })
  it('nenhuma env → null (botão omitido, e-mail segue válido)', () => {
    expect(getAppBaseUrl()).toBeNull()
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

describe('templateNotificacaoSolicitacao — 4 movimentações', () => {
  const base = { titulo: 'Lançamentos #42', atribuidoRotulo: 'Carine Cardoso', autorRotulo: 'Yan Vieira' }

  it('criada: assunto/título no html e text + lockup duplo (2 CIDs) + "Janus"', () => {
    const t = templateNotificacaoSolicitacao({ movimentacao: 'criada', ...base })
    expect(t.assunto).toContain('criada')
    expect(t.assunto).toContain('Lançamentos #42')
    expect(t.assunto).toContain('Janus')
    expect(t.html).toContain('Lançamentos #42')
    expect(t.text).toContain('foi criada')
    expect(t.html).toContain('cid:welcome-logo')
    expect(t.html).toContain('cid:janus-logo')
    expect(t.text).toContain('— Janus')
  })

  it('concluída: SEM justificativa mesmo se passada', () => {
    const t = templateNotificacaoSolicitacao({ movimentacao: 'concluida', ...base, justificativa: 'nao deveria aparecer' })
    expect(t.assunto).toContain('concluída')
    expect(t.html).not.toContain('Justificativa')
    expect(t.html).not.toContain('nao deveria aparecer')
  })

  it('rejeitada: justificativa em html e text', () => {
    const t = templateNotificacaoSolicitacao({ movimentacao: 'rejeitada', ...base, justificativa: 'falta o anexo X' })
    expect(t.assunto).toContain('rejeitada')
    expect(t.html).toContain('Justificativa')
    expect(t.html).toContain('falta o anexo X')
    expect(t.text).toContain('falta o anexo X')
  })

  it('cancelada: nomes (não e-mails) + data + badge cinza; sem "Olá"', () => {
    const t = templateNotificacaoSolicitacao({ movimentacao: 'cancelada', ...base, quando: '23/06/2026 às 10:04' })
    expect(t.assunto).toContain('cancelada')
    expect(t.html).toContain('Carine Cardoso')
    expect(t.html).toContain('Yan Vieira')
    expect(t.html).toContain('23/06/2026 às 10:04')
    expect(t.text).toContain('em 23/06/2026 às 10:04')
    expect(t.html).toContain('#75777B')      // badge/faixa cinza (cancelada)
    expect(t.html).not.toContain('Olá,')      // saudação removida
  })

  it('role: "Atribuída a {rótulo}" SEM "permissão"; badge dourado; botão; escapa título', () => {
    const r = templateNotificacaoSolicitacao({ movimentacao: 'criada', titulo: '<b>x</b> #1', atribuidoRotulo: 'Financeiro', autorRotulo: 'Yan Vieira', link: 'https://app.x.com/solicitacoes' })
    expect(r.html).toContain('Atribuída a <strong')
    expect(r.html).toContain('Financeiro')
    expect(r.html).not.toContain('permissão')
    expect(r.html).toContain('#BD965C')       // badge dourado (criada)
    expect(r.html).toContain('Acessar a plataforma')
    expect(r.html).toContain('https://app.x.com/solicitacoes')
    expect(r.html).toContain('&lt;b&gt;')
    expect(r.html).not.toContain('<b>x</b>')
    const sem = templateNotificacaoSolicitacao({ movimentacao: 'criada', ...base })
    expect(sem.html).not.toContain('Acessar a plataforma')
  })
})

describe('enviarNotificacaoSolicitacao — fan-out best-effort, NUNCA lança', () => {
  const args = { movimentacao: 'concluida' as const, titulo: 'T #1', atribuidoRotulo: 'Financeiro', autorRotulo: 'Yan Vieira' }
  beforeEach(() => {
    sendMailMock.mockReset()
    _resetConfigSmtpCache(); limparEnvSmtp()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('SMTP não configurado → 0 enviados, sem tentar enviar', async () => {
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com', 'b@x.com'], ...args })
    expect(r).toEqual({ enviados: 0, total: 2 })
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('todos enviados → enviados = total', async () => {
    configCompleta()
    sendMailMock.mockResolvedValue({ messageId: 'ok' })
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com', 'b@x.com', 'c@x.com'], ...args })
    expect(r).toEqual({ enviados: 3, total: 3 })
    expect(sendMailMock).toHaveBeenCalledTimes(3)
  })

  it('falha de UM destinatário não derruba os outros (best-effort)', async () => {
    configCompleta()
    sendMailMock
      .mockResolvedValueOnce({ messageId: '1' })
      .mockRejectedValueOnce(new Error('bounce'))
      .mockResolvedValueOnce({ messageId: '3' })
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com', 'b@x.com', 'c@x.com'], ...args })
    expect(r.total).toBe(3)
    expect(r.enviados).toBe(2)
  })

  it('dedupe + sanidade: ignora repetidos e entradas sem @', async () => {
    configCompleta()
    sendMailMock.mockResolvedValue({ messageId: 'ok' })
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com', 'a@x.com', 'invalido', '  '], ...args })
    expect(r).toEqual({ enviados: 1, total: 1 })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  })

  it('config presente mas paras vazio → 0/0, sem enviar', async () => {
    configCompleta()
    const r = await enviarNotificacaoSolicitacao({ paras: [], ...args })
    expect(r).toEqual({ enviados: 0, total: 0 })
    expect(sendMailMock).not.toHaveBeenCalled()
  })
})

// ── v5.3.4 — GUARD do limite de conexões do Office 365 ────────────────────────
// Bug real em produção: o fan-out abria uma conexão SMTP por destinatário DE UMA VEZ e o
// Office 365 recusa acima de 3 simultâneas por mailbox (432 4.3.2) — log de produção
// "3/5 enviados", exatamente o teto. Quem ficava sem e-mail variava a cada disparo.
describe('fan-out SMTP — concorrência limitada + retry (v5.3.4)', () => {
  const args = { movimentacao: 'criada' as const, titulo: 'T #1', atribuidoRotulo: 'Financeiro', autorRotulo: 'Yan Vieira' }
  const muitos = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com', 'f@x.com']

  /** Erro no formato do nodemailer (o `responseCode` é o que distingue transitório de permanente). */
  function erroSmtp(msg: string, extra: Record<string, unknown>) {
    return Object.assign(new Error(msg), extra)
  }

  /** sendMail que mede o PICO de envios simultâneos em voo. */
  function mockMedindoConcorrencia() {
    const medida = { emVoo: 0, pico: 0 }
    sendMailMock.mockImplementation(async () => {
      medida.emVoo++
      medida.pico = Math.max(medida.pico, medida.emVoo)
      await new Promise(r => setTimeout(r, 5))
      medida.emVoo--
      return { messageId: 'ok' }
    })
    return medida
  }

  beforeEach(() => {
    sendMailMock.mockReset()
    _resetConfigSmtpCache(); limparEnvSmtp()
    _setEsperaRetryMs(0)   // sem espera real entre tentativas (suíte rápida e determinística)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('o teto de conexões fica ABAIXO do limite de 3 do Office 365 (com folga)', () => {
    expect(MAX_CONEXOES_SMTP).toBeLessThan(3)
    expect(MAX_CONEXOES_SMTP).toBeGreaterThanOrEqual(1)
  })

  it('6 destinatários → nunca mais de MAX_CONEXOES_SMTP em voo, e TODOS recebem', async () => {
    configCompleta()
    const medida = mockMedindoConcorrencia()
    const r = await enviarNotificacaoSolicitacao({ paras: muitos, ...args })
    expect(r).toEqual({ enviados: 6, total: 6 })
    expect(medida.pico).toBeLessThanOrEqual(MAX_CONEXOES_SMTP)
  })

  it('mesmo teto vale para a notificação de acesso solicitado', async () => {
    configCompleta()
    const medida = mockMedindoConcorrencia()
    const r = await enviarNotificacaoAcessoSolicitado({ paras: muitos, emailSolicitante: 'novo@x.com' })
    expect(r).toEqual({ enviados: 6, total: 6 })
    expect(medida.pico).toBeLessThanOrEqual(MAX_CONEXOES_SMTP)
  })

  it('432 4.3.2 (transitório) é RETENTADO e o destinatário acaba recebendo', async () => {
    configCompleta()
    sendMailMock
      .mockRejectedValueOnce(erroSmtp('432 4.3.2 STOREDRV.ClientSubmit; sender thread limit exceeded', { responseCode: 432 }))
      .mockResolvedValue({ messageId: 'ok' })
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com'], ...args })
    expect(r).toEqual({ enviados: 1, total: 1 })
    expect(sendMailMock).toHaveBeenCalledTimes(2)
  })

  it('timeout de socket (sem responseCode) também é retentado', async () => {
    configCompleta()
    sendMailMock
      .mockRejectedValueOnce(erroSmtp('Connection timeout', { code: 'ETIMEDOUT' }))
      .mockResolvedValue({ messageId: 'ok' })
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com'], ...args })
    expect(r.enviados).toBe(1)
    expect(sendMailMock).toHaveBeenCalledTimes(2)
  })

  it('erro PERMANENTE (550 caixa inexistente) NÃO é retentado', async () => {
    configCompleta()
    sendMailMock.mockRejectedValue(erroSmtp('550 5.1.1 User unknown', { responseCode: 550 }))
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com'], ...args })
    expect(r).toEqual({ enviados: 0, total: 1 })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  })

  it('EAUTH NÃO é retentado (insistir com credencial errada arrisca bloquear a conta)', async () => {
    configCompleta()
    sendMailMock.mockRejectedValue(erroSmtp('Invalid login', { code: 'EAUTH', responseCode: 535 }))
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com'], ...args })
    expect(r).toEqual({ enviados: 0, total: 1 })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  })

  it('transitório que persiste: desiste após o teto de tentativas (não trava o chamador)', async () => {
    configCompleta()
    sendMailMock.mockRejectedValue(erroSmtp('432 4.3.2 limit', { responseCode: 432 }))
    const r = await enviarNotificacaoSolicitacao({ paras: ['a@x.com'], ...args })
    expect(r).toEqual({ enviados: 0, total: 1 })
    expect(sendMailMock.mock.calls.length).toBeGreaterThan(1)
    expect(sendMailMock.mock.calls.length).toBeLessThanOrEqual(4)
  })

  it('falha de um destinatário não impede os seguintes (best-effort preservado)', async () => {
    configCompleta()
    sendMailMock.mockImplementation(async (opts: { to: string }) => {
      if (opts.to === 'c@x.com') throw erroSmtp('550 5.1.1 User unknown', { responseCode: 550 })
      return { messageId: 'ok' }
    })
    const r = await enviarNotificacaoSolicitacao({ paras: muitos, ...args })
    expect(r).toEqual({ enviados: 5, total: 6 })
  })
})
