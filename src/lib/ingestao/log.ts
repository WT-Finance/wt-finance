import 'server-only'

// Camada de LOG do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §6) — envelopa as
// quatro RPCs `SECURITY DEFINER`/service_role-only da migration 0276
// (`ingestao_carga_abrir`/`_concluir`/`_obter`/`_ultima`). Nenhuma lógica de negócio mora aqui:
// é tradução de parâmetro → RPC e RPC → objeto tipado, no MESMO molde de
// `src/lib/api-externa/http.ts` (`chamarRpcExterna`) e `src/app/admin/uploads/actions.ts`
// (`.bind(supabase)` — destacar o método perde o `this`, lição v5.3.5).
//
// "Nunca em silêncio, mas nunca derruba uma carga já aplicada" (anexo v6.0.0/M4 §2): toda
// função aqui devolve `{ok:false, erro}` em vez de lançar — quem decide se uma falha de LOG
// aborta o fluxo é `carga.ts` (a resposta já foi calculada quando o log falha em concluir, e o
// dado já está no banco), não este módulo. Mas mesmo devolvendo `{ok:false}`, o `console.error`
// roda aqui — para o operador ver no log do servidor mesmo se quem chamou não expuser o aviso.

import { getAdminClient } from '@/lib/supabase/admin'
import type { BaseIngestao } from './bases'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

function rpc(): BoundRpc {
  const supabase = getAdminClient()
  return (supabase.rpc as unknown as BoundRpc).bind(supabase)
}

export type StatusCarga = 'aberta' | 'aplicada' | 'rejeitada' | 'erro'

/**
 * Uma linha de `ingestao.carga`, no formato que as quatro RPCs devolvem (jsonb com as mesmas
 * chaves da tabela — ver header da migration 0276). `existente` só vem em `ingestao_carga_abrir`
 * (`true` quando a chamada devolveu uma linha JÁ EXISTENTE, por `carga_id` OU por
 * `idempotencia` — contrato §1/§2.3 passo 1); nas demais RPCs vem sempre `undefined`.
 *
 * Validado por um guard MANUAL (não Zod) — molde de `comoChaveResolvida`/`comoResultadoCriacao`
 * em `@/lib/api-externa/http.ts` e `.../solicitacoes/route.ts`: esta é uma superfície INTERNA
 * (service_role-only, sem consumidor de UI), fora da convenção `parseRpc`/`schemas-rpc.ts`
 * pensada para RPC consumida diretamente por tela (skill `contrato-rpc-front` §3). Sinalizado
 * no relato desta missão para o orquestrador confirmar se isso basta.
 */
export interface LinhaCarga {
  readonly existente?: boolean
  readonly carga_id: string
  readonly base: string
  readonly origem: string
  readonly chave_id: number | null
  readonly usuario_id: string | null
  readonly idempotencia: string | null
  readonly extraido_em: string | null
  readonly recebido_em: string
  readonly concluido_em: string | null
  readonly arquivos: unknown
  readonly linhas: number | null
  readonly somas: unknown
  readonly checksums_conferidos: number | null
  readonly checksums_falhos: number | null
  readonly rejeitadas_por_data: number | null
  readonly pares_novos: number | null
  readonly diff: unknown
  readonly status: StatusCarga
  readonly erro: string | null
  readonly duracao_ms: number | null
  readonly resposta: unknown
  readonly observacao: string | null
}

const STATUS_VALIDOS: readonly StatusCarga[] = ['aberta', 'aplicada', 'rejeitada', 'erro']

function comoLinhaCarga(x: unknown): LinhaCarga | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.carga_id !== 'string') return null
  if (typeof o.base !== 'string') return null
  if (typeof o.origem !== 'string') return null
  if (typeof o.status !== 'string' || !STATUS_VALIDOS.includes(o.status as StatusCarga)) return null
  if (typeof o.recebido_em !== 'string') return null
  return o as unknown as LinhaCarga
}

export type ResultadoLog<T = LinhaCarga> = { readonly ok: true; readonly linha: T } | { readonly ok: false; readonly erro: string }

