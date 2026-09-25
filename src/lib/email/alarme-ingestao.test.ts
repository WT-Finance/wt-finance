import { describe, it, expect, beforeEach, vi } from 'vitest'

// `server-only` lança fora de contexto de servidor; em vitest neutralizamos. nodemailer é
// mockado — o que importa é o CONTRATO: override no ponto único, fail-closed sem destino
// (nos dois sentidos: teste sem EMAIL_TESTE_DESTINO, real sem INGESTAO_ALARME_DESTINOS),
// fan-out best-effort e NUNCA lançar.
vi.mock('server-only', () => ({}))
const { sendMailMock } = vi.hoisted(() => ({ sendMailMock: vi.fn() }))
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))

import { templateAlarmeIngestao, type AlarmeIngestao } from './template'
import { _resetConfigSmtpCache } from './config'
import { enviarAlarmeIngestao } from './alarme-ingestao'

// Intl pt-BR (fmtBRL2, usado no diff monetário) usa NBSP (char 160) entre "R$" e o número —
// mesmo padrão de normalização de src/lib/fmt.test.ts (evita caractere invisível cru no teste).
const NBSP = String.fromCharCode(160)
const semNbsp = (s: string) => s.split(NBSP).join(' ')

const CHAVES = [
  'EMAIL_MODO', 'EMAIL_TESTE_DESTINO', 'INGESTAO_ALARME_DESTINOS',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
  'APP_BASE_URL', 'VERCEL_PROJECT_PRODUCTION_URL',
] as const
function limpar() { CHAVES.forEach(k => { delete process.env[k] }); _resetConfigSmtpCache() }

function configSmtpCompleta() {
  process.env.SMTP_HOST = 'smtp.office365.com'
  process.env.SMTP_PORT = '587'
  process.env.SMTP_SECURE = 'false'
  process.env.SMTP_USER = 'conta@welcometrips.com.br'
  process.env.SMTP_PASS = 'segredo'
  _resetConfigSmtpCache()
}
function ambienteTeste() {
  process.env.EMAIL_MODO = 'teste'
  process.env.EMAIL_TESTE_DESTINO = 'caixa-teste@welcometrips.com.br'
  configSmtpCompleta()
}
function ambienteReal(destinos: string) {
  process.env.EMAIL_MODO = 'real'
  process.env.INGESTAO_ALARME_DESTINOS = destinos
  configSmtpCompleta()
}

// ── Um exemplar de cada um dos CINCO tipos (§4 do anexo) ──────────────────────────────────
const checksumFalho: AlarmeIngestao = {
  tipo: 'checksum_falho', base: 'vendas-produto', cargaId: 'c-abc-123',
  motivo: 'CHECKSUM_FALHOU: esperado 9f2a, obtido 1b30', codigo: 'CHECKSUM_FALHOU',
}
/** O MESMO tipo de alarme cobre toda rejeição de conteúdo — mas esta não foi de checksum. */
const rejeitadaPorFormato: AlarmeIngestao = {
  tipo: 'checksum_falho', base: 'lancamentos-aberto', cargaId: 'c-fmt-001',
  motivo: 'A planilha não tem a coluna "Vencimento".', codigo: 'FORMATO_INVALIDO',
}
const anoFechado: AlarmeIngestao = {
  tipo: 'ano_fechado_alterado', base: 'demonstrativo-competencia', ano: 2024,
  linhasAntes: 1204, linhasDepois: 1210, centavosAntes: 132369077, centavosDepois: 132469077,
  cargaId: 'c-def-456',
}
const parNovo: AlarmeIngestao = { tipo: 'par_novo_bandeja', cargaId: 'c-ghi-789', paresNovos: 3 }
const processoSemResultado: AlarmeIngestao = {
  tipo: 'processo_sem_resultado', processo: 'monde-incremental',
  ultimaExecucaoOkEm: '24/09/2026 às 08:00', minutosSemResultado: 90,
}
const cargaNaoChegou: AlarmeIngestao = {
  tipo: 'carga_esperada_nao_chegou', base: 'lancamentos-aberto',
  ultimaCargaEm: '20/09/2026 às 10:00', horasSemCarga: 30,
}

