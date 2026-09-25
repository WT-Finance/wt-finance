// v4.24.2 — Template do e-mail de senha provisória (criação / reset administrativo).
// Layout em TABELAS + estilos INLINE (robusto no Outlook, que usa o motor do Word):
// logo transparente centralizado, botão real em CÉLULA DE TABELA (o Outlook ignora
// `background` em <a> inline) e cartão FLUIDO (width:100% + max-width) com media query
// para telas pequenas. Logo via CID (sem dependência externa; ver index.ts). Função
// pura — parametrizada por `tipo` e `linkAcesso`.

import { LOGO_CID, LOGO_JANUS_CID } from './logo'
import { ROTULO_BASE, type BaseIngestao } from '@/lib/ingestao/bases'
import { fmtBRL2 } from '@/lib/fmt'

export type TipoSenha = 'criacao' | 'reset'

export interface TemplateSenha {
  assunto: string
  html:    string
  text:    string
}

// `APP_NOME` é consumida TAMBÉM por `templateFaturaEmail` (e-mail de CLIENTE, intocável —
// ADR-0145/v4.40.0). NUNCA alterar o valor desta const. `APP_NOME_INTERNO` ('Janus') é usada
// SÓ pelos dois templates internos (senha provisória + notificação de solicitação).
const APP_NOME = 'WT Finance'
const APP_NOME_INTERNO = 'Janus'
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

// v4.40.0 (Rebranding Janus) — cabeçalho de LOCKUP DUPLO [JANUS] | [WELCOME GROUP], só para os
// e-mails INTERNOS (senha provisória + notificação de solicitação). Tabela de 3 "colunas" (logo +
// divisória + logo) com gaps em células vazias (nunca margin, ignorado pelo Outlook). Alturas
// ÓPTICAS: Janus 36px (147×36); Welcome LEVEMENTE menor, 32px (165×32) — harmonia entre as artes,
// ajuste do checkpoint v4.40.0. `vertical-align:middle` nas células.
// A divisória: DIV interno com height + line-height IGUAIS (+ mso-line-height-rule:exactly) —
// a 1ª versão (height só no <td> com font-size:0/line-height:0) era COLAPSADA pelo motor
// Word do Outlook e a barra saía CORTADA (visto no Outlook real, checkpoint). Nunca border-left.
function lockupDuploHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
          <tr>
            <td align="center" valign="middle" style="padding:0;">
              <img src="cid:${LOGO_JANUS_CID}" alt="Janus" width="147" height="36" style="display:block;width:147px;height:36px;max-width:147px;border:0;" />
            </td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td width="1" valign="middle" style="width:1px;padding:0;">
              <div style="width:1px;height:40px;line-height:40px;mso-line-height-rule:exactly;font-size:0;background-color:${COR_LINHA};">&nbsp;</div>
            </td>
            <td width="18" style="width:18px;font-size:0;line-height:0;">&nbsp;</td>
            <td align="center" valign="middle" style="padding:0;">
              <img src="cid:${LOGO_CID}" alt="Welcome Group" width="165" height="32" style="display:block;width:165px;height:32px;max-width:165px;border:0;" />
            </td>
          </tr>
        </table>`
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

  // Formato do assunto interno (checkpoint v4.40.0): "[Assunto] | Janus".
  const assunto = tipo === 'criacao'
    ? `Seu acesso foi criado | ${APP_NOME_INTERNO}`
    : `Sua senha foi redefinida | ${APP_NOME_INTERNO}`

  const intro = tipo === 'criacao'
    ? `Seu acesso à plataforma ${APP_NOME_INTERNO} foi criado. Use a senha provisória abaixo para entrar:`
    : `A senha de acesso à plataforma ${APP_NOME_INTERNO} foi redefinida. Use a senha provisória abaixo para entrar:`

  const text =
    `${saudacao},\n\n` +
    `${intro}\n\n` +
    `Senha provisória: ${senha}\n\n` +
    (linkAcesso ? `Acesse a plataforma: ${linkAcesso}\n\n` : '') +
    'Por segurança, você deverá definir uma nova senha no primeiro acesso.\n\n' +
    'Se você não esperava este e-mail, ignore-o ou fale com o administrador.\n\n' +
    `— ${APP_NOME_INTERNO}`

  // CTA "Acessar a plataforma" — só com URL base (config). Botão em CÉLULA DE TABELA:
  // o PADDING vai na <td> (não no <a>), porque o Outlook ignora `background`/`padding`
  // em <a> inline e renderiza o "tarjado apertado". Mesmo padrão do e-mail de
  // Solicitações (v4.25.1) — botão retangular de verdade, inclusive no Outlook.
  const botaoLinha = linkAcesso
    ? `<tr><td class="em-pad" align="center" style="padding:28px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
          <tr><td align="center" bgcolor="${COR_TITULO}" style="border-radius:12px;padding:14px 34px;">
            <a href="${escaparHtml(linkAcesso)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Acessar a plataforma</a>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  // Cabeçalho: lockup duplo [JANUS] | [WELCOME GROUP] (v4.40.0) — só nos internos, ver
  // `lockupDuploHtml()`. alt text garante leitura mesmo sem render de imagem.
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
        ${lockupDuploHtml()}
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
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">JANUS&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
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

