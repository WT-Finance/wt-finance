import 'server-only'
import nodemailer from 'nodemailer'
import { getConfigSmtp, getAppBaseUrl, type ConfigSmtp } from './config'
import {
  templateSenhaProvisoria, templateNotificacaoSolicitacao, templateNotificacaoAcessoSolicitado,
  type TipoSenha, type MovimentacaoEmail,
} from './template'
import { LOGO_CID, LOGO_WELCOME_GROUP_PNG_BASE64, LOGO_JANUS_CID, LOGO_JANUS_PNG_BASE64 } from './logo'

// v4.24.0 / v4.25.0 — Camada ÚNICA de envio (server-only). FALLBACK-SAFE acima de tudo:
// nunca lança; sem config (SMTP off) ou erro de envio → não envia e o chamador segue.
// Timeout curto: SMTP lento não trava a UX. A lógica de transporte/anexo é COMPARTILHADA
// pelas funções de envio (não duplicar) — o que muda entre e-mails é só o template.

export type { TipoSenha, MovimentacaoEmail }

/** Transporter SMTP com timeouts curtos (compartilhado — reusado por fatura.ts, v4.35.0). */
export function criarTransporter(cfg: ConfigSmtp) {
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

/** Logo Welcome Group via CID (bytes no bundle, não public/; data-URI falha no Outlook). Compartilhado. */
export function anexoLogo() {
  return {
    filename:    'welcome-group.png',
    content:     Buffer.from(LOGO_WELCOME_GROUP_PNG_BASE64, 'base64'),
    cid:         LOGO_CID,
    contentType: 'image/png',
  }
}

/**
 * v4.40.0 (Rebranding Janus) — Logo Janus via CID, mesmo padrão do `anexoLogo()`. Usado SÓ
 * nos e-mails INTERNOS (senha provisória + notificação de solicitação), junto do `anexoLogo()`,
 * para o cabeçalho de lockup duplo [JANUS] | [WELCOME GROUP]. O e-mail de FATURA (cliente,
 * `fatura.ts`) continua anexando SÓ `anexoLogo()` — fronteira intocável.
 */
export function anexoLogoJanus() {
  return {
    filename:    'janus.png',
    content:     Buffer.from(LOGO_JANUS_PNG_BASE64, 'base64'),
    cid:         LOGO_JANUS_CID,
    contentType: 'image/png',
  }
}

// ── v5.3.4 — Fan-out com CONCORRÊNCIA LIMITADA + retry de falha transitória ───
//
// POR QUE: o SMTP AUTH do Office 365 aceita no MÁXIMO 3 conexões simultâneas por mailbox
// (a 4ª leva `432 4.3.2 STOREDRV.ClientSubmit; sender thread limit exceeded`) e 30
// mensagens/min. O fan-out original disparava `Promise.allSettled` sobre TODOS os
// destinatários com um transporter sem pool — uma conexão por destinatário AO MESMO TEMPO.
// Com 4+ envolvidos, parte dos e-mails era recusada e QUEM ficava sem variava a cada
// disparo: a intermitência relatada em produção (log real: "3/5 enviados" — exatamente o
// teto de 3 conexões). O lote de faturas já era serializado com intervalo
// (revisar-envio-modal.tsx); o fan-out das notificações era a exceção.
//
// A semântica BEST-EFFORT não muda (a falha de um destinatário não derruba os outros nem o
// chamador) — muda só o RITMO: no máximo MAX_CONEXOES_SMTP em voo, deixando folga na cota
// da mailbox para os envios de outras requisições (senha provisória, fatura).

/** Teto de conexões SMTP simultâneas. 2 < 3 (limite do Office 365) = folga deliberada. */
export const MAX_CONEXOES_SMTP = 2
/** Tentativas por destinatário (1 original + 2 retries) para falha TRANSITÓRIA. */
export const MAX_TENTATIVAS = 3

/**
 * ORÇAMENTO DE TEMPO TOTAL do fan-out (15s). O chamador é uma Server Action e o usuário está
 * ESPERANDO a movimentação — sem teto, o pior caso (SMTP pendurado: 3 tentativas × 10s de
 * socketTimeout + backoff, por destinatário, 2 a 2) passaria de 90s e o usuário veria erro
 * numa movimentação que JÁ foi persistida. O orçamento é gate de ENTRADA: nunca abandona um
 * envio em voo (abandonar é o modo de falha da v4.25.1 — a função serverless congela no meio),
 * só deixa de COMEÇAR trabalho novo depois do prazo. Pior caso = 15s + um sendMail em voo
 * (~10s). Caso realista: o 432 volta rápido e o fan-out todo leva poucos segundos.
 */
let _orcamentoMs = 15_000

let _esperaRetryMs = 1_000
/** Espera entre tentativas — sobrescrevível SÓ em teste (mantém a suíte rápida). */
export function _setEsperaRetryMs(ms: number): void { _esperaRetryMs = ms }
/** Orçamento total do fan-out — sobrescrevível SÓ em teste (para exercitar o gate). */
export function _setOrcamentoMs(ms: number): void { _orcamentoMs = ms }

/**
 * Falha SMTP que vale retentar: 4xx é transitório por definição (concorrência, rate limit,
 * indisponibilidade momentânea) e erro de rede/socket sem código de resposta também.
 * 5xx é PERMANENTE (caixa inexistente) e EAUTH nunca se retenta — insistir com credencial
 * errada arrisca bloquear a conta.
 *
 * TRADE-OFF CONSCIENTE (duplicata × perda): um erro de socket pode ocorrer DEPOIS de o
 * servidor ter aceitado a mensagem (queda entre o `250 OK` do DATA e a leitura da resposta).
 * O SMTP não tem chave de idempotência, então o retry pode gerar UMA CÓPIA A MAIS. Para
 * notificação interna best-effort, receber duas vezes é preferível a não receber — que é
 * exatamente o bug que este patch corrige. Se algum dia esta camada servir e-mail
 * IRREVERSÍVEL de cliente (fatura), a decisão se inverte e precisa de idempotência própria
 * (é o que `registrar_email` faz no faturamento).
 */
function transitorio(err: unknown): boolean {
  const e = err as { responseCode?: number; code?: string } | null
  if (e?.code === 'EAUTH') return false
  if (typeof e?.responseCode === 'number') return e.responseCode >= 400 && e.responseCode < 500
  // Sem responseCode = falha de rede/conexão. As de RESOLUÇÃO/ALCANCE (ECONNREFUSED,
  // EHOSTUNREACH, ENOTFOUND) acontecem ANTES de qualquer byte de mensagem → retry sem
  // nenhum risco de duplicata.
  return e?.code === 'ETIMEDOUT'   || e?.code === 'ESOCKETTIMEDOUT' || e?.code === 'ECONNECTION'
      || e?.code === 'ESOCKET'     || e?.code === 'ECONNRESET'      || e?.code === 'ECONNREFUSED'
      || e?.code === 'EHOSTUNREACH' || e?.code === 'ENOTFOUND'      || e?.code === 'EDNS'
}

/** Resumo do erro para o log (código do SMTP na frente — é o que identifica a causa). */
function descreverErro(err: unknown): string {
  const e = err as { responseCode?: number; code?: string; message?: string } | null
  const cod = [e?.responseCode, e?.code].filter(Boolean).join('/')
  return `${cod ? `[${cod}] ` : ''}${e?.message ?? String(err)}`
}

const esperar = (ms: number) => new Promise<void>(r => { setTimeout(r, ms) })

/**
 * Um destinatário, com retry de falha transitória DENTRO do orçamento (`fim` = instante-limite).
 * NUNCA lança — devolve se saiu.
 */
async function enviarUm(
  transporter: { sendMail: (opts: Record<string, unknown>) => Promise<unknown> },
  opts: Record<string, unknown>,
  rotulo: string,
  fim: number,
): Promise<boolean> {
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    try {
      await transporter.sendMail(opts)
      return true
    } catch (err) {
      const espera = _esperaRetryMs * tentativa        // backoff linear (1s, 2s)
      const temOrcamento = Date.now() + espera < fim
      const vaiRetentar = tentativa < MAX_TENTATIVAS && transitorio(err) && temOrcamento
      const motivo = vaiRetentar ? ' — retentando'
        : !transitorio(err) ? ' — desistindo (permanente)'
        : !temOrcamento ? ' — desistindo (orçamento de tempo esgotado)'
        : ' — desistindo (teto de tentativas)'
      console.error(
        `[email] ${rotulo} → ${opts.to}: tentativa ${tentativa}/${MAX_TENTATIVAS} falhou${motivo}: ${descreverErro(err)}`,
      )
      if (!vaiRetentar) return false
      await esperar(espera)
    }
  }
  return false
}

