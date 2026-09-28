import 'server-only'

// Retenção do arquivo CRU no bucket `ingestao-cru` (v6.0.0/M6b — errata 3(b) do contrato
// `docs/contratos/ingestao-v1.md`, decisão do Yan em 24/09; desenho em
// `docs/briefings/anexo-v6-0-0-m6b-retencao-do-cru.md`).
//
//   • todo cru com mais de RETENCAO_CRU_MESES (3) meses sai — com ou sem carga;
//   • cru que NENHUMA carga cita, com mais de RETENCAO_ORFAO_DIAS (7) dias, sai;
//   • o DADO carregado no banco não expira — só o arquivo como chegou.
//
// Apagar é IRREVERSÍVEL. Por isso a regra é uma função PURA (`decidirRetencao`, testada
// exaustivamente) e o executor (`rodarRetencao`) só apaga o que ela devolveu, depois de passar
// pelas travas do anexo §4: só este bucket, só paths do inventário, teto por rodada, recusa com
// inventário de cargas vazio, e modo simulação que não apaga nada.

import { getAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'
import { BUCKET_INGESTAO } from './storage'

/** Errata 3(b): prazo do cru de qualquer carga, em meses de CALENDÁRIO. */
export const RETENCAO_CRU_MESES = 3
/** Errata 3(b): prazo do cru que nunca virou carga (conferência cancelada, reprocesso não confirmado). */
export const RETENCAO_ORFAO_DIAS = 7
/** Trava 4 do anexo: mais do que isto numa rodada é sinal de defeito (relógio, inventário), não
 *  de acúmulo legítimo — ~20 MB por conjunto das 5 bases, 1 conjunto/dia ⇒ ~5 objetos/dia. */
export const TETO_POR_RODADA = 500

export interface ObjetoCru {
  readonly path: string
  readonly criado_em: string
}

export interface InventarioRetencao {
  /** Relógio do BANCO (`now()`), nunca o do processo. */
  readonly agora: string
  readonly objetos: readonly ObjetoCru[]
  /** Todo path citado por alguma linha de `ingestao.carga.arquivos`. */
  readonly citados: readonly string[]
  /** Quantas cargas existem — trava 5. */
  readonly cargas: number
}

export type MotivoRetencao = 'expirado' | 'orfao'

export interface ItemApagar {
  readonly path: string
  readonly motivo: MotivoRetencao
  readonly criado_em: string
}

export type DecisaoRetencao =
  | { readonly ok: true; readonly apagar: readonly ItemApagar[]; readonly expirados: number; readonly orfaos: number }
  | { readonly ok: false; readonly recusa: string; readonly apagar: readonly ItemApagar[] }

/** `agora` menos N meses de CALENDÁRIO, em UTC. 31/05 − 3 meses = 28 ou 29/02 (o dia é
 *  limitado ao fim do mês de destino), nunca "3 de março" — `setUTCMonth` sozinho transbordaria. */
export function menosMeses(agora: Date, meses: number): Date {
  const alvo = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - meses, 1,
    agora.getUTCHours(), agora.getUTCMinutes(), agora.getUTCSeconds(), agora.getUTCMilliseconds()))
  const ultimoDia = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(agora.getUTCDate(), ultimoDia))
  return alvo
}

/**
 * A REGRA — pura, sem rede nem relógio próprio. Um objeto é:
 *   • `expirado` se foi criado ANTES de `agora − 3 meses` (esteja ou não citado por carga);
 *   • `orfao` se nenhuma carga o cita e foi criado ANTES de `agora − 7 dias`;
 *   • mantido nos demais casos (no limite exato, fica — "mais de" 3 meses / 7 dias).
 * Recusa (não apaga NADA) se a decisão passar do teto por rodada, ou se há objetos e zero cargas
 * — sem o inventário de cargas, todo objeto antigo pareceria órfão.
 */
export function decidirRetencao(inv: InventarioRetencao): DecisaoRetencao {
  const agora = new Date(inv.agora)
  if (Number.isNaN(agora.getTime())) {
    return { ok: false, recusa: `Relógio do inventário inválido ("${inv.agora}") — nada apagado.`, apagar: [] }
  }
  const limiteExpirado = menosMeses(agora, RETENCAO_CRU_MESES).getTime()
  const limiteOrfao = agora.getTime() - RETENCAO_ORFAO_DIAS * 24 * 60 * 60 * 1000
  const citados = new Set(inv.citados)

  const apagar: ItemApagar[] = []
  for (const o of inv.objetos) {
    const criado = Date.parse(o.criado_em)
    // Data ilegível nunca é "antiga": na dúvida, FICA (apagar é irreversível; guardar, não).
    if (Number.isNaN(criado)) continue
    if (criado < limiteExpirado) apagar.push({ path: o.path, motivo: 'expirado', criado_em: o.criado_em })
    else if (!citados.has(o.path) && criado < limiteOrfao) apagar.push({ path: o.path, motivo: 'orfao', criado_em: o.criado_em })
  }

  if (inv.objetos.length > 0 && inv.cargas === 0 && apagar.length > 0) {
    return {
      ok: false,
      recusa: `Inventário com ${inv.objetos.length} objeto(s) e NENHUMA carga — sem o registro de cargas não há como distinguir arquivo de carga de arquivo órfão (e um registro vazio é mais provavelmente defeito do que realidade). Nada apagado.`,
      apagar,
    }
  }
  if (apagar.length > TETO_POR_RODADA) {
    return {
      ok: false,
      recusa: `A regra mandaria apagar ${apagar.length} objetos, acima do teto de ${TETO_POR_RODADA} por rodada — sinal de defeito (relógio, inventário), não de acúmulo. Nada apagado.`,
      apagar,
    }
  }
  const expirados = apagar.filter((a) => a.motivo === 'expirado').length
  return { ok: true, apagar, expirados, orfaos: apagar.length - expirados }
}