export type MovimentacaoEmail = 'criada' | 'aprovada' | 'concluida' | 'rejeitada' | 'cancelada'
const MOV_PT: Record<MovimentacaoEmail, string> = {
  criada: 'criada', aprovada: 'aprovada', concluida: 'concluída',
  rejeitada: 'rejeitada', cancelada: 'cancelada',
}
// Cor do status (badge + faixa lateral) por movimentação — MESMA paleta das badges da
// página Movimentações: criada=dourado, aprovada=âmbar, concluída=verde,
// rejeitada=vermelho, cancelada=cinza. Hex literal (e-mail não enxerga var() de token).
// 'aprovada' usa o --warning-DEEP (#8A6413), não o --warning puro (#D9A23F): este último
// é vizinho demais do dourado de 'criada' (#BD965C) e as duas faixas ficariam quase
// indistinguíveis na caixa de entrada — que é justamente onde a distinção importa.
const MOV_COR: Record<MovimentacaoEmail, string> = {
  criada: '#BD965C', aprovada: '#8A6413', concluida: '#5F7A3D',
  rejeitada: '#A35442', cancelada: '#75777B',
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

  // Formato do assunto interno (checkpoint v4.40.0): "[Assunto] | Janus".
  const assunto = `Solicitação ${mov}: ${titulo} | ${APP_NOME_INTERNO}`

  const text =
    `A solicitação "${titulo}" foi ${mov}${quando ? ` em ${quando}` : ''}.\n\n` +
    `Atribuída a ${input.atribuidoRotulo}, por ${input.autorRotulo}.\n\n` +
    (just ? `Justificativa: ${just}\n\n` : '') +
    (link ? `Acesse suas solicitações: ${link}\n\n` : '') +
    'Você recebe este e-mail por estar envolvido nesta solicitação.\n\n' +
    `— ${APP_NOME_INTERNO}`

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
        ${lockupDuploHtml()}
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
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">JANUS&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}

// ── v4.35.0 (Fase 4a) — E-mail de FATURA (boleto + nota anexados) ────────────────
// MESMO layout Outlook-safe (tabelas/inline/logo CID/botão em célula/responsivo). Corpo
// do legado (envio_faturas.py) com CORPO CONDICIONAL: menciona a nota fiscal SÓ quando ela
// vai anexada (boleto-only não fala em nota). Em MODO TESTE, faixa âmbar no topo com o
// destinatário REAL + prefixo no assunto (o e-mail vai para a caixa de teste, ver fatura.ts).
// Assunto: 'Fatura Welcome Trips – {cliente} – Nº {ref}'. Reusa TemplateSenha como shape.

// Tokens de teste (âmbar --gestao; e-mail usa hex inline — src/lib/email é isento do lint de cor).
const COR_TESTE_BG    = '#FAEEDA'
const COR_TESTE_BORDA = '#BA7517'
const COR_TESTE_FG    = '#633806'

export function templateFaturaEmail(input: {
  cliente:           string
  ref:               string
  /** true → o corpo menciona a nota fiscal (ela vai anexada). */
  temNota:           boolean
  /** true → modo teste: prefixo no assunto + faixa no corpo com o destinatário real. */
  teste:             boolean
  /** Destinatário(s) real(is) — exibido só em modo teste ("iria para..."). */
  destinatarioReal?: string | null
}): TemplateSenha {
  const cliente = input.cliente?.trim() || 'cliente'
  const ref     = input.ref?.trim() || ''
  const real    = input.destinatarioReal?.trim() || '(sem destinatário)'

  const assuntoBase = `Fatura Welcome Trips – ${cliente}${ref ? ` – Nº ${ref}` : ''}`
  const assunto = input.teste ? `[TESTE — destinatário real: ${real}] ${assuntoBase}` : assuntoBase

  // Corpo CONDICIONAL: a nota só é mencionada quando vai anexada. O boleto vai como ANEXO
  // (sem botão/link no corpo — v4.36.0/M0); "Caso tenham dúvidas" fecha o mesmo bloco de corpo.
  const fraseAnexo = input.temNota
    ? 'Segue em anexo a fatura referente aos serviços prestados, juntamente com boleto e nota fiscal.'
    : 'Segue em anexo a fatura referente aos serviços prestados, juntamente com boleto.'

  const text =
    (input.teste ? `[MODO TESTE — este e-mail iria para: ${real}]\n\n` : '') +
    'Prezados,\n\n' +
    `${fraseAnexo}\n\n` +
    'Caso tenham dúvidas, estamos à disposição.\n\n' +
    `— ${APP_NOME}`

  const faixaTeste = input.teste
    ? `<tr><td class="em-pad" style="padding:22px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_TESTE_BG};border:1px solid ${COR_TESTE_BORDA};border-radius:10px;">
          <tr><td style="padding:12px 16px;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COR_TESTE_FG};font-weight:bold;margin-bottom:4px;">Modo teste</div>
            <div style="font-size:13px;line-height:1.55;color:${COR_TESTE_FG};">Este e-mail iria para: <strong>${escaparHtml(real)}</strong></div>
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
      ${faixaTeste}
      <tr><td class="em-pad" style="padding:24px 40px 38px;">
        <p style="margin:0 0 12px;font-size:16px;color:${COR_TITULO};">Prezados,</p>
        <p style="margin:0 0 14px;font-size:14px;line-height:1.65;color:${COR_TEXTO};">${escaparHtml(fraseAnexo)}</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:${COR_TEXTO};">Caso tenham dúvidas, estamos à disposição.</p>
      </td></tr>
    </table>
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">WT&nbsp;FINANCE&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}

// ── v5.0.1 — Notificação de NOVA SOLICITAÇÃO DE ACESSO (auto-cadastro na tela de login) ──
// Para quem administra Usuários & Acessos. E-mail INTERNO → lockup duplo [JANUS] | [WELCOME
// GROUP] (mesmo shell Outlook-safe dos demais internos: tabelas/inline/logo CID/botão em
// célula/responsivo). Fan-out best-effort no index.ts. Reusa TemplateSenha como shape.
export function templateNotificacaoAcessoSolicitado(input: {
  emailSolicitante: string
  nomeSolicitante?: string | null
  /** Momento do pedido, JÁ formatado (ex.: "13 de julho de 2026, 11:35"). */
  quando?:          string | null
  /** URL da tela Usuários & Acessos p/ o botão. Ausente → sem botão. */
  link?:            string | null
}): TemplateSenha {
  const email  = input.emailSolicitante.trim()
  const nome   = input.nomeSolicitante?.trim() || null
  const quando = input.quando?.trim() || null
  const link   = input.link?.trim() || null

  const assunto = `Nova solicitação de acesso | ${APP_NOME_INTERNO}`

  const text =
    'Nova solicitação de acesso\n\n' +
    'Um novo pedido de acesso à plataforma foi registrado na tela de login. ' +
    'Revise e aprove ou recuse em Usuários & Acessos.\n\n' +
    `E-mail: ${email}\n` +
    (nome ? `Nome informado: ${nome}\n` : '') +
    (quando ? `Solicitado em: ${quando}\n` : '') +
    (link ? `\nAcesse a plataforma: ${link}\n` : '') +
    '\nNada é criado até a aprovação — o solicitante só recebe acesso (e a senha provisória) depois que você aprovar.\n\n' +
    'Você recebe este aviso porque administra Usuários & Acessos.\n\n' +
    `— ${APP_NOME_INTERNO}`

  // Caixa de dados: rótulo à esquerda, valor à direita, com divisórias entre as linhas.
  const linhaInfo = (rotulo: string, valor: string, bold = false) =>
    `<tr>
      <td style="padding:9px 0;font-size:13px;color:${COR_LABEL};white-space:nowrap;">${escaparHtml(rotulo)}</td>
      <td align="right" style="padding:9px 0;font-size:14px;color:${COR_TITULO};${bold ? 'font-weight:bold;' : ''}">${escaparHtml(valor)}</td>
    </tr>`
  const divisoria = `<tr><td colspan="2" style="border-top:1px solid ${COR_BORDA};font-size:0;line-height:0;">&nbsp;</td></tr>`
  const linhas = [linhaInfo('E-mail', email, true)]
  if (nome)   linhas.push(divisoria, linhaInfo('Nome informado', nome))
  if (quando) linhas.push(divisoria, linhaInfo('Solicitado em', quando))

  // Botão em CÉLULA (padding na <td>, não no <a> — Outlook). Texto "Acessar a plataforma".
  const botaoLinha = link
    ? `<tr><td class="em-pad" align="center" style="padding:28px 40px 0;">
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
        ${lockupDuploHtml()}
      </td></tr>
      <tr><td class="em-pad" style="padding:26px 40px 0;">
        <div style="border-top:1px solid ${COR_LINHA};font-size:0;line-height:0;">&nbsp;</div>
      </td></tr>
      <tr><td class="em-pad" style="padding:24px 40px 0;">
        <p style="margin:0 0 10px;font-size:16px;color:${COR_TITULO};">Nova solicitação de acesso</p>
        <p style="margin:0;font-size:14px;line-height:1.65;color:${COR_TEXTO};">Um novo pedido de acesso à plataforma foi registrado na tela de login. Revise os dados e aprove ou recuse em <b>Usuários &amp; Acessos</b>.</p>
      </td></tr>
      <tr><td class="em-pad" style="padding:22px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-radius:10px;">
          <tr><td style="padding:6px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${linhas.join('')}
            </table>
          </td></tr>
        </table>
      </td></tr>
      ${botaoLinha}
      <tr><td class="em-pad" style="padding:30px 40px 0;">
        <p style="margin:0;font-size:13px;line-height:1.65;color:${COR_TEXTO};">Nada é criado até a aprovação — o solicitante só recebe acesso (e a senha provisória) depois que você aprovar.</p>
      </td></tr>
      <tr><td class="em-pad" style="padding:12px 40px 38px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COR_TENUE};">Você recebe este aviso porque administra Usuários &amp; Acessos.</p>
      </td></tr>
    </table>
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">JANUS&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}

// ── v6.0.0/M6 — Alarme de ingestão (interno, para quem administra a ingestão) ────────────
// MESMO layout Outlook-safe (tabelas/inline/logo CID/lockup duplo/responsivo). A DECISÃO de
// alarmar é de OUTRO módulo (ingestao.alarme + carga.ts/vigia) — este template só FORMATA o
// que já foi decidido, com os números que o operador precisa para agir sem abrir a tela
// (anexo v6.0.0/M6 §4/§5): o que aconteceu, em qual base/processo, quando, e a grandeza que
// o explica. Em MODO TESTE, assunto e corpo dizem isso EXPLICITAMENTE — um alarme de teste
// não pode ser confundido com um real (mesmo espírito do prefixo de `templateFaturaEmail`).

const COR_ALARME = '#A35442'   // vermelho — mesma semântica de "rejeitada" em MOV_COR acima

function numPt(n: number): string {
  return n.toLocaleString('pt-BR')
}
/** Delta com sinal explícito ("+6" / "-3" / "0") — nunca ambíguo sobre a direção da mudança. */
function comSinal(n: number): string {
  return n > 0 ? `+${numPt(n)}` : numPt(n)
}
/** Delta monetário com sinal, a partir de CENTAVOS (a grandeza que o diff da M4 compara). */
function deltaBRL(centavosAntes: number, centavosDepois: number): string {
  const delta = centavosDepois - centavosAntes
  const sinal = delta > 0 ? '+' : delta < 0 ? '-' : ''
  return `${sinal}${fmtBRL2(Math.abs(delta) / 100)}`
}

export type TipoAlarmeIngestao =
  | 'checksum_falho'
  | 'ano_fechado_alterado'
  | 'par_novo_bandeja'
  | 'processo_sem_resultado'
  | 'carga_esperada_nao_chegou'

/** Carga rejeitada por checksum (ou outra rejeição de conteúdo) — chave do incidente = `cargaId`. */
export interface AlarmeChecksumFalho {
  tipo:    'checksum_falho'
  base:    BaseIngestao
  cargaId: string
  /** Mensagem ORIGINAL da rejeição (ex.: `CargaRejeitada.message`) — nunca reescrita em prosa genérica. */
  motivo:  string
  /** Código da rejeição (`ErroCarga.codigo`: `CHECKSUM_FALHOU`, `FORMATO_INVALIDO`,
   *  `ESTRUTURA_INESPERADA`, `ARQUIVO_AUSENTE`…). O tipo do alarme cobre TODA rejeição de
   *  conteúdo, mas o texto só afirma "checksum" quando o código diz isso — o e-mail não pode
   *  mandar o operador procurar a causa no lugar errado. Ausente = causa não informada. */
  codigo?: string
}

/** A rejeição foi mesmo de checksum? — decide só a PROSA do alarme `checksum_falho`. */
function rejeicaoPorChecksum(a: AlarmeChecksumFalho): boolean {
  return a.codigo === 'CHECKSUM_FALHOU'
}

/** Carga aplicada mexeu num ano anterior ao corrente — QUALQUER valor dispara (decisão 1 do
 *  anexo). Grandeza: contagem E soma (a mesma dos dois lados do diff — lição da M4). */
export interface AlarmeAnoFechadoAlterado {
  tipo:           'ano_fechado_alterado'
  base:           BaseIngestao
  ano:            number
  linhasAntes:    number
  linhasDepois:   number
  /** Centavos (evita ponto-flutuante) — mesma unidade das colunas de valor no banco. */
  centavosAntes:  number
  centavosDepois: number
  cargaId?:       string | null
}

/** Carga do Demonstrativo trouxe pares novos para a bandeja de revisão. */
export interface AlarmeParNovoBandeja {
  tipo:       'par_novo_bandeja'
  cargaId:    string
  paresNovos: number
}

/** Processo agendado (cron) sem execução `ok`/`pulado` dentro da tolerância — o vigia decide;
 *  este template só formata. */
export interface AlarmeProcessoSemResultado {
  tipo:     'processo_sem_resultado'
  processo: string
  /** 'DD/MM/AAAA às HH:MM' (fuso SP), já formatado pelo chamador — `null` = nunca registrou execução OK. */
  ultimaExecucaoOkEm?: string | null
  minutosSemResultado: number
}

/** Base com expectativa ativa sem carga aplicada dentro da janela. */
export interface AlarmeCargaEsperadaNaoChegou {
  tipo: 'carga_esperada_nao_chegou'
  base: BaseIngestao
  /** 'DD/MM/AAAA às HH:MM' (fuso SP), já formatado pelo chamador — `null` = nunca houve carga aplicada. */
  ultimaCargaEm?: string | null
  horasSemCarga:  number
}

/** Um alarme de ingestão JÁ DECIDIDO — `enviarAlarmeIngestao`/este template não decidem se
 *  há alarme, só formatam e enviam o que outro módulo decidiu (anexo v6.0.0/M6 §5). */
export type AlarmeIngestao =
  | AlarmeChecksumFalho
  | AlarmeAnoFechadoAlterado
  | AlarmeParNovoBandeja
  | AlarmeProcessoSemResultado
  | AlarmeCargaEsperadaNaoChegou

/** Par rótulo/valor da caixa de detalhe — MÓDULO-level (não local a uma função) para ser
 *  reusado pelo template de alarme sem duplicar o helper de `templateNotificacaoAcessoSolicitado`. */
function linhaDetalheAlarme(rotulo: string, valor: string): string {
  return `<tr>
      <td style="padding:9px 0;font-size:13px;color:${COR_LABEL};white-space:nowrap;">${escaparHtml(rotulo)}</td>
      <td align="right" style="padding:9px 0;font-size:14px;font-weight:bold;color:${COR_TITULO};">${escaparHtml(valor)}</td>
    </tr>`
}
const DIVISORIA_DETALHE_ALARME = `<tr><td colspan="2" style="border-top:1px solid ${COR_BORDA};font-size:0;line-height:0;">&nbsp;</td></tr>`

interface CorpoAlarme {
  /** Headline da caixa colorida — o que aconteceu, em uma linha. */
  titulo: string
  /** Pares rótulo/valor da caixa de detalhe — a base/processo, o `carga_id`, os números. */
  linhas: [string, string][]
  /** Parágrafo livre opcional (o `motivo` do checksum) — escapado na montagem do html. */
  extra?: string
}

/** Duração legível em pt-BR a partir de minutos — "50.400 minutos" não se lê numa caixa de
 *  entrada. ≥ 2 dias → dias; ≥ 2 horas → horas; senão minutos. */
function duracaoPt(minutos: number): string {
  if (minutos >= 2 * 24 * 60) return `${numPt(Math.round(minutos / (24 * 60)))} dias`
  if (minutos >= 120) return `${numPt(Math.round(minutos / 60))} horas`
  return `${numPt(minutos)} minuto(s)`
}

function montarCorpoAlarme(a: AlarmeIngestao): CorpoAlarme {
  switch (a.tipo) {
    case 'checksum_falho':
      return {
        titulo: rejeicaoPorChecksum(a)
          ? `Carga rejeitada — checksum não fechou (${ROTULO_BASE[a.base]})`
          : `Carga rejeitada (${ROTULO_BASE[a.base]})`,
        linhas: [
          ['Base', ROTULO_BASE[a.base]], ['Carga', a.cargaId],
          ...(a.codigo ? [['Código', a.codigo] as [string, string]] : []),
        ],
        extra:  a.motivo,
      }
    case 'ano_fechado_alterado':
      return {
        titulo: `Ano fechado alterado — ${ROTULO_BASE[a.base]}, ${a.ano}`,
        linhas: [
          ['Base', ROTULO_BASE[a.base]],
          ['Ano', String(a.ano)],
          ['Linhas', `${numPt(a.linhasAntes)} → ${numPt(a.linhasDepois)} (${comSinal(a.linhasDepois - a.linhasAntes)})`],
          ['Valor', `${fmtBRL2(a.centavosAntes / 100)} → ${fmtBRL2(a.centavosDepois / 100)} (${deltaBRL(a.centavosAntes, a.centavosDepois)})`],
          ...(a.cargaId ? [['Carga', a.cargaId] as [string, string]] : []),
        ],
      }
    case 'par_novo_bandeja':
      return {
        titulo: `${numPt(a.paresNovos)} par(es) novo(s) na bandeja — ${ROTULO_BASE['demonstrativo-competencia']}`,
        linhas: [['Pares novos', numPt(a.paresNovos)], ['Carga', a.cargaId]],
      }
    case 'processo_sem_resultado':
      return {
        titulo: `Processo sem resultado — ${a.processo}`,
        linhas: [
          ['Processo', a.processo],
          // Sem nenhuma execução OK registrada, o número é só o PISO (a tolerância inteira) — não
          // um fato medido; o rótulo diz isso em vez de afirmar uma duração exata.
          a.ultimaExecucaoOkEm
            ? ['Sem resultado há', duracaoPt(a.minutosSemResultado)]
            : ['Sem resultado há pelo menos', duracaoPt(a.minutosSemResultado)],
          ['Última execução OK', a.ultimaExecucaoOkEm ?? 'nunca registrada'],
        ],
      }
    case 'carga_esperada_nao_chegou':
      return {
        titulo: `Carga esperada não chegou — ${ROTULO_BASE[a.base]}`,
        linhas: [
          ['Base', ROTULO_BASE[a.base]],
          a.ultimaCargaEm
            ? ['Sem carga há', duracaoPt(a.horasSemCarga * 60)]
            : ['Sem carga há pelo menos', duracaoPt(a.horasSemCarga * 60)],
          ['Última carga aplicada', a.ultimaCargaEm ?? 'nunca houve'],
        ],
      }
  }
}

/** Primeira linha — o que aconteceu, em prosa direta (entra no topo do corpo): quem lê numa
 *  caixa cheia decide se é urgente já nesta linha. */
function primeiraLinhaAlarme(a: AlarmeIngestao): string {
  switch (a.tipo) {
    case 'checksum_falho':
      return rejeicaoPorChecksum(a)
        ? `Uma carga da base "${ROTULO_BASE[a.base]}" foi REJEITADA: o checksum não fechou.`
        : `Uma carga da base "${ROTULO_BASE[a.base]}" foi REJEITADA — o motivo está abaixo.`
    case 'ano_fechado_alterado':
      return `Uma carga aplicada MUDOU o ano fechado ${a.ano} da base "${ROTULO_BASE[a.base]}".`
    case 'par_novo_bandeja':
      return `A carga do Demonstrativo trouxe ${numPt(a.paresNovos)} par(es) NOVO(S) para a bandeja de revisão.`
    case 'processo_sem_resultado':
      return a.ultimaExecucaoOkEm
        ? `O processo "${a.processo}" está SEM RESULTADO há ${duracaoPt(a.minutosSemResultado)}.`
        : `O processo "${a.processo}" NUNCA registrou execução OK, e já passou a tolerância de ${duracaoPt(a.minutosSemResultado)}.`
    case 'carga_esperada_nao_chegou':
      return a.ultimaCargaEm
        ? `A base "${ROTULO_BASE[a.base]}" está SEM CARGA aplicada há ${duracaoPt(a.horasSemCarga * 60)}.`
        : `A base "${ROTULO_BASE[a.base]}" NUNCA teve carga aplicada, e já passou a tolerância de ${duracaoPt(a.horasSemCarga * 60)}.`
  }
}

function assuntoBaseAlarme(a: AlarmeIngestao): string {
  switch (a.tipo) {
    case 'checksum_falho':           return rejeicaoPorChecksum(a)
      ? `Carga rejeitada (checksum) — ${ROTULO_BASE[a.base]}`
      : `Carga rejeitada — ${ROTULO_BASE[a.base]}`
    case 'ano_fechado_alterado':      return `Ano fechado alterado — ${ROTULO_BASE[a.base]} ${a.ano}`
    case 'par_novo_bandeja':         return `${numPt(a.paresNovos)} par(es) novo(s) na bandeja — Demonstrativo`
    case 'processo_sem_resultado':    return `Processo sem resultado — ${a.processo}`
    case 'carga_esperada_nao_chegou': return `Carga esperada não chegou — ${ROTULO_BASE[a.base]}`
  }
}

export function templateAlarmeIngestao(alarme: AlarmeIngestao, opts: {
  /** true → MODO TESTE: assunto e corpo dizem isso explicitamente (não é um incidente real). */
  teste: boolean
  /** Link PRONTO para `/admin/ingestao` (já montado pelo chamador via `getAppBaseUrl()`) —
   *  `null` → botão omitido, e-mail segue válido. Template não concatena rota (mesmo padrão
   *  de `templateNotificacaoSolicitacao`/`link`). */
  link: string | null
}): TemplateSenha {
  const corpo  = montarCorpoAlarme(alarme)
  const linha1 = primeiraLinhaAlarme(alarme)
  const link   = opts.link?.trim() || null

  const assunto = `${opts.teste ? '[ALARME DE TESTE] ' : '[ALARME] '}${assuntoBaseAlarme(alarme)} | ${APP_NOME_INTERNO}`

  const linhasHtml = corpo.linhas.map(([r, v]) => linhaDetalheAlarme(r, v))
  const comDivisorias = linhasHtml.flatMap((l, i) => (i === 0 ? [l] : [DIVISORIA_DETALHE_ALARME, l]))

  const extraParagrafo = corpo.extra
    ? `<tr><td class="em-pad" style="padding:16px 40px 0;">
        <p style="margin:0;font-size:13px;line-height:1.6;color:${COR_TEXTO};"><strong>Motivo:</strong> ${escaparHtml(corpo.extra)}</p>
      </td></tr>`
    : ''

  const faixaTeste = opts.teste
    ? `<tr><td class="em-pad" style="padding:22px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_TESTE_BG};border:1px solid ${COR_TESTE_BORDA};border-radius:10px;">
          <tr><td style="padding:12px 16px;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COR_TESTE_FG};font-weight:bold;margin-bottom:4px;">Alarme de teste</div>
            <div style="font-size:13px;line-height:1.55;color:${COR_TESTE_FG};">Este alarme é de TESTE — não corresponde a um incidente real.</div>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  const botaoLinha = link
    ? `<tr><td class="em-pad" align="center" style="padding:26px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
          <tr><td align="center" bgcolor="${COR_TITULO}" style="border-radius:12px;padding:14px 34px;">
            <a href="${escaparHtml(link)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Ver na plataforma</a>
          </td></tr>
        </table>
      </td></tr>`
    : ''

  const text =
    (opts.teste ? '[ALARME DE TESTE — não corresponde a um incidente real]\n\n' : '[ALARME]\n\n') +
    `${linha1}\n\n` +
    corpo.linhas.map(([r, v]) => `${r}: ${v}`).join('\n') + '\n\n' +
    (corpo.extra ? `Motivo: ${corpo.extra}\n\n` : '') +
    (link ? `Ver na plataforma: ${link}\n\n` : '') +
    'Você recebe este aviso porque administra a ingestão de dados.\n\n' +
    `— ${APP_NOME_INTERNO}`

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
        ${lockupDuploHtml()}
      </td></tr>
      <tr><td class="em-pad" style="padding:26px 40px 0;">
        <div style="border-top:1px solid ${COR_LINHA};font-size:0;line-height:0;">&nbsp;</div>
      </td></tr>
      ${faixaTeste}
      <tr><td class="em-pad" style="padding:24px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-left:3px solid ${COR_ALARME};border-radius:12px;">
          <tr><td style="padding:16px 18px;">
            <div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${COR_ALARME};font-weight:bold;margin-bottom:7px;">Alarme de ingestão</div>
            <div style="font-size:16px;font-weight:bold;line-height:1.4;color:${COR_TITULO};">${escaparHtml(corpo.titulo)}</div>
          </td></tr>
        </table>
      </td></tr>
      <tr><td class="em-pad" style="padding:18px 40px 0;">
        <p style="margin:0;font-size:14px;line-height:1.65;color:${COR_TEXTO};">${escaparHtml(linha1)}</p>
      </td></tr>
      <tr><td class="em-pad" style="padding:18px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COR_SENHA_BG};border:1px solid ${COR_BORDA};border-radius:10px;">
          <tr><td style="padding:6px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${comDivisorias.join('')}
            </table>
          </td></tr>
        </table>
      </td></tr>
      ${extraParagrafo}
      ${botaoLinha}
      <tr><td class="em-pad" style="padding:26px 40px 38px;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:${COR_TENUE};">Você recebe este aviso porque administra a ingestão de dados.</p>
      </td></tr>
    </table>
    <table role="presentation" class="em-card" width="480" cellpadding="0" cellspacing="0" style="width:100%;max-width:480px;">
      <tr><td align="center" style="padding:18px 0 0;font-size:11px;letter-spacing:1px;color:${COR_TENUE};">JANUS&nbsp;&nbsp;·&nbsp;&nbsp;WELCOME&nbsp;GROUP</td></tr>
    </table>
  </td></tr>
</table>`

  return { assunto, html, text }
}
