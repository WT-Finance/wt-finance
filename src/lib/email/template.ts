// v4.24.0 — Template do e-mail de senha provisória (criação / reset administrativo).
// Identidade sóbria Welcome, estilos INLINE (clientes de e-mail exigem) e SEM
// dependência externa de imagem. Deixa claro que a senha é PROVISÓRIA e que será
// trocada no primeiro acesso. Função pura — parametrizada por `tipo`.

import { LOGO_CID } from './logo'

export type TipoSenha = 'criacao' | 'reset'

export interface TemplateSenha {
  assunto: string
  html:    string
  text:    string
}

const APP_NOME = 'WT Finance'
const COR_TITULO  = '#1A1814'
const COR_DOURADO = '#BD965C'
const COR_TEXTO   = '#4B4F54'
const COR_SUAVE   = '#75777B'

function escaparHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function templateSenhaProvisoria(input: {
  nome?: string | null
  senha: string
  tipo:  TipoSenha
  /** URL base do app para o botão "Acessar a plataforma" (vem da config). Ausente → sem botão. */
  linkAcesso?: string | null
}): TemplateSenha {
  const { senha, tipo } = input
  const nome = input.nome?.trim() || null
  const linkAcesso = input.linkAcesso?.trim() || null
  const saudacao = nome ? `Olá, ${nome}` : 'Olá'

  const assunto = tipo === 'criacao'
    ? `${APP_NOME} — seu acesso foi criado`
    : `${APP_NOME} — sua senha foi redefinida`

  const intro = tipo === 'criacao'
    ? 'Seu acesso à plataforma WT Finance foi criado. Use a senha provisória abaixo para entrar:'
    : 'A senha de acesso à plataforma WT Finance foi redefinida. Use a senha provisória abaixo para entrar:'

  const text =
    `${saudacao},\n\n` +
    `${intro}\n\n` +
    `Senha provisória: ${senha}\n\n` +
    (linkAcesso ? `Acesse a plataforma: ${linkAcesso}\n\n` : '') +
    'Por segurança, você deverá definir uma nova senha no primeiro acesso.\n\n' +
    'Se você não esperava este e-mail, ignore-o ou fale com o administrador.\n\n' +
    `— ${APP_NOME}`

  // Botão "Acessar a plataforma" — só quando há URL base (config). Cor sóbria (preto WT).
  const botaoHtml = linkAcesso
    ? `<div style="text-align:center;margin:0 0 20px;">
        <a href="${escaparHtml(linkAcesso)}" style="display:inline-block;background:${COR_TITULO};color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:11px 24px;border-radius:8px;">Acessar a plataforma</a>
      </div>`
    : ''

  // Logo Welcome Group embutido via CID (cid:welcome-logo) — anexado em index.ts. alt text
  // garante e-mail legível mesmo sem renderizar a imagem. O logo já contém o nome (sem título).
  const html =
`<div style="margin:0;padding:0;background:#f4f4f2;">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #ece9e3;">
      <img src="cid:${LOGO_CID}" alt="WT Finance — Welcome Group" width="160" style="display:block;margin:0 auto;height:auto;border:0;" />
      <div style="height:1px;background:${COR_DOURADO};opacity:0.5;margin:20px 0 24px;"></div>
      <p style="font-size:15px;color:${COR_TITULO};margin:0 0 12px;">${escaparHtml(saudacao)},</p>
      <p style="font-size:14px;line-height:1.6;color:${COR_TEXTO};margin:0 0 20px;">${intro}</p>
      <div style="background:#faf8f4;border:1px solid #ece9e3;border-radius:8px;padding:16px;text-align:center;margin:0 0 20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:${COR_SUAVE};margin-bottom:6px;">Senha provisória</div>
        <div style="font-family:'Courier New',monospace;font-size:20px;font-weight:bold;color:${COR_TITULO};letter-spacing:0.04em;word-break:break-all;">${escaparHtml(senha)}</div>
      </div>
      ${botaoHtml}
      <p style="font-size:13px;line-height:1.6;color:${COR_TEXTO};margin:0 0 8px;">
        Por segurança, você deverá <strong>definir uma nova senha no primeiro acesso</strong>.
      </p>
      <p style="font-size:12px;line-height:1.6;color:${COR_SUAVE};margin:16px 0 0;">
        Se você não esperava este e-mail, ignore-o ou fale com o administrador.
      </p>
    </div>
    <p style="font-size:11px;color:${COR_SUAVE};text-align:center;margin:16px 0 0;">${APP_NOME} · Welcome Group</p>
  </div>
</div>`

  return { assunto, html, text }
}
