import 'server-only'

// v4.35.0 (Fase 4a) — Envio do e-mail de FATURA (boleto + nota anexados). Estende a camada
// única src/lib/email (reusa o transport e o anexoLogo do index.ts; NÃO duplica transporte).
// FALLBACK-SAFE: NUNCA lança — retorna resultado estruturado (padrão da camada e do Asaas).
//
// INVARIANTE (o "sandbox do e-mail"): em MODO TESTE, o override do destinatário acontece
// AQUI (ponto único, dentro da camada) — impossível um caminho novo esquecer de aplicá-lo.
// Fail-closed: sem EMAIL_TESTE_DESTINO em teste, o envio é RECUSADO (nunca vaza para o real).
// Anexo que falha no download = o envio FALHA com motivo (nunca e-mail incompleto silencioso).

import { getConfigSmtp, emailAmbiente, getEmailTesteDestino } from './config'
import { criarTransporter, anexoLogo } from './index'
import { templateFaturaEmail } from './template'
import { emailValido } from '@/lib/asaas/client'

export interface ResultadoEnvioFatura {
  ok:                     boolean
  /** Para onde FOI de fato (em teste = o override EMAIL_TESTE_DESTINO). */
  destinatariosEfetivos?: string[]
  anexos?:                { boleto: boolean; nota: boolean }
  erro?:                  string
}

/**
 * Split dos destinatários do cadastro (string "a@x; b@y") → válidos e inválidos.
 * Separa por ';', trima, descarta vazios e valida o formato de cada um (emailValido).
 * Dedupe preservando ordem. É desta fase (o cadastro só guarda a string).
 */
export function splitDestinatarios(texto: string | null | undefined): { validos: string[]; invalidos: string[] } {
  const partes = (texto ?? '').split(';').map(s => s.trim()).filter(Boolean)
  const validos: string[] = []
  const invalidos: string[] = []
  for (const p of partes) {
    if (emailValido(p)) validos.push(p)
    else invalidos.push(p)
  }
  return { validos: [...new Set(validos)], invalidos }
}

/** Baixa um PDF (URL pública do Asaas) como Buffer, com timeout (~30s, como o asaasReq). Lança em falha. */
async function baixarPdf(url: string): Promise<Buffer> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 30_000)
  try {
    const resp = await fetch(url, { signal: ctrl.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length === 0) throw new Error('PDF vazio')
    return buf
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Envia o e-mail de uma fatura. NUNCA lança. O override de destinatário (modo teste) e a
 * decisão fail-closed vivem AQUI. Os anexos são baixados server-side (boleto sempre; nota
 * só quando informada) — falha de download = envio FALHA (não manda e-mail incompleto).
 */
export async function enviarFaturaEmail(input: {
  ref:                string
  cliente:            string
  destinatariosReais: string[]          // para onde IRIA no modo real (já validados)
  boletoUrl:          string            // bank_slip_url — PDF do boleto (anexo, sempre)
  boletoLink?:        string | null     // invoice_url — link clicável no corpo (fallback = boletoUrl)
  notaUrl?:           string | null     // pdf_url da nota (só quando AUTORIZADA) → anexa a nota
}): Promise<ResultadoEnvioFatura> {
  const modo = emailAmbiente()

  // ── Override no PONTO ÚNICO: em teste, TUDO vai para EMAIL_TESTE_DESTINO (fail-closed). ──
  let efetivos: string[]
  if (modo === 'teste') {
    const destino = getEmailTesteDestino()
    if (!destino) return { ok: false, erro: 'EMAIL_TESTE_DESTINO ausente — envio em modo teste recusado (fail-closed).' }
    efetivos = [destino]
  } else {
    efetivos = input.destinatariosReais
  }
  if (efetivos.length === 0) return { ok: false, erro: 'Sem destinatário efetivo para envio.' }

  const cfg = getConfigSmtp()
  if (!cfg) return { ok: false, erro: 'SMTP não configurado (variáveis SMTP_* ausentes).' }

  const temNota = Boolean(input.notaUrl)
  try {
    // Anexos: falha de download NÃO envia e-mail incompleto — falha com motivo claro.
    let boletoBuf: Buffer
    try {
      boletoBuf = await baixarPdf(input.boletoUrl)
    } catch {
      return { ok: false, erro: 'Falha ao baixar o PDF do boleto — e-mail não enviado.' }
    }
    let notaBuf: Buffer | null = null
    if (temNota) {
      try {
        notaBuf = await baixarPdf(input.notaUrl!)
      } catch {
        return { ok: false, erro: 'Falha ao baixar o PDF da nota fiscal — e-mail não enviado.' }
      }
    }

    const { assunto, html, text } = templateFaturaEmail({
      cliente:          input.cliente,
      ref:              input.ref,
      boletoLink:       input.boletoLink?.trim() || input.boletoUrl,
      temNota,
      teste:            modo === 'teste',
      destinatarioReal: input.destinatariosReais.join('; '),
    })

    const attachments = [
      anexoLogo(),
      { filename: `boleto-${input.ref}.pdf`, content: boletoBuf, contentType: 'application/pdf' },
      ...(notaBuf ? [{ filename: `nota-${input.ref}.pdf`, content: notaBuf, contentType: 'application/pdf' }] : []),
    ]

    await criarTransporter(cfg).sendMail({
      from: cfg.from, to: efetivos.join(', '), subject: assunto, html, text, attachments,
    })
    return { ok: true, destinatariosEfetivos: efetivos, anexos: { boleto: true, nota: temNota } }
  } catch (err) {
    console.error('[email] falha ao enviar e-mail de fatura:', err)
    return { ok: false, erro: 'Falha ao enviar o e-mail (SMTP).' }
  }
}
