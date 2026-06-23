// v4.24.2 — Template do e-mail de senha provisória (criação / reset administrativo).
// Layout em TABELAS + estilos INLINE (robusto no Outlook, que usa o motor do Word):
// logo transparente centralizado, botão real em CÉLULA DE TABELA (o Outlook ignora
// `background` em <a> inline) e cartão FLUIDO (width:100% + max-width) com media query
// para telas pequenas. Logo via CID (sem dependência externa; ver index.ts). Função
// pura — parametrizada por `tipo` e `linkAcesso`.

import { LOGO_CID } from './logo'

export type TipoSenha = 'criacao' | 'reset'

export interface TemplateSenha {
  assunto: string
  html:    string
  text:    string
}

const APP_NOME = 'WT Finance'
// Paleta sóbria Welcome (hex inline — e-mail não aceita CSS var). Derivada dos tokens do DS.
const COR_TITULO   = '#1A1814'   // preto WT — saudação, botão, senha
const COR_TEXTO    = '#4B4F54'   // corpo
const COR_LABEL    = '#75777B'   // rótulo "Senha provisória"
const COR_TENUE    = '#9A9CA0'   // rodapé / nota discreta
const COR_LINHA    = '#E0DDD5'   // divisória (cinza claro)
const COR_BORDA    = '#ECEAE4'   // bordas do cartão / caixa da senha
const COR_FUNDO    = '#F4F4F2'   // fundo da página
const COR_SENHA_BG = '#FAF8F4'   // fundo da caixa da senha

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

  // CTA "Acessar a plataforma" — só com URL base (config). Botão em CÉLULA DE TABELA
  // (bgcolor + link dentro), porque o Outlook ignora `background` em <a> inline.
  const botaoLinha = linkAcesso
    ? `<tr><td class="em-pad" align="center" style="padding:28px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
          <tr><td align="center" bgcolor="${COR_TITULO}" style="border-radius:8px;">
            <a href="${escaparHtml(linkAcesso)}" style="display:inline-block;padding:13px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Acessar a plataforma</a>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  // Logo Welcome Group transparente, centralizado, embutido via CID (anexo em index.ts).
  // alt text garante leitura mesmo sem render. O logo já contém o nome (sem título tipográfico).
  const html =
`<style>
  @media only screen and (max-width:480px) {
    .em-card  { width:100% !important; }
    .em-pad   { padding-left:24px !important; padding-right:24px !important; }
    .em-senha { font-size:20px !important; letter-spacing:1px !important; }
  }
</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:${COR_FUNDO};font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center" style="padding:40px 12px;">
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border:1px solid ${COR_BORDA};border-radius:14px;">
      <tr><td class="em-pad" align="center" style="padding:38px 40px 0;">
        <img src="cid:${LOGO_CID}" alt="WT Finance — Welcome Group" width="184" style="display:block;width:184px;max-width:184px;height:auto;border:0;margin:0 auto;" />
      </td></tr>
      <tr><td class="em-pad" style="padding:26px 40px 0;">
        <div style="border-top:1px solid ${COR_LINHA};font-size:0;line-height:0;">&nbsp;</div>
      </td></tr>
      <tr><td class="em-pad" style="padding:24px 40px 0;">
        <p style="margin:0 0 10px;font-size:16px;color:${COR_TITULO};">${escaparHtml(saudacao)},</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:${COR_TEXTO};">${intro}</p>
      </td></tr>
      <tr><td class="em-pad" style="padding:22px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-radius:10px;">
          <tr><td align="center" style="padding:22px 16px;">
            <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COR_LABEL};margin-bottom:10px;">Senha provisória</div>
            <div class="em-senha" style="font-family:'Courier New',Consolas,monospace;font-size:23px;font-weight:bold;color:${COR_TITULO};letter-spacing:2px;word-break:break-all;">${escaparHtml(senha)}</div>
          </td></tr>
        </table>
      </td></tr>
      ${botaoLinha}
      <tr><td class="em-pad" style="padding:30px 40px 0;">
        <p style="margin:0;font-size:13px;line-height:1.65;color:${COR_TEXTO};">Por segurança, você deverá definir uma nova senha no primeiro acesso.</p>
      </td></tr>
      <tr><td class="em-pad" style="padding:12px 40px 38px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COR_TENUE};">Se você não esperava este e-mail, ignore-o ou fale com o administrador.</p>
      </td></tr>
    </table>
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">WT&nbsp;FINANCE&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}

// ── v4.25.0/v4.25.1 — Notificação de movimentação de Solicitação (tarefas) ──────
// MESMO layout Outlook-safe (tabelas/inline/logo CID/botão em célula/responsivo).
// Um e-mail ÚNICO para TODOS os envolvidos (autor + destinatário/membros da role),
// parametrizado pela movimentação. v4.25.1: SEM "Olá"; NOMES (não e-mails); DATA/HORA;
// badge de status COLORIDO por movimentação (mesma lógica das badges da página
// Movimentações); "Atribuída a {rótulo}" (sem "permissão"); botão com padding na CÉLULA.
// Rejeição inclui a justificativa. Reusa TemplateSenha como shape de retorno. (scaffold
// duplicado de propósito — ver docs/email-layout-guide.md §5.)