/**
 * Fan-out compartilhado pelas notificações: mesma mensagem para N destinatários, no máximo
 * MAX_CONEXOES_SMTP em voo, dentro do orçamento de tempo. Ordem de conclusão irrelevante. NUNCA lança.
 */
async function enviarFanOut(input: {
  cfg:     ConfigSmtp
  paras:   string[]
  assunto: string
  html:    string
  text:    string
  anexos:  ReturnType<typeof anexoLogo>[]
  rotulo:  string
}): Promise<{ enviados: number; total: number }> {
  const { cfg, paras, assunto, html, text, anexos, rotulo } = input
  const transporter = criarTransporter(cfg)
  const fim = Date.now() + _orcamentoMs
  let proxima = 0
  let enviados = 0
  let naoTentados = 0
  const trabalhador = async (): Promise<void> => {
    for (let i = proxima++; i < paras.length; i = proxima++) {
      // Gate de ENTRADA do orçamento: não COMEÇA envio novo depois do prazo (o que já está
      // em voo é sempre concluído — abandonar promise em serverless é a falha da v4.25.1).
      if (Date.now() >= fim) { naoTentados++; continue }
      const ok = await enviarUm(
        transporter,
        { from: cfg.from, to: paras[i], subject: assunto, html, text, attachments: anexos },
        rotulo,
        fim,
      )
      if (ok) enviados++
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(MAX_CONEXOES_SMTP, paras.length) }, trabalhador),
  )
  if (enviados < paras.length) {
    console.error(
      `[email] ${rotulo}: ${enviados}/${paras.length} enviados (falhas best-effort` +
      `${naoTentados > 0 ? `; ${naoTentados} não tentado(s) — orçamento de ${_orcamentoMs}ms esgotado` : ''}).`,
    )
  }
  return { enviados, total: paras.length }
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
      from: cfg.from, to: input.para, subject: assunto, html, text, attachments: [anexoLogo(), anexoLogoJanus()],
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
 * destinatário, no máximo MAX_CONEXOES_SMTP em voo (v5.3.4 — o Office 365 recusa acima de
 * 3 conexões simultâneas); a falha de um NÃO derruba os outros nem o chamador. NUNCA
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
    return await enviarFanOut({
      cfg, paras, assunto, html, text,
      anexos: [anexoLogo(), anexoLogoJanus()],
      // O título já traz "Tipo #id" — o log da camada fica auto-suficiente (o chamador não
      // repete a linha de falha parcial).
      rotulo: `notificação de solicitação [${input.titulo}]`,
    })
  } catch (err) {
    console.error('[email] notificação de solicitação falhou (best-effort, ignorado):', err)
    return { enviados: 0, total: paras.length }
  }
}