export interface AbrirCargaParams {
  readonly cargaId: string
  readonly base: BaseIngestao
  readonly origem: string
  /** jsonb — os `arquivos[]` declarados pelo chamador no corpo do passo 3 (path+nome+sha256). */
  readonly arquivos: unknown
  readonly chaveId: number | null
  readonly usuarioId: string | null
  readonly idempotencia: string | null
  readonly extraidoEm: string | null
  readonly observacao: string | null
}

/**
 * Abre (ou recupera, se idempotente) a linha de carga — contrato §2.3 passo 1.
 * `linha.existente === true` quando `carga_id` OU `idempotencia` já tinham linha: quem chama
 * decide, a partir de `linha.status`, se é "reenvio da mesma requisição em voo" (`aberta`) ou
 * "já concluída, repetir a resposta guardada" (`aplicada`/`rejeitada`/`erro`).
 *
 * NÃO é chamada na CONFERÊNCIA (`confirmar:false`, anexo §5) — a conferência não abre linha nem
 * consome idempotência; quem decide isso é `carga.ts`, não esta função.
 */
export async function abrirCarga(p: AbrirCargaParams): Promise<ResultadoLog> {
  const { data, error } = await rpc()('ingestao_carga_abrir', {
    p_carga_id: p.cargaId,
    p_base: p.base,
    p_origem: p.origem,
    p_arquivos: p.arquivos,
    p_chave_id: p.chaveId,
    p_usuario_id: p.usuarioId,
    p_idempotencia: p.idempotencia,
    p_extraido_em: p.extraidoEm,
    p_observacao: p.observacao,
  })
  if (error) {
    console.error(`[ingestao/log] ingestao_carga_abrir(${p.cargaId}, ${p.base}) falhou:`, error.message)
    return { ok: false, erro: error.message }
  }
  const linha = comoLinhaCarga(data)
  if (!linha) {
    console.error(`[ingestao/log] ingestao_carga_abrir(${p.cargaId}, ${p.base}) devolveu formato inesperado.`, data)
    return { ok: false, erro: 'ingestao_carga_abrir devolveu formato inesperado.' }
  }
  return { ok: true, linha }
}

export interface ConcluirCargaParams {
  readonly cargaId: string
  readonly status: Extract<StatusCarga, 'aplicada' | 'rejeitada' | 'erro'>
  readonly linhas?: number | null
  readonly somas?: unknown
  readonly checksumsConferidos?: number | null
  readonly checksumsFalhos?: number | null
  readonly rejeitadasPorData?: number | null
  readonly paresNovos?: number | null
  readonly diff?: unknown
  /** O CORPO devolvido ao chamador — é o que a idempotência repete sem refazer trabalho. */
  readonly resposta?: unknown
  readonly erro?: string | null
  readonly duracaoMs?: number | null
}

/** Grava o resultado final de uma carga — contrato §2.3 passos 4-10. */
export async function concluirCarga(p: ConcluirCargaParams): Promise<ResultadoLog> {
  // NUNCA lança (v6.0.0/M6, achado do revisor): `processarCarga` chama isto DEPOIS de a promoção
  // ter acontecido. Uma exceção aqui (rede, não `{error}` devolvido) subiria para o `catch` da
  // carga, que chamaria `concluirCarga` DE NOVO com status `erro` — gravando como falha uma carga
  // que já está aplicada no banco. `{ ok: false }` é o que o chamador já sabe tratar.
  try {
    return await concluirCargaSemProtecao(p)
  } catch (err) {
    console.error(`[ingestao/log] ingestao_carga_concluir(${p.cargaId}) lançou — a carga em si NÃO é desfeita por isto:`, err)
    return { ok: false, erro: err instanceof Error ? err.message : 'ingestao_carga_concluir lançou.' }
  }
}

