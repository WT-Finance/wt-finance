import 'server-only'

// Camada de ALARME (v6.0.0/M6 — anexo `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md`
// §3/§4). Envelopa as RPCs de incidente/soma-por-ano da migration 0280
// (`ingestao_alarme_abrir/resolver/marcar_notificado`, `ingestao_soma_por_ano`) e concentra:
//
//  (a) as FUNÇÕES PURAS que decidem os alarmes de EVENTO de uma carga (checksum falho, ano
//      fechado alterado, par novo na bandeja) — sem rede, sem banco, exaustivamente testáveis;
//  (b) `dispararAlarmeDeEvento`, que abre o incidente, tenta notificar e RESOLVE logo em
//      seguida — porque um alarme de EVENTO é um fato passado, não uma condição persistente
//      (migration 0280, header "ALARME DE ESTADO × ALARME DE EVENTO"). Se o envio falhar,
//      `notificado_em` continua NULL e o incidente (já resolvido) fica em
//      `pendentes_notificacao` para o vigia reenviar — é esse campo, não `resolvido_em`, que
//      decide se falta notificar;
//  (c) `reenviarPendentesNotificacao`, usada tanto pelo vigia (alarmes de ESTADO) quanto,
//      indiretamente, para os de EVENTO que caíram em (b) sem confirmar o envio.
//
// Nada aqui decide alarme de ESTADO (processo/carga sem resultado) — isso é do vigia
// (`./vigia.ts`), que só REUSA as RPCs de escrita e o reenvio definidos aqui.

import { getAdminClient } from '@/lib/supabase/admin'
import { enviarAlarmeIngestao } from '@/lib/email/alarme-ingestao'
import type {
  AlarmeIngestao, TipoAlarmeIngestao,
  AlarmeChecksumFalho, AlarmeAnoFechadoAlterado, AlarmeParNovoBandeja,
  AlarmeProcessoSemResultado, AlarmeCargaEsperadaNaoChegou,
} from '@/lib/email/template'
import type { BaseIngestao } from './bases'
import type { Json } from '@/types/database'

// `database.ts` regenerado (0280 aplicada) tipa as quatro RPCs desta camada — chamadas
// DIRETAS em `getAdminClient()`, tipadas, sem o helper frouxo `BoundRpc` (padrão atualizado
// por pedido do orquestrador nesta mesma missão; `log.ts` ainda usa o helper para as RPCs
// pré-0280, fora do escopo desta missão tocar). Chamar `.rpc(...)` direto no objeto (nunca
// destacado numa variável solta) preserva o `this` por construção — lição v5.3.5.

// ── `ingestao_soma_por_ano` — insumo do alarme "ano fechado alterado" (anexo §4) ─────────────

export interface SomaAno {
  readonly linhas: number
  readonly centavos: number
}
export type SomaPorAno = Readonly<Record<string, SomaAno>>

/** `{ano: {linhas, centavos}}` da base VIVA, ou `null` em falha de RPC (nunca lança — o
 *  chamador degrada: sem medição, nenhum alarme de ano fechado é avaliado desta vez, mas a
 *  carga não aborta por causa disto — mesma régua de `statusAtualDaBase` em `carga.ts`). */
export async function somaPorAno(base: BaseIngestao): Promise<SomaPorAno | null> {
  try {
    const { data, error } = await getAdminClient().rpc('ingestao_soma_por_ano', { p_base: base })
    if (error) {
      console.error(`[ingestao/alarme] ingestao_soma_por_ano(${base}) falhou:`, error.message)
      return null
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
    const out: Record<string, SomaAno> = {}
    for (const [ano, v] of Object.entries(data as unknown as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue
      const o = v as Record<string, unknown>
      const linhas = typeof o.linhas === 'number' ? o.linhas : Number(o.linhas)
      const centavos = typeof o.centavos === 'number' ? o.centavos : Number(o.centavos)
      if (Number.isFinite(linhas) && Number.isFinite(centavos)) out[ano] = { linhas, centavos }
    }
    return out
  } catch (err) {
    console.error(`[ingestao/alarme] ingestao_soma_por_ano(${base}) lançou:`, err)
    return null
  }
}

// ── Ano corrente em SÃO PAULO — pura, testável com Date injetada ────────────────────────────

/** Ano corrente NO FUSO DE SÃO PAULO (skill `banco-e-rpc` §3) — decide o que é "ano fechado".
 *  Recebe `agora` para ser testável (a virada de ano em SP não coincide com a virada em UTC:
 *  31/12 22h em SP já é 01/01 em UTC). Sem argumento, usa o relógio real do processo. */
export function anoCorrenteSP(agora: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora).slice(0, 4))
}

