import 'server-only'

// O VIGIA (v6.0.0/M6 — anexo `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md` §3/§4).
// Lê `ingestao_vigia_estado()` (migration 0280 + complemento do painel — service_role-only),
// decide por EXPECTATIVA se abre/resolve um incidente de ESTADO (`processo_sem_resultado` /
// `carga_esperada_nao_chegou`), e reenvia o que estiver em `pendentes_notificacao` (via
// `./alarme.ts`, reusado — não duplicado).
//
// ⚠️ O vigia NÃO lê `ingestao_painel()` — aquela RPC devolve só as últimas 100 execuções no
// TOTAL, e o incremental do Monde roda 96×/dia; a reconciliação sumiria do recorte em ~25h
// contra uma tolerância de 30h, e o vigia alarmaria um processo saudável (contrato da
// delegação). `ingestao_vigia_estado()` é dedicada: uma entrada por expectativa, já com
// `ultimo_sinal_em` (para processo: última execução `ok`/`pulado`; para base: última carga
// `aplicada`) e o `agora` do BANCO — nunca o relógio do processo Node, que pode divergir.
//
// A decisão "abre / resolve / nada" é FUNÇÃO PURA (`decidirAcaoExpectativa`) — sem rede, sem
// banco, exaustivamente testável. `rodarVigia` é a orquestração (I/O) que a usa.

import { getAdminClient } from '@/lib/supabase/admin'
import { fmtDataHoraSP } from '@/lib/fmt'
import type { AlarmeIngestao, TipoAlarmeIngestao } from '@/lib/email/template'
import { ehBaseIngestao } from './bases'
import {
  abrirIncidente, resolverIncidente, marcarNotificado, reenviarPendentesNotificacao,
  type PendenteNotificacao,
} from './alarme'
import { enviarAlarmeIngestao } from '@/lib/email/alarme-ingestao'

// `database.ts` regenerado (0280 aplicada) tipa `ingestao_vigia_estado` (`Args: never` — função
// sem parâmetro) — chamada DIRETA em `getAdminClient()`, sem o helper frouxo `BoundRpc` (padrão
// atualizado por pedido do orquestrador nesta mesma missão).

// ── Shape de `ingestao_vigia_estado()` (contrato da delegação — RPC escrita por outro agente
//    na mesma missão; validação MANUAL e tolerante, molde de `log.ts`/`carga.ts`: superfície
//    interna, service_role-only, sem consumidor de UI) ───────────────────────────────────────

export interface VigiaExpectativa {
  readonly alvo: string
  readonly tipo: 'processo' | 'base'
  readonly ativo: boolean
  /** Tolerância em SEGUNDOS (o contrato da delegação declara explicitamente esta unidade). */
  readonly tolerancia_segundos: number
  /** Para processo: última execução `ok`/`pulado`. Para base: última carga `aplicada`.
   *  `null` = nunca houve. */
  readonly ultimo_sinal_em: string | null
}

export interface VigiaAlarmeAberto {
  readonly id: string
  readonly tipo: string
  readonly chave: string
  readonly notificado_em: string | null
}

export interface VigiaEstado {
  /** O `now()` do BANCO — nunca `Date.now()` do processo Node (contrato da delegação). */
  readonly agora: string
  readonly expectativas: readonly VigiaExpectativa[]
  readonly alarmes_abertos: readonly VigiaAlarmeAberto[]
  /** Incidentes de QUALQUER tipo com `notificado_em IS NULL` — inclusive alarme de EVENTO cujo
   *  e-mail falhou em `carga.ts` (que já resolveu o incidente; `pendentes_notificacao` não
   *  filtra por `resolvido_em`, só por `notificado_em`). */
  readonly pendentes_notificacao: readonly PendenteNotificacao[]
}

function comoExpectativa(x: unknown): VigiaExpectativa | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.alvo !== 'string') return null
  if (o.tipo !== 'processo' && o.tipo !== 'base') return null
  if (typeof o.ativo !== 'boolean') return null
  const tolerancia = typeof o.tolerancia_segundos === 'number' ? o.tolerancia_segundos : Number(o.tolerancia_segundos)
  if (!Number.isFinite(tolerancia)) return null
  const ultimo = typeof o.ultimo_sinal_em === 'string' ? o.ultimo_sinal_em : null
  return { alvo: o.alvo, tipo: o.tipo, ativo: o.ativo, tolerancia_segundos: tolerancia, ultimo_sinal_em: ultimo }
}

function comoAlarmeAberto(x: unknown): VigiaAlarmeAberto | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.tipo !== 'string' || typeof o.chave !== 'string') return null
  return { id: o.id, tipo: o.tipo, chave: o.chave, notificado_em: typeof o.notificado_em === 'string' ? o.notificado_em : null }
}

