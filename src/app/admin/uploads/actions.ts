'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, statusDemonstrativoCompetenciaSchema } from '@/lib/schemas-rpc'
import type { PessoaRaw } from '@/lib/carga/parse-pessoas'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

// ---------------------------------------------------------------------------
// v6.0.0/M4 — as CINCO bases do contrato de ingestão (`docs/contratos/ingestao-v1.md`)
// migraram para `POST /api/ingestao/{base}` (upload do arquivo CRU pelo card + parse no
// SERVIDOR). As Server Actions de inserir/finalizar em lote que existiam aqui para Vendas,
// Lançamentos por Operação, Lançamentos por Movimentação, Títulos em Aberto e Demonstrativo
// de Competência SAÍRAM — o card não parseia mais essas cinco no navegador (anexo
// `docs/briefings/anexo-v6-0-0-m4-desenho-da-rota.md` §5).
//
// FICAM neste arquivo: as ações de STATUS de todas as bases (o card continua mostrando
// "última atualização · N registros" lendo direto do banco — nenhuma delas processa arquivo),
// o fluxo completo de Pessoas (fora do contrato — decisão 11 do briefing da versão: "parada,
// viva") e a leitura de sincronização do Monde (não é upload).
// ---------------------------------------------------------------------------

export async function getLancamentosStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  // Guard ANTES do try: negação de permissão deve lançar, não virar erro amigável.
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('get_upload_status')
    if (error) return { error: error.message }
    // v4.20.1: surfaceia ultima_atualizacao (MAX(importado_em)) — antes era descartada,
    // então o card mostrava "Nunca"/valor velho mesmo com o dado fresco no banco.
    const status = data as { lancamentos: { total: number; ultima_atualizacao: string | null } } | null
    return {
      total: status?.lancamentos?.total ?? 0,
      ultima_atualizacao: status?.lancamentos?.ultima_atualizacao ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function getVendasStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('get_upload_status')
    if (error) return { error: error.message }
    const status = data as { vendas: { total: number; ultima_atualizacao: string | null } } | null
    return {
      total: status?.vendas?.total ?? 0,
      ultima_atualizacao: status?.vendas?.ultima_atualizacao ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Pessoas (v4.29.0) — cadastro fiscal do Monde. FORA do contrato de ingestão v1 (decisão 11
// do briefing: "parada, viva" — não é uma das cinco bases). Continua com o pipeline ATÔMICO
// de sempre (0116): limpar_staging_pessoas → inserir_lote_staging_pessoas → validar →
// promover (swap numa transação; o Faturamento depende, a base não pode ficar vazia no meio).
// ---------------------------------------------------------------------------

export async function getPessoasStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('status_pessoas')
    if (error) return { error: error.message }
    const status = data as { total: number; ultima_atualizacao: string | null } | null
    return { total: status?.total ?? 0, ultima_atualizacao: status?.ultima_atualizacao ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function inserirLotePessoasAction(
  lote: PessoaRaw[],
  isFirst: boolean,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // 1º lote: limpa a STAGING (não-destrutivo; a base viva fica intacta até o swap).
    if (isFirst) {
      const { error: limpErr } = await bound('limpar_staging_pessoas')
      if (limpErr) return { error: `Erro ao preparar a carga: ${limpErr.message}` }
    }

    const { error } = await bound('inserir_lote_staging_pessoas', { p_linhas: lote })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarPessoasAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; pessoas_count: number; erros: string[] } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // Pré-validação NÃO-destrutiva (staging tem linhas?). Base atual intacta se reprovar.
    const valRes = await bound('validar_carga_pessoas')
    if (valRes.error) return { error: `Erro na validação da carga: ${valRes.error.message}. A base atual foi preservada.` }
    const validacao = valRes.data as { ok: boolean; total: number; erros: string[] } | null
    if (!validacao?.ok) {
      const msgs = validacao?.erros?.length ? validacao.erros : ['Validação da carga falhou.']
      return { error: `${msgs.join(' ')} A base atual foi preservada.` }
    }

    // Swap ATÔMICO: truncate raw.pessoas + copia staging→raw numa transação. Falha → ROLLBACK.
    const promRes = await bound('promover_carga_pessoas')
    if (promRes.error) return { error: `Erro ao promover a carga (base preservada): ${promRes.error.message}` }
    const promocao = promRes.data as { pessoas_count: number } | null

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      pessoas_count: promocao?.pessoas_count ?? totalInseridas,
      erros: [],
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Lançamentos por Movimentação / Títulos em Aberto — só STATUS (a carga migrou para
// `POST /api/ingestao/{base}`, v6.0.0/M4; o aplicador do servidor chama
// `regenerar_fluxo_caixa` no fim, lendo as duas bases, como a Server Action já fazia).
// ---------------------------------------------------------------------------

export async function getLancamentosMovimentacaoStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)
    const { data, error } = await bound('status_lancamentos_movimentacao')
    if (error) return { error: error.message }
    const status = data as { total: number; ultima_atualizacao: string | null } | null
    return { total: status?.total ?? 0, ultima_atualizacao: status?.ultima_atualizacao ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function getTitulosEmAbertoStatusAction(): Promise<
  { total: number; ultima_atualizacao: string | null } | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)
    const { data, error } = await bound('status_titulos_em_aberto')
    if (error) return { error: error.message }
    const status = data as { total: number; ultima_atualizacao: string | null } | null
    return { total: status?.total ?? 0, ultima_atualizacao: status?.ultima_atualizacao ?? null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Demonstrativo de Resultado por COMPETÊNCIA (raw.demonstrativo_competencia) — só STATUS
// (a carga migrou para `POST /api/ingestao/{base}`, v6.0.0/M4; o "alarme de ingestão" —
// contagem e soma do arquivo × gravadas — passou a rodar dentro do aplicador do servidor,
// `src/lib/ingestao/aplicar.ts`).
// ---------------------------------------------------------------------------

/**
 * Status da base de competência, no formato que a UI consome. `soma_centavos` é inteiro
 * (ver o header da 0255).
 *
 * É uma interface EXPLÍCITA, e não o `z.infer` do schema, de propósito: o schema é
 * `.passthrough()` (convenção do projeto — chave extra da RPC não pode falsear o parse),
 * e `passthrough` traz um índice `[k: string]: unknown` que contamina o consumidor —
 * `'error' in status` deixa de estreitar o union e `status.error` vira `unknown`.
 * Tolerância na LEITURA, tipo limpo na FRONTEIRA.
 */
export interface StatusDemonstrativoCompetencia {
  total:              number
  soma_centavos:      number
  pares:              number
  cobertura_de:       string | null
  cobertura_ate:      string | null
  ultima_atualizacao: string | null
}

/**
 * Lê o status pela RPC, validando o SHAPE com Zod.
 *
 * Diferente dos outros `status_*` de upload (cast direto), aqui o retorno alimenta um
 * gate financeiro — então contrato divergente tem de FECHAR o alarme, não abri-lo.
 * `parseRpc` devolve `null` tanto em erro quanto em shape inesperado, e os dois casos
 * viram erro para o chamador: ninguém declara upload conferido sem ter conferido.
 */
async function lerStatusDemonstrativoCompetencia(): Promise<StatusDemonstrativoCompetencia | { error: string }> {
  const supabase = getAdminClient()
  const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)
  const res = await bound('status_demonstrativo_competencia')
  const status = parseRpc(
    statusDemonstrativoCompetenciaSchema,
    res,
    'status_demonstrativo_competencia',
  )
  if (!status) {
    return { error: 'não foi possível ler o status da base de competência (erro na RPC ou contrato divergente — ver log do servidor)' }
  }
  return {
    total:              status.total,
    soma_centavos:      status.soma_centavos,
    pares:              status.pares,
    cobertura_de:       status.cobertura_de,
    cobertura_ate:      status.cobertura_ate,
    ultima_atualizacao: status.ultima_atualizacao,
  }
}

export async function getDemonstrativoCompetenciaStatusAction(): Promise<
  StatusDemonstrativoCompetencia | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    return await lerStatusDemonstrativoCompetencia()
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Sincronização Monde (v5.4.4) — LEITURA. Não é uma base de upload: o espelho vem da API,
// e este bloco existe para o tripwire ter onde ACENDER. Divergência tem de ser alerta
// visível, não linha de log perdida no console da Vercel.
// ---------------------------------------------------------------------------

/** Um mês apurado pela reconciliação (ou `nao_verificado` se ela ainda não passou por ele). */
export type TripwireMes =
  | { nao_verificado: true }
  | {
      mes: string
      api: number
      lidas: number
      sem_sale_id: number
      espelhaveis: number
      excluidas: { welcome: number; sem_setor: number; sem_item_ativo: number }
      erros: number
      espelho: number
      sobrando: number
      conta_fecha: boolean
      verificado_em: string
    }

export interface StatusSincronizacaoMonde {
  /** Tudo o que está espelhado, inclusive venda cujos produtos a origem cancelou. */
  vendas: number
  /**
   * v5.4.5 — o universo que a mv soma (venda com ao menos um item ativo). Diverge de `vendas`
   * quando a origem cancela todos os produtos: a venda continua espelhada, para auditoria, e
   * deixa de contar. Antes desta versão ela era descartada na escrita e a linha velha ficava
   * congelada — era o defeito (+25% na receita de jul/2026).
   */
  vendas_que_contam: number
  /** v5.4.5 — passa a ser > 0; era 0 fixo porque o cancelado nunca era gravado. */
  itens_cancelados: number
  ultima_sincronizacao: string | null
  ultima_reconciliacao: string | null
  reconciliacao_cursor: string | null
  tripwire: {
    atualizado_em: string
    acendeu: boolean
    motivos: string[]
    meses: Record<string, TripwireMes>
  } | null
}

export async function getMondeSincronizacaoStatusAction(): Promise<
  StatusSincronizacaoMonde | { error: string }
> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    // `.bind(supabase)`: destacar o método perde o `this` e quebra em runtime (lição v5.3.5).
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('monde_ingest_status')
    if (error) return { error: error.message }
    const s = (data ?? {}) as Partial<StatusSincronizacaoMonde>
    // Só o que o cartão renderiza — dado buscado e não mostrado é smell (achado BAIXO do
    // revisor). A RPC devolve mais (`itens`, `itens_ativos`, `min_data`, `max_data`,
    // `ultima_sync`, `ingest_em_curso`); se o cartão passar a mostrar, é aqui que entram.
    // `vendas_que_contam` cai para `vendas` se a 0237 ainda não estiver aplicada — assim o
    // cartão não mostra zero durante a janela entre o deploy e a migration.
    return {
      vendas:               s.vendas ?? 0,
      vendas_que_contam:    s.vendas_que_contam ?? s.vendas ?? 0,
      itens_cancelados:     s.itens_cancelados ?? 0,
      ultima_sincronizacao: s.ultima_sincronizacao ?? null,
      ultima_reconciliacao: s.ultima_reconciliacao ?? null,
      reconciliacao_cursor: s.reconciliacao_cursor ?? null,
      tripwire:             s.tripwire ?? null,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}