// ── Diff por ano + decisão do alarme "ano fechado alterado" — PURA (anexo §4) ───────────────

export interface ResultadoDiffPorAno {
  /** Delta de LINHAS por ano (contrato ingestao-v1 §2.3: `diff.por_ano`) — para TODO ano
   *  presente em qualquer um dos dois lados, fechado ou não. */
  readonly porAno: Record<string, number>
  /** Anos ANTERIORES ao corrente cuja contagem OU soma mudou — `diff.anos_fechados_alterados`. */
  readonly anosFechadosAlterados: readonly number[]
  /** Um `AlarmeAnoFechadoAlterado` pronto por ano fechado alterado — mesma ordem de
   *  `anosFechadosAlterados`. */
  readonly alarmes: readonly AlarmeAnoFechadoAlterado[]
}

/**
 * Compara a MESMA grandeza dos dois lados (§ header da 0280 / lição da M4): `antes`/`depois`
 * vêm os dois de `ingestao_soma_por_ano(base)`, chamada antes e depois da promoção — nunca uma
 * ponta do parser contra a outra da base viva. "Ano fechado" = estritamente anterior a
 * `anoCorrente`; qualquer mudança em `linhas` OU `centavos` dispara (decisão 1 do anexo: sem
 * limiar em R$). Pura: nenhuma chamada de rede/banco, e nenhum uso de `Date.now()` — o
 * "corrente" e as duas somas chegam prontos de quem chama.
 */
export function calcularDiffPorAno(
  base: BaseIngestao,
  cargaId: string,
  antes: SomaPorAno,
  depois: SomaPorAno,
  anoCorrente: number,
): ResultadoDiffPorAno {
  const anos = [...new Set([...Object.keys(antes), ...Object.keys(depois)])].sort()
  const porAno: Record<string, number> = {}
  const anosFechadosAlterados: number[] = []
  const alarmes: AlarmeAnoFechadoAlterado[] = []

  for (const anoStr of anos) {
    const a = antes[anoStr] ?? { linhas: 0, centavos: 0 }
    const d = depois[anoStr] ?? { linhas: 0, centavos: 0 }
    porAno[anoStr] = d.linhas - a.linhas

    const ano = Number(anoStr)
    const mudouContagem = a.linhas !== d.linhas
    const mudouSoma = a.centavos !== d.centavos
    if (ano < anoCorrente && (mudouContagem || mudouSoma)) {
      anosFechadosAlterados.push(ano)
      alarmes.push({
        tipo: 'ano_fechado_alterado', base, ano,
        linhasAntes: a.linhas, linhasDepois: d.linhas,
        centavosAntes: a.centavos, centavosDepois: d.centavos,
        cargaId,
      })
    }
  }
  return { porAno, anosFechadosAlterados, alarmes }
}

// ── Decisão PURA dos outros dois alarmes de evento (anexo §4) ───────────────────────────────

/** Carga rejeitada por CONTEÚDO — checksum e as demais rejeições 422 (não auth: 401/403; não
 *  lock: 409; não bug interno: 500). O nome do tipo ("checksum_falho") cobre a FAMÍLIA inteira
 *  de rejeição de conteúdo, não só `CHECKSUM_FALHOU` — é o próprio `AlarmeChecksumFalho.motivo`
 *  (mensagem ORIGINAL, nunca reescrita) que diz qual foi. */
export function ehRejeicaoDeConteudo(http: number): boolean {
  return http === 422
}

/** Só o Demonstrativo tem "bandeja de pares" — as demais bases nunca alarmam por isto. */
export function precisaAlarmarParNovo(base: BaseIngestao, paresNovos: number): boolean {
  return base === 'demonstrativo-competencia' && paresNovos > 0
}

// ── RPCs de escrita do incidente (migration 0280) ───────────────────────────────────────────

