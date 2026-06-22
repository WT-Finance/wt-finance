import 'server-only'
import nodemailer from 'nodemailer'
import { getConfigSmtp, getAppBaseUrl } from './config'
import { templateSenhaProvisoria, type TipoSenha } from './template'
import { LOGO_CID, LOGO_WELCOME_GROUP_PNG_BASE64 } from './logo'

// v4.24.0 — Camada ÚNICA de envio de senha provisória (criação + reset; no futuro,
// notificações de Solicitações reusam esta camada com novos templates). Chamada
// pelos 2 pontos do fluxo de acesso. FALLBACK-SAFE acima de tudo: retorna boolean e
// NUNCA lança — sem config ou qualquer erro de envio → false, e o chamador segue
// com a senha exibida na tela. Timeout curto: SMTP lento não pode travar a UX.

export type { TipoSenha }

export async function enviarSenhaProvisoria(input: {
  para:  string
  nome?: string | null
  senha: string
  tipo:  TipoSenha
}): Promise<boolean> {
  const cfg = getConfigSmtp()
  if (!cfg) return false   // SMTP não configurado → fallback (senha na tela)

  try {
    const transporter = nodemailer.createTransport({
      host:   cfg.host,
      port:   cfg.port,
      secure: cfg.secure,
      auth:   { user: cfg.user, pass: cfg.pass },
      // Timeouts curtos: um SMTP lento cai no fallback em vez de travar a criação/reset.
      connectionTimeout: 10_000,
      greetingTimeout:   10_000,
      socketTimeout:     10_000,
    })
    const { assunto, html, text } = templateSenhaProvisoria({
      nome: input.nome, senha: input.senha, tipo: input.tipo, linkAcesso: getAppBaseUrl(),
    })
    await transporter.sendMail({
      from: cfg.from, to: input.para, subject: assunto, html, text,
      // Logo embutido via CID (não data-URI): attachment MIME referenciado por cid:welcome-logo
      // no <img> do template — compatível com Outlook. Bytes vêm do bundle (logo.ts), não de public/.
      attachments: [{
        filename:    'welcome-group.png',
        content:     Buffer.from(LOGO_WELCOME_GROUP_PNG_BASE64, 'base64'),
        cid:         LOGO_CID,
        contentType: 'image/png',
      }],
    })
    return true
  } catch (err) {
    console.error('[email] falha ao enviar senha provisória — seguindo com fallback (senha na tela):', err)
    return false
  }
}