export type MovimentacaoEmail = 'criada' | 'concluida' | 'rejeitada' | 'cancelada'
const MOV_PT: Record<MovimentacaoEmail, string> = {
  criada: 'criada', concluida: 'concluída', rejeitada: 'rejeitada', cancelada: 'cancelada',
}
// Cor do status (badge + faixa lateral) por movimentação — MESMA paleta das badges da
// página Movimentações: criada=dourado, concluída=verde, rejeitada=vermelho, cancelada=cinza.
const MOV_COR: Record<MovimentacaoEmail, string> = {
  criada: '#BD965C', concluida: '#5F7A3D', rejeitada: '#A35442', cancelada: '#75777B',
}

export function templateNotificacaoSolicitacao(input: {
  movimentacao:    MovimentacaoEmail
  titulo:          string
  atribuidoRotulo: string
  autorRotulo:     string
  /** 'DD/MM/AAAA às HH:MM' (fuso SP) — quando a movimentação ocorreu. */
  quando?:         string | null
  justificativa?:  string | null
  link?:           string | null
}): TemplateSenha {
  const mov    = MOV_PT[input.movimentacao]
  const cor    = MOV_COR[input.movimentacao]
  const titulo = input.titulo
  const quando = input.quando?.trim() || null
  const link   = input.link?.trim() || null
  const just   = input.movimentacao === 'rejeitada' ? (input.justificativa?.trim() || null) : null

  const assunto = `${APP_NOME} — solicitação ${mov}: ${titulo}`

  const text =
    `A solicitação "${titulo}" foi ${mov}${quando ? ` em ${quando}` : ''}.\n\n` +
    `Atribuída a ${input.atribuidoRotulo}, por ${input.autorRotulo}.\n\n` +
    (just ? `Justificativa: ${just}\n\n` : '') +
    (link ? `Acesse suas solicitações: ${link}\n\n` : '') +
    'Você recebe este e-mail por estar envolvido nesta solicitação.\n\n' +
    `— ${APP_NOME}`

  const dataLinha = quando
    ? `<div style="font-size:12px;color:${COR_TENUE};margin-top:7px;">${escaparHtml(quando)}</div>`
    : ''

  const justLinha = just
    ? `<tr><td class="em-pad" style="padding:16px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-radius:12px;">
          <tr><td style="padding:14px 16px;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COR_LABEL};margin-bottom:6px;">Justificativa</div>
            <div style="font-size:14px;line-height:1.6;color:${COR_TEXTO};">${escaparHtml(just)}</div>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  // Botão real: padding na CÉLULA (não no <a>) → renderiza sólido mesmo onde o cliente
  // colapsa o inline-block do <a> (corrige o "tarjado apertado").
  const botaoLinha = link
    ? `<tr><td class="em-pad" align="center" style="padding:26px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
          <tr><td align="center" bgcolor="${COR_TITULO}" style="border-radius:12px;padding:14px 34px;">
            <a href="${escaparHtml(link)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Acessar a plataforma</a>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  const html =
`<style>
  @media only screen and (max-width:480px) {
    .em-card { width:100% !important; }
    .em-pad  { padding-left:24px !important; padding-right:24px !important; }
  }
</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0;padding:0;background:${COR_FUNDO};font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center" style="padding:40px 12px;">
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;background:#ffffff;border:1px solid ${COR_BORDA};border-radius:14px;">
      <tr><td class="em-pad" align="center" style="padding:38px 40px 0;">
        <img src="cid:${LOGO_CID}" alt="WT Finance — Welcome Group" width="184" style="display:block;width:184px;max-width:184px;height:auto;border:0;margin:0 auto;" />
      </td></tr>
      <tr><td class="em-pad" style="padding:26px 40px 0;">
        <div style="border-top:1px solid ${COR_LINHA};font-size:0;line-height:0;">&nbsp;</div>
      </td></tr>
      <tr><td class="em-pad" style="padding:26px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-left:3px solid ${cor};border-radius:12px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${cor};font-weight:bold;margin-bottom:7px;">Solicitação ${mov}</div>
            <div style="font-size:18px;font-weight:bold;line-height:1.4;color:${COR_TITULO};">${escaparHtml(titulo)}</div>
            ${dataLinha}
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="em-pad" style="padding:18px 40px 0;">
        <p style="margin:0;font-size:14px;line-height:1.65;color:${COR_TEXTO};">Atribuída a <strong style="color:${COR_TITULO};">${escaparHtml(input.atribuidoRotulo)}</strong>, por <strong style="color:${COR_TITULO};">${escaparHtml(input.autorRotulo)}</strong>.</p>
      </td></tr>
      ${justLinha}
      ${botaoLinha}
      <tr><td class="em-pad" style="padding:26px 40px 38px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COR_TENUE};">Você recebe este e-mail por estar envolvido nesta solicitação.</p>
      </td></tr>
    </table>
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">WT&nbsp;FINANCE&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}