describe('templateAlarmeIngestao — rejeição que NÃO foi de checksum não diz "checksum"', () => {
  it('FORMATO_INVALIDO: assunto, título e 1ª linha sem "checksum"; motivo e código aparecem', () => {
    const t = templateAlarmeIngestao(rejeitadaPorFormato, { teste: false, link: null })
    expect(t.assunto.toLowerCase()).not.toContain('checksum')
    expect(t.html.toLowerCase()).not.toContain('checksum')
    expect(t.text.toLowerCase()).not.toContain('checksum')
    expect(t.assunto).toContain('Carga rejeitada')
    expect(t.text).toContain('FORMATO_INVALIDO')
    expect(t.text).toContain('A planilha não tem a coluna')
  })
  it('sem código (causa não informada): também não afirma checksum', () => {
    const semCodigo: AlarmeIngestao = { ...rejeitadaPorFormato, codigo: undefined }
    expect(templateAlarmeIngestao(semCodigo, { teste: false, link: null }).assunto.toLowerCase()).not.toContain('checksum')
  })
})

describe('templateAlarmeIngestao — cada tipo EXIGE seus dados no corpo (não só o assunto)', () => {
  it('checksum_falho: base, carga_id e o MOTIVO original aparecem em html e text', () => {
    const t = templateAlarmeIngestao(checksumFalho, { teste: false, link: null })
    expect(t.assunto).toContain('checksum')
    expect(t.assunto).toContain('Janus')
    expect(t.html).toContain('Vendas por Produto')
    expect(t.html).toContain('c-abc-123')
    expect(t.html).toContain('CHECKSUM_FALHOU: esperado 9f2a, obtido 1b30')
    expect(t.text).toContain('Vendas por Produto')
    expect(t.text).toContain('c-abc-123')
    expect(t.text).toContain('CHECKSUM_FALHOU: esperado 9f2a, obtido 1b30')
  })

  it('ano_fechado_alterado: base, ANO e o VALOR (antes → depois) aparecem — grandeza dupla', () => {
    const t = templateAlarmeIngestao(anoFechado, { teste: false, link: null })
    expect(t.assunto).toContain('2024')
    expect(t.html).toContain('Demonstrativo de Resultado (competência)')
    expect(t.html).toContain('2024')
    // linhas: 1.204 → 1.210 (+6)
    expect(t.html).toContain('1.204')
    expect(t.html).toContain('1.210')
    expect(t.html).toContain('+6')
    // valor: R$ 1.323.690,77 → R$ 1.324.690,77 (+R$ 1.000,00) — normaliza o NBSP do Intl
    expect(t.html).toContain('1.323.690,77')
    expect(t.html).toContain('1.324.690,77')
    expect(semNbsp(t.html)).toContain('+R$ 1.000,00')
    expect(t.text).toContain('1.323.690,77')
    expect(semNbsp(t.text)).toContain('+R$ 1.000,00')
  })

  it('par_novo_bandeja: contagem de pares novos e carga_id aparecem', () => {
    const t = templateAlarmeIngestao(parNovo, { teste: false, link: null })
    expect(t.assunto).toContain('3 par(es) novo(s)')
    expect(t.html).toContain('c-ghi-789')
    expect(t.html).toContain('3')
    expect(t.text).toContain('c-ghi-789')
  })

  it('processo_sem_resultado: o PROCESSO e há quanto tempo (minutos) aparecem', () => {
    const t = templateAlarmeIngestao(processoSemResultado, { teste: false, link: null })
    expect(t.assunto).toContain('monde-incremental')
    expect(t.html).toContain('monde-incremental')
    expect(t.html).toContain('90 minuto(s)')
    expect(t.html).toContain('24/09/2026 às 08:00')
    expect(t.text).toContain('monde-incremental')
    expect(t.text).toContain('90 minuto(s)')
  })

  it('carga_esperada_nao_chegou: a BASE e há quanto tempo (horas) aparecem', () => {
    const t = templateAlarmeIngestao(cargaNaoChegou, { teste: false, link: null })
    expect(t.assunto).toContain('Lançamentos por Vencimento (em aberto)')
    expect(t.html).toContain('Lançamentos por Vencimento (em aberto)')
    expect(t.html).toContain('30 horas')
    expect(t.html).toContain('20/09/2026 às 10:00')
    expect(t.text).toContain('30 horas')
  })

  it('sem carga/execução anterior → "nunca houve"/"nunca registrada" (não string vazia)', () => {
    const semCarga: AlarmeIngestao = { tipo: 'carga_esperada_nao_chegou', base: 'vendas-produto', horasSemCarga: 5 }
    const t = templateAlarmeIngestao(semCarga, { teste: false, link: null })
    expect(t.html).toContain('nunca houve')
    const semExec: AlarmeIngestao = { tipo: 'processo_sem_resultado', processo: 'cdi-mensal', minutosSemResultado: 10 }
    const t2 = templateAlarmeIngestao(semExec, { teste: false, link: null })
    expect(t2.html).toContain('nunca registrada')
  })

  it('nunca houve sinal: a duração é PISO, não fato — "pelo menos", e em dias, não 50.400 minutos', () => {
    // O caso real da prova da M6 (24/09): cdi-mensal ligado sem nenhuma execução registrada,
    // tolerância de 35 dias → o vigia passa a própria tolerância como duração.
    const nunca: AlarmeIngestao = { tipo: 'processo_sem_resultado', processo: 'cdi-mensal', minutosSemResultado: 50_400 }
    const t = templateAlarmeIngestao(nunca, { teste: false, link: null })
    expect(t.text).toContain('35 dias')
    expect(t.text).toContain('pelo menos')
    expect(t.text).toContain('NUNCA registrou execução OK')
    expect(t.text).not.toContain('50.400')
    expect(t.text).not.toContain('está SEM RESULTADO há')
  })

  it('modo TESTE: assunto e corpo dizem EXPLICITAMENTE que é teste (não confunde com real)', () => {
    const t = templateAlarmeIngestao(checksumFalho, { teste: true, link: null })
    expect(t.assunto).toContain('[ALARME DE TESTE]')
    expect(t.html).toContain('Alarme de teste')
    expect(t.html).toContain('não corresponde a um incidente real')
    expect(t.text).toContain('ALARME DE TESTE')
    const real = templateAlarmeIngestao(checksumFalho, { teste: false, link: null })
    expect(real.assunto).toContain('[ALARME]')
    expect(real.assunto).not.toContain('TESTE')
  })

  it('link para /admin/ingestao só aparece quando fornecido; ausente → e-mail segue válido', () => {
    const com = templateAlarmeIngestao(checksumFalho, { teste: false, link: 'https://app.exemplo.com/admin/ingestao' })
    expect(com.html).toContain('https://app.exemplo.com/admin/ingestao')
    expect(com.html).toContain('Ver na plataforma')
    const sem = templateAlarmeIngestao(checksumFalho, { teste: false, link: null })
    expect(sem.html).not.toContain('Ver na plataforma')
  })

  it('embute o lockup duplo [Janus] | [Welcome Group] via CID (e-mail interno)', () => {
    const t = templateAlarmeIngestao(checksumFalho, { teste: false, link: null })
    expect(t.html).toContain('cid:welcome-logo')
    expect(t.html).toContain('cid:janus-logo')
  })
})