function comoPendente(x: unknown): PendenteNotificacao | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.tipo !== 'string' || typeof o.chave !== 'string') return null
  return { id: o.id, tipo: o.tipo, chave: o.chave, detalhe: o.detalhe ?? null }
}

function comoVigiaEstado(data: unknown): VigiaEstado | null {
  if (typeof data !== 'object' || data === null) return null
  const o = data as Record<string, unknown>
  if (typeof o.agora !== 'string') return null
  const expectativas = Array.isArray(o.expectativas)
    ? o.expectativas.map(comoExpectativa).filter((e): e is VigiaExpectativa => e !== null)
    : []
  const alarmesAbertos = Array.isArray(o.alarmes_abertos)
    ? o.alarmes_abertos.map(comoAlarmeAberto).filter((a): a is VigiaAlarmeAberto => a !== null)
    : []
  const pendentes = Array.isArray(o.pendentes_notificacao)
    ? o.pendentes_notificacao.map(comoPendente).filter((p): p is PendenteNotificacao => p !== null)
    : []
  return { agora: o.agora, expectativas, alarmes_abertos: alarmesAbertos, pendentes_notificacao: pendentes }
}

/** `ingestao_vigia_estado()` — `null` em falha de RPC/formato (nunca lança; o chamador não
 *  avalia nada nesta rodada, mas não derruba a rota do vigia por isso). */
export async function lerVigiaEstado(): Promise<VigiaEstado | null> {
  try {
    const { data, error } = await getAdminClient().rpc('ingestao_vigia_estado')
    if (error) {
      console.error('[ingestao/vigia] ingestao_vigia_estado() falhou:', error.message)
      return null
    }
    const estado = comoVigiaEstado(data)
    if (!estado) console.error('[ingestao/vigia] ingestao_vigia_estado() devolveu formato inesperado.', data)
    return estado
  } catch (err) {
    console.error('[ingestao/vigia] ingestao_vigia_estado() lançou:', err)
    return null
  }
}

// ── Decisão PURA por expectativa — sem rede, sem banco, sem `Date.now()` implícito ─────────

export type AcaoVigia =
  | { readonly acao: 'nada' }
  | { readonly acao: 'resolver'; readonly tipo: TipoAlarmeIngestao; readonly chave: string }
  | { readonly acao: 'abrir'; readonly tipo: TipoAlarmeIngestao; readonly chave: string; readonly alarme: AlarmeIngestao }

/**
 * `exp` — a expectativa (com `ultimo_sinal_em` já mesclado pela RPC: para processo, é
 * `ok`/`pulado` — um lock ocupado é cron SAUDÁVEL, "pulado conta como sinal saudável" é
 * resolvido NA LEITURA, esta função só compara o instante). `agoraMs` — `Date.parse(estado.agora)`,
 * o relógio do BANCO. `incidenteAberto` — `true` se já existe um incidente ABERTO desta
 * (tipo, chave) em `estado.alarmes_abertos` (o chamador monta esse lookup uma vez por rodada).
 *
 * Regras (prova exaustiva em `vigia.test.ts`):
 *  - inativa ⇒ nada, sempre — mesmo fora da tolerância ou nunca tendo sinal;
 *  - dentro da tolerância (`<=`, inclusive no limite exato — nunca oscila entre rodadas porque
 *    a função não usa relógio próprio): incidente aberto ⇒ resolve; senão ⇒ nada;
 *  - fora da tolerância (ou NUNCA houve sinal, `ultimo_sinal_em === null`): já aberto ⇒ nada
 *    (não reabre, não reenvia — o reenvio de notificação pendente é OUTRO mecanismo,
 *    `reenviarPendentesNotificacao`, que não depende desta decisão); senão ⇒ abre, com o
 *    `AlarmeIngestao` já pronto para o e-mail.
 */
