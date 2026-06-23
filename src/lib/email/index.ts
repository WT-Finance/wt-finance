import 'server-only'
import nodemailer from 'nodemailer'
import { getConfigSmtp, getAppBaseUrl, type ConfigSmtp } from './config'
import {
  templateSenhaProvisoria, templateNotificacaoSolicitacao,
  type TipoSenha, type MovimentacaoEmail,
} from './template'
import { LOGO_CID, LOGO_WELCOME_GROUP_PNG_BASE64 } from './logo'

// v4.24.0 / v4.25.0 — Camada ÚNICA de envio (server-only). FALLBACK-SAFE acima de tudo:
// nunca lança; sem config (SMTP off) ou erro de envio → não envia e o chamador segue.
// Timeout curto: SMTP lento não trava a UX. A lógica de transporte/anexo é COMPARTILHADA
// pelas funções de envio (não duplicar) — o que muda entre e-mails é só o template.

export type { TipoSenha, MovimentacaoEmail }

/** Transporter SMTP com timeouts curtos (compartilhado). */
function criarTransporter(cfg: ConfigSmtp) {
  return nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 10_000,
    greetingTimeout:   10_000,
    socketTimeout:     10_000,
  })
}

/** Logo Welcome Group via CID (bytes no bundle, não public/; data-URI falha no Outlook). */
function anexoLogo() {
  return {
    filename:    'welcome-group.png',
    content:     Buffer.from(LOGO_WELCOME_GROUP_PNG_BASE64, 'base64'),
    cid:         LOGO_CID,
    contentType: 'image/png',
  }
}

/** Senha provisória (criação/reset) — 1 destinatário. Retorna boolean, NUNCA lança. */
export async function enviarSenhaProvisoria(input: {
  para:  string
  nome?: string | null
  senha: string
  tipo:  TipoSenha
}): Promise<boolean> {
  const cfg = getConfigSmtp()
  if (!cfg) return false   // SMTP não configurado → fallback (senha na tela)
  try {
    const { assunto, html, text } = templateSenhaProvisoria({
      nome: input.nome, senha: input.senha, tipo: input.tipo, linkAcesso: getAppBaseUrl(),
    })
    await criarTransporter(cfg).sendMail({
      from: cfg.from, to: input.para, subject: assunto, html, text, attachments: [anexoLogo()],
    })
    return true
  } catch (err) {
    console.error('[email] falha ao enviar senha provisória — seguindo com fallback (senha na tela):', err)
    return false
  }
}

/**
 * v4.25.0 — Notificação de movimentação de Solicitação. Mesmo e-mail para TODOS os
 * envolvidos (autor + destinatário/membros da role). FAN-OUT BEST-EFFORT: um envio por
 * destinatário em paralelo; a falha de um NÃO derruba os outros nem o chamador. NUNCA
 * lança (sem config → 0 enviados). Link → caixa /solicitacoes (getAppBaseUrl), sem deep-link.
 */
export async function enviarNotificacaoSolicitacao(input: {
  paras:           string[]
  movimentacao:    MovimentacaoEmail
  titulo:          string
  atribuidoRotulo: string
  autorRotulo:     string
  quando?:         string | null
  justificativa?:  string | null
}): Promise<{ enviados: number; total: number }> {
  const cfg = getConfigSmtp()
  // Dedupe + sanidade mínima (evita enviar para entrada inválida).
  const paras = [...new Set(input.paras.map(p => p.trim()).filter(p => p.includes('@')))]
  if (!cfg || paras.length === 0) return { enviados: 0, total: paras.length }
  try {
    const base = getAppBaseUrl()
    const { assunto, html, text } = templateNotificacaoSolicitacao({
      movimentacao:    input.movimentacao,
      titulo:          input.titulo,
      atribuidoRotulo: input.atribuidoRotulo,
      autorRotulo:     input.autorRotulo,
      quando:          input.quando,
      justificativa:   input.justificativa,
      link:            base ? `${base}/solicitacoes` : null,
    })
    const transporter = criarTransporter(cfg)
    const anexo = anexoLogo()
    const r = await Promise.allSettled(paras.map(para =>
      transporter.sendMail({ from: cfg.from, to: para, subject: assunto, html, text, attachments: [anexo] }),
    ))
    const enviados = r.filter(x => x.status === 'fulfilled').length
    if (enviados < paras.length) {
      console.error(`[email] notificação de solicitação: ${enviados}/${paras.length} enviados (falhas best-effort).`)
    }
    return { enviados, total: paras.length }
  } catch (err) {
    console.error('[email] notificação de solicitação falhou (best-effort, ignorado):', err)
    return { enviados: 0, total: paras.length }
  }
}