describe('enviarAlarmeIngestao — MODO TESTE fail-closed no ponto único', () => {
  beforeEach(() => {
    sendMailMock.mockReset(); limpar()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('teste com EMAIL_TESTE_DESTINO → envia SÓ para ele, mesmo com INGESTAO_ALARME_DESTINOS setado', async () => {
    ambienteTeste()
    process.env.INGESTAO_ALARME_DESTINOS = 'ninguem-deveria-receber@x.com'
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    const r = await enviarAlarmeIngestao(checksumFalho)
    expect(r.ok).toBe(true)
    expect(r.destinatariosEfetivos).toEqual(['caixa-teste@welcometrips.com.br'])
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock.mock.calls[0][0].to).toBe('caixa-teste@welcometrips.com.br')
  })

  it('teste SEM EMAIL_TESTE_DESTINO → RECUSA (fail-closed), não tenta enviar', async () => {
    process.env.EMAIL_MODO = 'teste'   // sem EMAIL_TESTE_DESTINO
    configSmtpCompleta()
    const r = await enviarAlarmeIngestao(checksumFalho)
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('fail-closed')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('real com INGESTAO_ALARME_DESTINOS → envia para a lista (fan-out)', async () => {
    ambienteReal('a@x.com, b@x.com , a@x.com')   // dedupe + trim
    sendMailMock.mockResolvedValue({ messageId: 'ok' })
    const r = await enviarAlarmeIngestao(anoFechado)
    expect(r.ok).toBe(true)
    expect(r.destinatariosEfetivos).toEqual(['a@x.com', 'b@x.com'])
    expect(r.total).toBe(2)
    expect(r.enviados).toBe(2)
    expect(sendMailMock).toHaveBeenCalledTimes(2)
  })

  it('real SEM INGESTAO_ALARME_DESTINOS (ausente) → RECUSA (fail-closed)', async () => {
    process.env.EMAIL_MODO = 'real'
    configSmtpCompleta()
    const r = await enviarAlarmeIngestao(checksumFalho)
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('fail-closed')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('real com INGESTAO_ALARME_DESTINOS só com e-mails INVÁLIDOS → equivale a vazia, RECUSA', async () => {
    ambienteReal('nao-e-email, , outro-invalido')
    const r = await enviarAlarmeIngestao(checksumFalho)
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('fail-closed')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('SMTP não configurado → recusa com motivo, NUNCA lança', async () => {
    process.env.EMAIL_MODO = 'teste'; process.env.EMAIL_TESTE_DESTINO = 't@x.com'
    _resetConfigSmtpCache()
    const r = await enviarAlarmeIngestao(checksumFalho)
    expect(r.ok).toBe(false)
    expect(r.erro).toContain('SMTP')
    expect(sendMailMock).not.toHaveBeenCalled()
  })

  it('falha de UM destinatário não derruba os outros (best-effort) — o caller pode logar enviados/total', async () => {
    ambienteReal('a@x.com, b@x.com, c@x.com')
    sendMailMock
      .mockResolvedValueOnce({ messageId: '1' })
      .mockRejectedValueOnce(new Error('bounce'))
      .mockResolvedValueOnce({ messageId: '3' })
    const r = await enviarAlarmeIngestao(parNovo)
    expect(r.ok).toBe(true)
    expect(r.total).toBe(3)
    expect(r.enviados).toBe(2)
  })

  it('SMTP falha em TODOS os destinatários → ainda ok:true (best-effort), NUNCA lança', async () => {
    ambienteTeste()
    sendMailMock.mockRejectedValue(new Error('SMTP timeout'))
    const r = await enviarAlarmeIngestao(processoSemResultado)
    // fan-out best-effort: SMTP rejeitando sempre → 0 enviados, mas a função NÃO lança;
    // o CALLER é quem loga enviados/total (skill `email` §1).
    expect(r.ok).toBe(true)
    expect(r.enviados).toBe(0)
    expect(r.total).toBe(1)
  })

  it('o assunto do e-mail REALMENTE enviado carrega o prefixo de teste/real', async () => {
    ambienteTeste()
    sendMailMock.mockResolvedValueOnce({ messageId: '1' })
    await enviarAlarmeIngestao(cargaNaoChegou)
    expect(sendMailMock.mock.calls[0][0].subject).toContain('[ALARME DE TESTE]')
  })
})