export function decidirAcaoExpectativa(
  exp: VigiaExpectativa,
  agoraMs: number,
  incidenteAberto: boolean,
): AcaoVigia {
  const tipo: TipoAlarmeIngestao = exp.tipo === 'processo' ? 'processo_sem_resultado' : 'carga_esperada_nao_chegou'

  // Expectativa DESLIGADA: o que ninguém espera não está em alarme. Com incidente aberto (a
  // expectativa foi desligada enquanto alarmava), RESOLVE — senão o incidente ficaria aberto para
  // sempre no topo da tela, sem nenhuma ação na UI que o feche.
  if (!exp.ativo) return incidenteAberto ? { acao: 'resolver', tipo, chave: exp.alvo } : { acao: 'nada' }
  const ultimoMs = exp.ultimo_sinal_em ? Date.parse(exp.ultimo_sinal_em) : null
  const dentroDaTolerancia = ultimoMs !== null && (agoraMs - ultimoMs) <= exp.tolerancia_segundos * 1000

  if (dentroDaTolerancia) {
    return incidenteAberto ? { acao: 'resolver', tipo, chave: exp.alvo } : { acao: 'nada' }
  }
  if (incidenteAberto) return { acao: 'nada' }

  // Sem sinal ALGUM registrado (`ultimoMs === null`): não há "desde quando" para medir a
  // duração exibida no e-mail — usa a própria tolerância como PISO do tempo decorrido (é o
  // mínimo que se sabe: já se passou pelo menos a tolerância inteira sem nenhum sinal).
  const segundosDecorridos = ultimoMs !== null ? Math.max(0, Math.round((agoraMs - ultimoMs) / 1000)) : exp.tolerancia_segundos
  const ultimoFormatado = exp.ultimo_sinal_em ? fmtDataHoraSP(exp.ultimo_sinal_em) : null

  if (exp.tipo === 'processo') {
    const alarme: AlarmeIngestao = {
      tipo: 'processo_sem_resultado',
      processo: exp.alvo,
      minutosSemResultado: Math.round(segundosDecorridos / 60),
      ultimaExecucaoOkEm: ultimoFormatado,
    }
    return { acao: 'abrir', tipo, chave: exp.alvo, alarme }
  }

  // tipo === 'base' — `alvo` tem de ser uma das cinco bases (CHECK `ingestao_expectativa_alvo_valido`
  // da 0280); guard defensivo contra uma linha malformada (nunca deveria acontecer, mas
  // `exp.alvo as BaseIngestao` sem checar produziria um `ROTULO_BASE[...]` indefinido no template).
  if (!ehBaseIngestao(exp.alvo)) {
    console.error(`[ingestao/vigia] expectativa de base com alvo desconhecido: "${exp.alvo}" — ignorada.`)
    return { acao: 'nada' }
  }
  const alarme: AlarmeIngestao = {
    tipo: 'carga_esperada_nao_chegou',
    base: exp.alvo,
    horasSemCarga: Math.round(segundosDecorridos / 3600),
    ultimaCargaEm: ultimoFormatado,
  }
  return { acao: 'abrir', tipo, chave: exp.alvo, alarme }
}

// ── Orquestração (I/O) ──────────────────────────────────────────────────────────────────────

export interface ResultadoVigia {
  readonly expectativas_avaliadas: number
  readonly abertos: number
  readonly resolvidos: number
  readonly reenviados: number
  /** `true` quando `ingestao_vigia_estado()` falhou/veio em formato inesperado — nada foi
   *  avaliado nesta rodada (o vigia não é caminho crítico: a rota devolve 200 mesmo assim, e
   *  registra a própria execução como `erro`, não como `ok`). */
  readonly falha_leitura: boolean
}

/**
 * Uma rodada do vigia: lê o estado, decide por expectativa, escreve (abre/resolve/notifica), e
 * reenvia qualquer pendente de notificação (de QUALQUER tipo — inclusive evento). Nunca lança:
 * cada passo já é fail-safe por construção (`abrirIncidente`/`resolverIncidente`/
 * `enviarAlarmeIngestao` não lançam); esta função só orquestra a sequência.
 */
export async function rodarVigia(): Promise<ResultadoVigia> {
  const estado = await lerVigiaEstado()
  if (!estado) {
    return { expectativas_avaliadas: 0, abertos: 0, resolvidos: 0, reenviados: 0, falha_leitura: true }
  }

  const agoraMs = Date.parse(estado.agora)
  const abertosPorChave = new Set(estado.alarmes_abertos.map((a) => `${a.tipo}:${a.chave}`))

  let abertos = 0
  let resolvidos = 0

  for (const exp of estado.expectativas) {
    const tipoAlarme: TipoAlarmeIngestao = exp.tipo === 'processo' ? 'processo_sem_resultado' : 'carga_esperada_nao_chegou'
    const jaAberto = abertosPorChave.has(`${tipoAlarme}:${exp.alvo}`)
    const acao = decidirAcaoExpectativa(exp, agoraMs, jaAberto)

    if (acao.acao === 'resolver') {
      await resolverIncidente(acao.tipo, acao.chave)
      resolvidos++
    } else if (acao.acao === 'abrir') {
      const aberto = await abrirIncidente(acao.tipo, acao.chave, acao.alarme)
      if (aberto?.novo) {
        abertos++
        const envio = await enviarAlarmeIngestao(acao.alarme)
        if (envio.ok) {
          await marcarNotificado(aberto.id)
        } else {
          console.error(
            `[ingestao/vigia] envio do alarme "${acao.tipo}" (${acao.chave}) falhou — incidente ` +
            `${aberto.id} fica pendente de notificação (a próxima rodada reenvia): ${envio.erro}`,
          )
        }
      }
    }
  }

  const reenviados = await reenviarPendentesNotificacao(estado.pendentes_notificacao)

  return { expectativas_avaliadas: estado.expectativas.length, abertos, resolvidos, reenviados, falha_leitura: false }
}