export interface IncidenteAberto {
  /** `true` quando ESTA chamada abriu o incidente — só então vale notificar. */
  readonly novo: boolean
  readonly id: string
}

/** `ingestao_alarme_abrir` — `null` em falha de RPC (já logada aqui; o chamador trata como
 *  "não conseguiu nem tentar" e não notifica, para não perder o rastro do `id`). */
export async function abrirIncidente(tipo: TipoAlarmeIngestao, chave: string, detalhe: unknown): Promise<IncidenteAberto | null> {
  try {
    const { data, error } = await getAdminClient().rpc('ingestao_alarme_abrir', {
      p_tipo: tipo, p_chave: chave, p_detalhe: (detalhe ?? null) as Json,
    })
    if (error) {
      console.error(`[ingestao/alarme] ingestao_alarme_abrir(${tipo}, ${chave}) falhou:`, error.message)
      return null
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      console.error(`[ingestao/alarme] ingestao_alarme_abrir(${tipo}, ${chave}) devolveu formato inesperado.`, data)
      return null
    }
    const o = data as unknown as Record<string, unknown>
    if (typeof o.novo !== 'boolean' || typeof o.id !== 'string') {
      console.error(`[ingestao/alarme] ingestao_alarme_abrir(${tipo}, ${chave}) devolveu formato inesperado.`, data)
      return null
    }
    return { novo: o.novo, id: o.id }
  } catch (err) {
    console.error(`[ingestao/alarme] ingestao_alarme_abrir(${tipo}, ${chave}) lançou:`, err)
    return null
  }
}

/** `ingestao_alarme_resolver` — tolerante por natureza da RPC (resolver o que já não está
 *  aberto não é erro); nunca lança. */
export async function resolverIncidente(tipo: TipoAlarmeIngestao, chave: string): Promise<void> {
  try {
    const { error } = await getAdminClient().rpc('ingestao_alarme_resolver', { p_tipo: tipo, p_chave: chave })
    if (error) console.error(`[ingestao/alarme] ingestao_alarme_resolver(${tipo}, ${chave}) falhou:`, error.message)
  } catch (err) {
    console.error(`[ingestao/alarme] ingestao_alarme_resolver(${tipo}, ${chave}) lançou:`, err)
  }
}

/** `ingestao_alarme_marcar_notificado` — chamar SÓ quando `enviarAlarmeIngestao` devolveu
 *  `ok:true` (contrato §5: "marque o incidente como notificado só quando o envio deu certo"). */
export async function marcarNotificado(id: string): Promise<void> {
  try {
    const { error } = await getAdminClient().rpc('ingestao_alarme_marcar_notificado', { p_id: id })
    if (error) console.error(`[ingestao/alarme] ingestao_alarme_marcar_notificado(${id}) falhou:`, error.message)
  } catch (err) {
    console.error(`[ingestao/alarme] ingestao_alarme_marcar_notificado(${id}) lançou:`, err)
  }
}

// ── Disparo de um alarme de EVENTO (carga.ts) ───────────────────────────────────────────────

/**
 * Abre o incidente (`tipo`, `chave` — chave de EVENTO inclui `carga_id`, migration 0280
 * header), notifica se for novo, e RESOLVE em seguida, aconteça o que acontecer com o envio —
 * um alarme de evento é um fato passado assim que a carga termina, não uma condição que o
 * vigia deva continuar observando. Se a notificação falhar, `notificado_em` fica NULL e o
 * incidente (já resolvido) aparece em `pendentes_notificacao` na próxima leitura de
 * `ingestao_vigia_estado()`, que NÃO filtra por `resolvido_em` — é assim que o reenvio alcança
 * um evento cujo e-mail falhou. Nunca lança: chamar isto de `carga.ts` nunca pode derrubar a
 * carga que acabou de ser aplicada (skill `email` §1 — "falha ao enviar vira log, nunca
 * exceção").
 */
