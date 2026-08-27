// v4.24.2 — Template do e-mail de senha provisória (criação / reset administrativo).
// Layout em TABELAS + estilos INLINE (robusto no Outlook, que usa o motor do Word):
// logo transparente centralizado, botão real em CÉLULA DE TABELA (o Outlook ignora
// `background` em <a> inline) e cartão FLUIDO (width:100% + max-width) com media query
// para telas pequenas. Logo via CID (sem dependência externa; ver index.ts). Função
// pura — parametrizada por `tipo` e `linkAcesso`.

import { LOGO_CID, LOGO_JANUS_CID } from './logo'

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