async function concluirCargaSemProtecao(p: ConcluirCargaParams): Promise<ResultadoLog> {
  const { data, error } = await rpc()('ingestao_carga_concluir', {
    p_carga_id: p.cargaId,
    p_status: p.status,
    p_linhas: p.linhas ?? null,
    p_somas: p.somas ?? null,
    p_checksums_conferidos: p.checksumsConferidos ?? null,
    p_checksums_falhos: p.checksumsFalhos ?? null,
    p_rejeitadas_por_data: p.rejeitadasPorData ?? null,
    p_pares_novos: p.paresNovos ?? null,
    p_diff: p.diff ?? null,
    p_resposta: p.resposta ?? null,
    p_erro: p.erro ?? null,
    p_duracao_ms: p.duracaoMs ?? null,
  })
  if (error) {
    console.error(`[ingestao/log] ingestao_carga_concluir(${p.cargaId}) falhou — a carga em si NÃO é desfeita por isto:`, error.message)
    return { ok: false, erro: error.message }
  }
  const linha = comoLinhaCarga(data)
  if (!linha) {
    console.error(`[ingestao/log] ingestao_carga_concluir(${p.cargaId}) devolveu formato inesperado.`, data)
    return { ok: false, erro: 'ingestao_carga_concluir devolveu formato inesperado.' }
  }
  return { ok: true, linha }
}

/** Lê uma carga por `carga_id` (leitura; não usada pelas duas rotas desta missão — fica pronta
 *  para `GET /api/ingestao/cargas/{carga_id}`, contrato §7, fora do escopo da M4). */
export async function obterCarga(cargaId: string): Promise<ResultadoLog> {
  const { data, error } = await rpc()('ingestao_carga_obter', { p_carga_id: cargaId })
  if (error) {
    console.error(`[ingestao/log] ingestao_carga_obter(${cargaId}) falhou:`, error.message)
    return { ok: false, erro: error.message }
  }
  const linha = comoLinhaCarga(data)
  if (!linha) return { ok: false, erro: 'ingestao_carga_obter devolveu formato inesperado.' }
  return { ok: true, linha }
}

export type ResultadoUltimaCarga =
  | { readonly ok: true; readonly linha: LinhaCarga | null }
  | { readonly ok: false; readonly erro: string }

/**
 * Última carga `aplicada` de uma base, distinguindo "nunca houve carga aplicada"
 * (`ok:true, linha:null` — estado inicial legítimo) de "não consegui saber"
 * (`ok:false` — falha de RPC ou formato inesperado).
 *
 * Existe para o grafo de dependência (v6.0.0/M7a, `carga.ts`): ali os dois casos NÃO podem ser
 * tratados igual — uma falha de leitura tem de abortar a carga (fail-closed, 500
 * `ERRO_INTERNO`), nunca ser lida como "o pré-requisito não está lá" (409
 * `DEPENDENCIA_AUSENTE`) nem, pior, como "está tudo bem". `ultimaCargaAplicada` (abaixo) segue
 * degradando os dois casos para `null` — comportamento INTACTO para o diff e os alarmes, que
 * não precisam da distinção.
 */
export async function lerUltimaCargaAplicada(base: BaseIngestao): Promise<ResultadoUltimaCarga> {
  const { data, error } = await rpc()('ingestao_carga_ultima', { p_base: base })
  if (error) {
    console.error(`[ingestao/log] ingestao_carga_ultima(${base}) falhou:`, error.message)
    return { ok: false, erro: error.message }
  }
  if (data === null) return { ok: true, linha: null }
  const linha = comoLinhaCarga(data)
  if (!linha) {
    console.error(`[ingestao/log] ingestao_carga_ultima(${base}) devolveu formato inesperado.`, data)
    return { ok: false, erro: 'ingestao_carga_ultima devolveu formato inesperado.' }
  }
  return { ok: true, linha }
}

/**
 * Última carga `aplicada` de uma base — insumo do diff (contrato §2.3 passo 8). `null` tanto
 * quando a base nunca teve carga aplicada (estado inicial legítimo) quanto quando a RPC falha
 * — os dois casos são "sem baseline para comparar", e quem chama decide como degradar
 * (`carga.ts`: o diff sai com `null` e um aviso, nunca abortando a carga por causa disto).
 *
 * Delega a `lerUltimaCargaAplicada`, que DISTINGUE os dois casos — usada aqui porque o diff/os
 * alarmes não precisam da distinção (M7a: quem precisa é o grafo de dependência).
 */
export async function ultimaCargaAplicada(base: BaseIngestao): Promise<LinhaCarga | null> {
  const r = await lerUltimaCargaAplicada(base)
  return r.ok ? r.linha : null
}
