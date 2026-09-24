import 'server-only'

// v6.0.0/M6 — Envio do e-mail de ALARME DE INGESTÃO. Estende a camada única src/lib/email
// (reusa `criarTransporter`/`anexoLogo`/`anexoLogoJanus`/`enviarFanOut` de `index.ts`; NÃO
// duplica transporte nem o guard de conexões do Office 365). FALLBACK-SAFE: NUNCA lança —
// retorna resultado estruturado (mesmo molde de `fatura.ts`).
//
// Esta função NÃO decide se há alarme — quem decide é OUTRO módulo (`ingestao.alarme` +
// carga.ts/vigia, fora desta camada). Ela só ENVIA bem o que já foi decidido.
//
// INVARIANTE (MODO TESTE fail-closed, skill `email` §7 — `fatura.ts` é O MOLDE): o override
// do destinatário acontece AQUI, no PONTO ÚNICO da camada — impossível um chamador novo
// esquecer de aplicá-lo. Em modo teste, TODO destinatário vira EMAIL_TESTE_DESTINO; sem ele,
// o envio é RECUSADO (fail-closed). Em modo real, os destinatários vêm de
// INGESTAO_ALARME_DESTINOS; sem nenhum configurado, também RECUSADO — nunca cai para
// "ninguém" nem para o destinatário de teste por omissão.

import { getConfigSmtp, emailAmbiente, getEmailTesteDestino, getIngestaoAlarmeDestinos, getAppBaseUrl } from './config'
import { anexoLogo, anexoLogoJanus, enviarFanOut } from './index'
import { templateAlarmeIngestao } from './template'
import type { AlarmeIngestao } from './template'

export type { AlarmeIngestao }

export interface ResultadoAlarmeIngestao {
  ok: boolean
  /** Para onde FOI de fato (teste = [EMAIL_TESTE_DESTINO]; real = INGESTAO_ALARME_DESTINOS). */
  destinatariosEfetivos?: string[]
  /** Fan-out best-effort (v5.3.4): quantos dos `total` destinatários efetivamente receberam. */
  enviados?: number
  total?: number
  erro?: string
}

/**
 * Envia o e-mail de um alarme de ingestão JÁ DECIDIDO (tipo, o que está em alarme, os dados
 * que o explicam). NUNCA lança — devolve `{ok, erro}` (ou, em sucesso, `{ok:true, enviados,
 * total, destinatariosEfetivos}`, no molde do fan-out best-effort das notificações). O
 * override de destinatário (modo teste) e a recusa fail-closed vivem AQUI.
 */
export async function enviarAlarmeIngestao(alarme: AlarmeIngestao): Promise<ResultadoAlarmeIngestao> {
  const modo = emailAmbiente()

  // ── Override no PONTO ÚNICO: em teste, TUDO vai para EMAIL_TESTE_DESTINO (fail-closed). ──
  let efetivos: string[]
  if (modo === 'teste') {
    const destino = getEmailTesteDestino()
    if (!destino) {
      return { ok: false, erro: 'EMAIL_TESTE_DESTINO ausente — alarme de ingestão em modo teste recusado (fail-closed).' }
    }
    efetivos = [destino]
  } else {
    efetivos = getIngestaoAlarmeDestinos()
    if (efetivos.length === 0) {
      return { ok: false, erro: 'INGESTAO_ALARME_DESTINOS ausente/vazia em modo real — envio recusado (fail-closed).' }
    }
  }

  const cfg = getConfigSmtp()
  if (!cfg) return { ok: false, erro: 'SMTP não configurado (variáveis SMTP_* ausentes).' }

  try {
    const base = getAppBaseUrl()
    const { assunto, html, text } = templateAlarmeIngestao(alarme, {
      teste: modo === 'teste',
      link:  base ? `${base}/admin/ingestao` : null,
    })
    const { enviados, total } = await enviarFanOut({
      cfg, paras: efetivos, assunto, html, text,
      anexos: [anexoLogo(), anexoLogoJanus()],
      rotulo: `alarme de ingestão [${alarme.tipo}]`,
    })
    return { ok: true, destinatariosEfetivos: efetivos, enviados, total }
  } catch (err) {
    console.error('[email] falha ao enviar alarme de ingestão:', err)
    return { ok: false, erro: 'Falha ao enviar o e-mail de alarme (SMTP).' }
  }
}