/** Valida o jsonb do inventário (RPC nova, service_role-only — guard manual no molde de `log.ts`).
 *  `null` = formato inesperado (a rodada vira `erro`, nunca "nada a apagar"). */
export function comoInventario(x: unknown): InventarioRetencao | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  if (typeof o.agora !== 'string' || !Array.isArray(o.objetos) || !Array.isArray(o.citados)) return null
  const cargas = typeof o.cargas === 'number' ? o.cargas : Number(o.cargas)
  if (!Number.isFinite(cargas)) return null
  const objetos: ObjetoCru[] = []
  for (const item of o.objetos) {
    if (typeof item !== 'object' || item === null) return null
    const it = item as Record<string, unknown>
    if (typeof it.path !== 'string' || typeof it.criado_em !== 'string') return null
    objetos.push({ path: it.path, criado_em: it.criado_em })
  }
  if (!o.citados.every((c) => typeof c === 'string')) return null
  return { agora: o.agora, objetos, citados: o.citados as string[], cargas }
}

export interface ResultadoRetencao {
  readonly status: 'ok' | 'simulado' | 'recusado' | 'erro'
  readonly expirados: number
  readonly orfaos: number
  /** Em `ok`: o que foi apagado. Em `simulado`/`recusado`: o que SERIA. */
  readonly apagados: readonly ItemApagar[]
  readonly erro: string | null
  /** A linha de `ingestao.retencao` não pôde ser gravada — o que aconteceu não ficou no log. */
  readonly logFalhou: boolean
}

/** Lote do `storage.remove` — a API aceita lista; lotes pequenos limitam o estrago de uma falha
 *  no meio (o que já saiu fica registrado, o resto fica para a próxima rodada). */
const LOTE_REMOCAO = 100

/**
 * Uma rodada da limpeza: inventário → regra → (se não simulado e não recusado) apagar pela API do
 * Storage → registrar em `ingestao.retencao`. Nunca lança: qualquer falha vira `status: 'erro'`
 * no resultado e no log. `simular: true` percorre tudo e NÃO apaga nada.
 */
export async function rodarRetencao(opts: { readonly simular: boolean }): Promise<ResultadoRetencao> {
  const iniciadoEm = new Date().toISOString()
  const admin = getAdminClient()

  async function registrar(r: Omit<ResultadoRetencao, 'logFalhou'>): Promise<ResultadoRetencao> {
    try {
      const { error } = await admin.rpc('ingestao_retencao_registrar', {
        p_status: r.status,
        p_iniciado_em: iniciadoEm,
        p_expirados: r.expirados,
        p_orfaos: r.orfaos,
        p_apagados: r.apagados as unknown as Json,
        p_erro: r.erro ?? undefined,
      })
      if (error) {
        console.error('[ingestao/retencao] falha ao registrar a rodada em ingestao.retencao:', error.message)
        return { ...r, logFalhou: true }
      }
      return { ...r, logFalhou: false }
    } catch (err) {
      console.error('[ingestao/retencao] registrar a rodada lançou:', err)
      return { ...r, logFalhou: true }
    }
  }

  let inventario: InventarioRetencao | null
  try {
    const { data, error } = await admin.rpc('ingestao_retencao_inventario')
    if (error) return registrar({ status: 'erro', expirados: 0, orfaos: 0, apagados: [], erro: `Inventário falhou: ${error.message}` })
    inventario = comoInventario(data)
  } catch (err) {
    return registrar({ status: 'erro', expirados: 0, orfaos: 0, apagados: [], erro: `Inventário lançou: ${err instanceof Error ? err.message : String(err)}` })
  }
  if (!inventario) {
    return registrar({ status: 'erro', expirados: 0, orfaos: 0, apagados: [], erro: 'Inventário em formato inesperado — nada apagado.' })
  }

  const decisao = decidirRetencao(inventario)
  const contar = (itens: readonly ItemApagar[]) => ({
    expirados: itens.filter((i) => i.motivo === 'expirado').length,
    orfaos: itens.filter((i) => i.motivo === 'orfao').length,
  })
  if (!decisao.ok) {
    return registrar({ status: 'recusado', ...contar(decisao.apagar), apagados: decisao.apagar, erro: decisao.recusa })
  }
  if (opts.simular || decisao.apagar.length === 0) {
    return registrar({ status: opts.simular ? 'simulado' : 'ok', expirados: decisao.expirados, orfaos: decisao.orfaos, apagados: decisao.apagar, erro: null })
  }

  // Apaga em lotes; o que efetivamente saiu é o que vai para o log (uma falha no meio não pode
  // registrar como apagado o que ficou).
  const apagados: ItemApagar[] = []
  let erro: string | null = null
  for (let i = 0; i < decisao.apagar.length; i += LOTE_REMOCAO) {
    const lote = decisao.apagar.slice(i, i + LOTE_REMOCAO)
    try {
      const { data, error } = await admin.storage.from(BUCKET_INGESTAO).remove(lote.map((l) => l.path))
      if (error) { erro = `Storage recusou a remoção de um lote: ${error.message}`; break }
      // O Storage devolve o que DE FATO removeu, e não dá erro para path que já não existia —
      // o log registra só o confirmado, não o pedido.
      const removidos = new Set((data ?? []).map((d) => d.name))
      apagados.push(...lote.filter((l) => removidos.has(l.path)))
    } catch (err) {
      erro = `Remoção de um lote lançou: ${err instanceof Error ? err.message : String(err)}`
      break
    }
  }
  return registrar({ status: erro ? 'erro' : 'ok', ...contar(apagados), apagados, erro })
}