export async function dispararAlarmeDeEvento(alarme: AlarmeIngestao, chave: string): Promise<void> {
  const aberto = await abrirIncidente(alarme.tipo, chave, alarme)
  if (!aberto) return
  try {
    if (aberto.novo) {
      const envio = await enviarAlarmeIngestao(alarme)
      if (envio.ok) {
        await marcarNotificado(aberto.id)
      } else {
        console.error(
          `[ingestao/alarme] envio do alarme "${alarme.tipo}" (${chave}) falhou — incidente ` +
          `${aberto.id} fica pendente de notificação (o vigia reenvia): ${envio.erro}`,
        )
      }
    }
  } catch (err) {
    // Nada acima lança hoje (a camada de e-mail e as três RPCs degradam para log) — este `catch`
    // é o que GARANTE o "nunca lança" do contrato: `carga.ts` chama isto DEPOIS de a promoção ter
    // acontecido, e uma exceção aqui cairia no `catch` da carga e gravaria como `erro` uma carga
    // que já está aplicada no banco.
    console.error(`[ingestao/alarme] disparo do alarme "${alarme.tipo}" (${chave}) lançou — segue pendente de notificação:`, err)
  } finally {
    await resolverIncidente(alarme.tipo, chave)
  }
}

// ── Reenvio de pendentes (usado pelo vigia; também alcança evento com envio falho) ──────────

export interface PendenteNotificacao {
  readonly id: string
  readonly tipo: string
  readonly chave: string
  readonly detalhe: unknown
}

/** Reidrata o `AlarmeIngestao` a partir do `detalhe` jsonb gravado por `abrirIncidente` — é o
 *  MESMO objeto que foi passado lá (evento em `dispararAlarmeDeEvento`, estado no vigia), então
 *  a validação aqui é o guard mínimo contra um `detalhe` corrompido/de formato antigo, não uma
 *  segunda fonte de verdade. `null` se o formato não bate com o `tipo`. */
export function comoAlarmeIngestao(tipoEsperado: string, detalhe: unknown): AlarmeIngestao | null {
  if (typeof detalhe !== 'object' || detalhe === null) return null
  const o = detalhe as Record<string, unknown>
  if (o.tipo !== tipoEsperado) return null
  switch (o.tipo as TipoAlarmeIngestao) {
    case 'checksum_falho':
      return typeof o.base === 'string' && typeof o.cargaId === 'string' && typeof o.motivo === 'string'
        ? (o as unknown as AlarmeChecksumFalho) : null
    case 'ano_fechado_alterado':
      return typeof o.base === 'string' && typeof o.ano === 'number'
        && typeof o.linhasAntes === 'number' && typeof o.linhasDepois === 'number'
        && typeof o.centavosAntes === 'number' && typeof o.centavosDepois === 'number'
        ? (o as unknown as AlarmeAnoFechadoAlterado) : null
    case 'par_novo_bandeja':
      return typeof o.cargaId === 'string' && typeof o.paresNovos === 'number'
        ? (o as unknown as AlarmeParNovoBandeja) : null
    case 'processo_sem_resultado':
      return typeof o.processo === 'string' && typeof o.minutosSemResultado === 'number'
        ? (o as unknown as AlarmeProcessoSemResultado) : null
    case 'carga_esperada_nao_chegou':
      return typeof o.base === 'string' && typeof o.horasSemCarga === 'number'
        ? (o as unknown as AlarmeCargaEsperadaNaoChegou) : null
    default:
      return null
  }
}

/**
 * Tenta notificar de novo cada pendente (contrato §3: "se um envio falhou, a próxima rodada
 * tenta de novo"). Devolve quantos foram notificados com sucesso nesta chamada. Nunca lança —
 * pendente com `detalhe` não reconstituível é logado e pulado, não trava os demais.
 */
export async function reenviarPendentesNotificacao(pendentes: readonly PendenteNotificacao[]): Promise<number> {
  let reenviados = 0
  for (const p of pendentes) {
    const alarme = comoAlarmeIngestao(p.tipo, p.detalhe)
    if (!alarme) {
      console.error(`[ingestao/alarme] pendente ${p.id} (${p.tipo}, chave ${p.chave}) tem detalhe não reconstituível — pulado.`)
      continue
    }
    const envio = await enviarAlarmeIngestao(alarme)
    if (envio.ok) {
      await marcarNotificado(p.id)
      reenviados++
    } else {
      console.error(`[ingestao/alarme] reenvio do pendente ${p.id} (${p.tipo}, chave ${p.chave}) falhou: ${envio.erro}`)
    }
  }
  return reenviados
}