/**
 * v5.0.1 — Notificação de NOVA SOLICITAÇÃO DE ACESSO para os administradores de Usuários &
 * Acessos. Mesmo e-mail para todos (fan-out best-effort com concorrência limitada a
 * MAX_CONEXOES_SMTP; a falha de um não derruba os outros nem o chamador). NUNCA lança
 * (sem config → 0 enviados).
 * Link → /admin/acessos (getAppBaseUrl). `quando` já vem formatado pelo chamador.
 */
export async function enviarNotificacaoAcessoSolicitado(input: {
  paras:            string[]
  emailSolicitante: string
  nomeSolicitante?: string | null
  quando?:          string | null
}): Promise<{ enviados: number; total: number }> {
  const cfg = getConfigSmtp()
  const paras = [...new Set(input.paras.map(p => p.trim()).filter(p => p.includes('@')))]
  if (!cfg || paras.length === 0) return { enviados: 0, total: paras.length }
  try {
    const base = getAppBaseUrl()
    const { assunto, html, text } = templateNotificacaoAcessoSolicitado({
      emailSolicitante: input.emailSolicitante,
      nomeSolicitante:  input.nomeSolicitante,
      quando:           input.quando,
      link:             base ? `${base}/admin/acessos` : null,
    })
    return await enviarFanOut({
      cfg, paras, assunto, html, text,
      anexos: [anexoLogo(), anexoLogoJanus()],
      rotulo: 'notificação de acesso',
    })
  } catch (err) {
    console.error('[email] notificação de acesso falhou (best-effort, ignorado):', err)
    return { enviados: 0, total: paras.length }
  }
}
