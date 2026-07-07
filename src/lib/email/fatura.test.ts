import { describe, it, expect, beforeEach, vi } from 'vitest'

// `server-only` lança fora de contexto de servidor; em vitest neutralizamos. nodemailer e
// fetch são mockados (nada toca a rede) — o que importa é o CONTRATO: override no ponto único,
// fail-closed sem destino, corpo condicional da nota, anexo que falha = envio falha, nunca lança.
vi.mock('server-only', () => ({}))
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import { templateFaturaEmail } from './template'
import { emailAmbiente, getEmailTesteDestino, _resetConfigSmtpCache } from './config'
import { splitDestinatarios, enviarFaturaEmail } from './fatura'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// fetch que devolve um "PDF" (ArrayBuffer não-vazio).
function pdfOk() { return { ok: true, arrayBuffer: async () => new ArrayBuffer(16) } }

function ambienteTesteConfig() {
  process.env.EMAIL_MODO = 'teste'
  process.env.EMAIL_TESTE_DESTINO = 'caixa-teste@welcometrips.com.br'
  process.env.SMTP_HOST = 'smtp.office365.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'conta@welcometrips.com.br'
  process.env.SMTP_PASS = 'segredo'
  _resetConfigSmtpCache()
}
function limpar() {
  ;['EMAIL_MODO', 'EMAIL_TESTE_DESTINO', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
    .forEach(k => { delete process.env[k] })
  _resetConfigSmtpCache()
}

describe('splitDestinatarios — split ; + trim + validação + dedupe', () => {
  it('separa válidos e ignora vazios', () => {
    expect(splitDestinatarios('a@x.com; b@y.com')).toEqual({ validos: ['a@x.com', 'b@y.com'], invalidos: [] })
  })
  it('destinatário inválido no meio → vai para invalidos, envia aos válidos', () => {
    const r = splitDestinatarios('a@x.com; ; naoemail; c@z.com')
    expect(r.validos).toEqual(['a@x.com', 'c@z.com'])
    expect(r.invalidos).toEqual(['naoemail'])
  })
  it('dedupe preservando ordem', () => {
    expect(splitDestinatarios('a@x.com; a@x.com; b@y.com').validos).toEqual(['a@x.com', 'b@y.com'])
  })
  it('vazio/null → nada', () => {
    expect(splitDestinatarios('')).toEqual({ validos: [], invalidos: [] })
    expect(splitDestinatarios(null)).toEqual({ validos: [], invalidos: [] })
  })
})

describe('emailAmbiente / getEmailTesteDestino — fail-safe', () => {
  beforeEach(limpar)
  it('ausente → teste (fail-safe)', () => { expect(emailAmbiente()).toBe('teste') })
  it("'real' → real; 'REAL' idem (case-insensitive)", () => {
    process.env.EMAIL_MODO = 'real'; expect(emailAmbiente()).toBe('real')
    process.env.EMAIL_MODO = 'REAL'; expect(emailAmbiente()).toBe('real')
  })
  it('qualquer outro valor → teste (fail-safe)', () => {
    process.env.EMAIL_MODO = 'producao'; expect(emailAmbiente()).toBe('teste')
    process.env.EMAIL_MODO = 'teste'; expect(emailAmbiente()).toBe('teste')
  })
  it('getEmailTesteDestino: ausente → null; presente → valor trimado', () => {
    expect(getEmailTesteDestino()).toBeNull()
    process.env.EMAIL_TESTE_DESTINO = '  x@y.com  '; expect(getEmailTesteDestino()).toBe('x@y.com')
  })
})

describe('templateFaturaEmail — assunto, corpo condicional, prefixo de teste', () => {
  it('assunto base: Fatura Welcome Trips – {cliente} – Nº {ref}', () => {
    const t = templateFaturaEmail({ cliente: 'ACME', ref: '10319', temNota: true, teste: false })
    expect(t.assunto).toBe('Fatura Welcome Trips – ACME – Nº 10319')
  })
  it('teste → assunto com prefixo do destinatário real', () => {
    const t = templateFaturaEmail({ cliente: 'ACME', ref: '1', temNota: false, teste: true, destinatarioReal: 'a@x.com' })
    expect(t.assunto.startsWith('[TESTE — destinatário real: a@x.com]')).toBe(true)
    expect(t.html).toContain('Modo teste')
    expect(t.html).toContain('a@x.com')
  })
  it('com nota → corpo menciona boleto e nota fiscal', () => {
    const t = templateFaturaEmail({ cliente: 'ACME', ref: '1', temNota: true, teste: false })
    expect(t.text).toContain('juntamente com boleto e nota fiscal')
    expect(t.html).toContain('nota fiscal')
  })
  it('SEM nota → corpo menciona só o boleto, NÃO a nota fiscal (condicional)', () => {
    const t = templateFaturaEmail({ cliente: 'ACME', ref: '1', temNota: false, teste: false })
    expect(t.text).toContain('juntamente com boleto.')
    expect(t.text).not.toContain('nota fiscal')
    expect(t.html).not.toContain('nota fiscal')
  })
  it('SEM botão/link do boleto (vai só como anexo); escapa o destinatário real na faixa de teste', () => {
    const t = templateFaturaEmail({ cliente: 'ACME', ref: '1', temNota: false, teste: true, destinatarioReal: '<b>x</b>@y.com' })
    expect(t.html).not.toContain('Acessar o boleto')
    expect(t.html).toContain('Caso tenham dúvidas, estamos à disposição.')
    expect(t.html).toContain('&lt;b&gt;')
    expect(t.html).not.toContain('<b>x</b>')
  })
})

describe('enviarFaturaEmail — override, fail-closed, anexos, NUNCA lança', () => {
  beforeEach(() => {
    sendMailMock.mockReset(); fetchMock.mockReset()
    limpar()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('teste: override — envia para EMAIL_TESTE_DESTINO, não para o real; com nota = 3 anexos', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValue(pdfOk())
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    const r = await enviarFaturaEmail({
      ref: '10319', cliente: 'ACME', destinatariosReais: ['cliente@real.com'],
      boletoUrl: 'https://asaas/b.pdf', notaUrl: 'https://asaas/n.pdf',
    })
    expect(r.ok).toBe(true)
    expect(r.destinatariosEfetivos).toEqual(['caixa-teste@welcometrips.com.br'])
    expect(r.anexos).toEqual({ boleto: true, nota: true, outros: 0 })
    const arg = sendMailMock.mock.calls[0][0]
    expect(arg.to).toBe('caixa-teste@welcometrips.com.br')       // override: NÃO o real
    expect(arg.subject).toContain('[TESTE — destinatário real: cliente@real.com]')
    expect(arg.attachments).toHaveLength(3)                       // logo + boleto + nota
    expect(fetchMock).toHaveBeenCalledTimes(2)                    // baixa boleto + nota
  })

  it('sem nota → 2 anexos (logo + boleto), 1 fetch, anexos.nota=false', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValue(pdfOk())
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    const r = await enviarFaturaEmail({ ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf' })
    expect(r.ok).toBe(true)
    expect(r.anexos).toEqual({ boleto: true, nota: false, outros: 0 })
    expect(sendMailMock.mock.calls[0][0].attachments).toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('anexos "Outros" (base64) entram como anexos extra; anexos.outros conta; filename sanitizado', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValue(pdfOk())
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    const r = await enviarFaturaEmail({
      ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf',
      anexosExtra: [
        { nome: 'contrato.pdf', tipo: 'application/pdf', base64: Buffer.from('conteudo-1').toString('base64') },
        { nome: 'a/b\\c.txt', tipo: 'text/plain', base64: Buffer.from('conteudo-2').toString('base64') },
      ],
    })
    expect(r.ok).toBe(true)
    expect(r.anexos).toEqual({ boleto: true, nota: false, outros: 2 })
    const attachments = sendMailMock.mock.calls[0][0].attachments
    expect(attachments).toHaveLength(4)              // logo + boleto + 2 "Outros"
    expect(attachments[3].filename).toBe('a_b_c.txt') // sem path/quebra no filename
  })

  it('anexo "Outros" vazio → envio FALHA (não manda incompleto)', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValue(pdfOk())
    const r = await enviarFaturaEmail({
      ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf',
      anexosExtra: [{ nome: 'vazio.pdf', tipo: 'application/pdf', base64: '' }],
    })
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('vazio')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('FAIL-CLOSED: modo teste sem EMAIL_TESTE_DESTINO → recusa, NÃO envia nem baixa', async () => {
    process.env.EMAIL_MODO = 'teste'   // sem EMAIL_TESTE_DESTINO
    process.env.SMTP_HOST = 'h'; process.env.SMTP_USER = 'u'; process.env.SMTP_PASS = 'p'; process.env.SMTP_FROM = 'f@x.com'
    _resetConfigSmtpCache()
    const r = await enviarFaturaEmail({ ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf' })
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('fail-closed')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('SMTP não configurado → recusa (não envia)', async () => {
    process.env.EMAIL_MODO = 'teste'; process.env.EMAIL_TESTE_DESTINO = 't@x.com'; _resetConfigSmtpCache()
    const r = await enviarFaturaEmail({ ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf' })
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('SMTP')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('PDF do boleto falha no download → envio FALHA (não manda incompleto)', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    const r = await enviarFaturaEmail({ ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf' })
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('boleto')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('erro no SMTP → ok:false, NUNCA lança', async () => {
    ambienteTesteConfig()
    fetchMock.mockResolvedValue(pdfOk())
    sendMailMock.mockRejectedValueOnce(new Error('SMTP timeout'))
    const r = await enviarFaturaEmail({ ref: '1', cliente: 'ACME', destinatariosReais: ['c@x.com'], boletoUrl: 'https://asaas/b.pdf' })
    expect(r.ok).toBe(false)
  })
})
