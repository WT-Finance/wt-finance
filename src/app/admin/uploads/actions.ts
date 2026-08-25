'use server'

import { loadMetas } from '@/lib/carga/metas'
import { getAdminClient } from '@/lib/supabase/admin'
import { requireAreaAction } from '@/lib/auth/sessao'
import { parseRpc, cargaValidacaoSchema, cargaPromocaoSchema } from '@/lib/schemas-rpc'
import type { LancamentoRaw, ResultadoCarga } from '@/lib/carga/lancamentos'
import type { VendaProdutoRaw } from '@/lib/carga/parse-vendas-produto'
import type { PessoaRaw } from '@/lib/carga/parse-pessoas'
import type { LancamentoMovimentacaoRaw } from '@/lib/carga/parse-lancamentos-movimentacao'
import type { TituloEmAbertoRaw } from '@/lib/carga/parse-titulos-em-aberto'
import type { DemonstrativoCompetenciaRaw } from '@/lib/carga/parse-demonstrativo-competencia'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

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

export async function inserirLoteLancamentosAction(
  lote: LancamentoRaw[],
  isFirst: boolean,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_lancamentos')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const { error } = await bound('inserir_lote_lancamentos', { p_linhas: lote })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarLancamentosAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<ResultadoCarga | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const { error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('regenerar_dim_operacao_weddings')
    if (error) return { error: `Erro ao regenerar operações: ${error.message}` }

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      erros: [],
      preview: {
        antes:  { total_lancamentos: totalAntes },
        depois: { total_lancamentos: totalInseridas },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Vendas (M3.1) — padrão lotes, parse client-side
// ---------------------------------------------------------------------------

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

export async function inserirLoteVendasAction(
  lote: VendaProdutoRaw[],
  isFirst: boolean,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // v4.15.0 (F2-real, ADR-0104): caminho real migrado ao pipeline ATÔMICO (0116/0118).
    // NÃO trunca a base aqui (era `truncate_dynamic_tables` ANTES do transform → base
    // ficava vazia se o transform falhasse). Em vez disso: limpa a STAGING (não-destrutivo)
    // no 1º lote e carrega nela. O swap destrutivo só ocorre em finalizar → promover_carga_vendas,
    // numa transação única. As metas saem daqui e vão para finalizar (após a validação passar).
    if (isFirst) {
      const { error: limpErr } = await bound('limpar_staging_vendas')
      if (limpErr) return { error: `Erro ao preparar a carga: ${limpErr.message}` }
    }

    const { error } = await bound('inserir_lote_staging', { p_linhas: lote })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarVendasAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{
  sucesso: boolean
  total_linhas: number
  vendas_count: number
  fato_item_count: number
  erros: string[]
  avisos: string[]
  preview: { antes: { total_vendas: number }; depois: { total_vendas: number } }
} | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    // v4.15.0 (F2-real, ADR-0104): validação NÃO-destrutiva → metas → swap ATÔMICO.
    // 1. Pré-validação ANTES de qualquer destruição (range de datas vs dim_data, contagem).
    //    Erro de RPC ou validação reprovada → mensagem explícita; a base atual fica intacta.
    const valRes = await bound('validar_carga_staging')
    if (valRes.error) return { error: `Erro na validação da carga: ${valRes.error.message}. A base atual foi preservada.` }
    const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_staging')
    if (!validacao) return { error: 'A validação retornou em formato inesperado. A base atual foi preservada.' }
    if (!validacao.ok) {
      const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
      return { error: `${msgs.join(' ')} A base atual foi preservada.` }
    }

    // 2. Metas (upsert idempotente — fora da transação do swap; só após validar).
    try { await loadMetas(false) } catch (e) {
      return { error: `Erro ao carregar metas: ${e instanceof Error ? e.message : String(e)}` }
    }

    // 3. Swap ATÔMICO: truncate + copia staging→raw + transform + dims + refresh, tudo numa
    //    transação. Falha aqui → ROLLBACK no banco → a base de leitura NUNCA fica vazia.
    const promRes = await bound('promover_carga_vendas')
    if (promRes.error) return { error: `Erro ao promover a carga (base preservada): ${promRes.error.message}` }
    const promocao = parseRpc(cargaPromocaoSchema, promRes, 'promover_carga_vendas')
    if (!promocao) return { error: 'A promoção retornou em formato inesperado.' }

    return {
      sucesso: true,
      total_linhas: totalInseridas,
      vendas_count: promocao.vendas_count,
      fato_item_count: promocao.fato_venda_item_count,
      erros: [],
      avisos: validacao.avisos ?? [], // op_propria (v4.17.0): degradação não-bloqueante
      preview: {
        antes:  { total_vendas: totalAntes },
        depois: { total_vendas: promocao.vendas_count },
      },
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Pessoas (v4.29.0) — cadastro fiscal do Monde. Padrão ATÔMICO (= Vendas, 0116):
// limpar_staging_pessoas → inserir_lote_staging_pessoas → validar → promover (swap
// numa transação; o Faturamento depende, a base não pode ficar vazia no meio).
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
// Lançamentos por Movimentação (raw.lancamentos_movimentacao) — Fluxo de Caixa
// Onda 1, v5.2.0. Full-swap (batch 500; arquivo_origem carregado por linha).
// financeiro.fato_fluxo (regenerar_fluxo_caixa) lê esta base — realizado por
// data_movimentacao + previsto por movimentação futura (M2).
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

export async function inserirLoteLancamentosMovimentacaoAction(
  lote: LancamentoMovimentacaoRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_lancamentos_movimentacao')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_lancamentos_movimentacao', { p_linhas: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarLancamentosMovimentacaoAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  await requireAreaAction('admin/uploads')
  // Regenera financeiro.fato_fluxo (realizado por movimentação + previsto), lendo AS DUAS bases novas.
  return regenerarFluxoCaixa(totalInseridas)
}

// ---------------------------------------------------------------------------
// Lançamentos por Vencimento em aberto (raw.titulos_em_aberto) — Fluxo de Caixa
// Onda 1, v5.2.0. Mesmo padrão do Lançamentos por Movimentação. O previsto por
// vencimento é lido por financeiro.fato_fluxo (regenerar_fluxo_caixa).
// ---------------------------------------------------------------------------

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

export async function inserirLoteTitulosEmAbertoAction(
  lote: TituloEmAbertoRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_titulos_em_aberto')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_titulos_em_aberto', { p_linhas: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function finalizarTitulosEmAbertoAction(
  totalAntes: number,
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  await requireAreaAction('admin/uploads')
  // M2: regenera o fato_fluxo lendo AS DUAS bases novas (previsto por vencimento + realizado por movimentação).
  return regenerarFluxoCaixa(totalInseridas)
}

// Regenera financeiro.fato_fluxo (M2, eixo movimentação). Chamado no finalizar dos DOIS
// uploads (movimentação e em-aberto) — a RPC lê ambas as bases. Idempotente (TRUNCATE+rebuild).
// Surfacea contas NOVAS não classificadas como aviso (nunca em silêncio — invariante 3).
async function regenerarFluxoCaixa(
  totalInseridas: number,
): Promise<{ sucesso: boolean; total_linhas: number; erros: string[] } | { error: string }> {
  try {
    const supabase = getAdminClient()
    const { data, error } = await (supabase.rpc as unknown as BoundRpc).bind(supabase)('regenerar_fluxo_caixa')
    if (error) return { error: `Erro ao regenerar fluxo de caixa: ${error.message}` }
    const meta = data as { contas_novas?: string[]; contas_novas_n?: number } | null
    const erros: string[] = []
    if (meta?.contas_novas_n && meta.contas_novas_n > 0) {
      erros.push(
        `Atenção: ${meta.contas_novas_n} conta(s) nova(s) não classificada(s) automaticamente: ` +
          `${(meta.contas_novas ?? []).join(', ')}. Confira a classificação de cartão em dim_conta_bancaria.`,
      )
    }
    return { sucesso: true, total_linhas: totalInseridas, erros }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

// ---------------------------------------------------------------------------
// Demonstrativo de Resultado por COMPETÊNCIA (raw.demonstrativo_competencia) —
// v5.8.0, M1. Full-swap simples: nada a regenerar depois, porque a leitura é uma VIEW
// (financeiro.vw_dre_competencia) sobre a base × de-para. Não existe fato a
// materializar, então não existe deriva possível entre base e leitura.
//
// O `finalizar` aqui NÃO é formalidade: é o ALARME DE INGESTÃO que o briefing pede como
// invariante — confronta contagem e soma do ARQUIVO (medidas pelo parser, no cliente)
// com contagem e soma GRAVADAS (medidas pelo banco). Divergência devolve erro e o card
// não declara sucesso. É a lição da v5.5.2 aplicada na fundação: lá um ×1000 silencioso
// atravessou 753 testes e só apareceu meses depois, na DRE.
// ---------------------------------------------------------------------------

/** Status da base de competência. `soma_centavos` é inteiro — ver o header da 0255. */
export interface StatusDemonstrativoCompetencia {
  total:              number
  soma_centavos:      number
  pares:              number
  cobertura_de:       string | null
  cobertura_ate:      string | null
  ultima_atualizacao: string | null
}

async function lerStatusDemonstrativoCompetencia(): Promise<StatusDemonstrativoCompetencia | { error: string }> {
  const supabase = getAdminClient()
  const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)
  const { data, error } = await bound('status_demonstrativo_competencia')
  if (error) return { error: error.message }
  const s = data as Partial<StatusDemonstrativoCompetencia> | null
  return {
    total:              s?.total ?? 0,
    soma_centavos:      Number(s?.soma_centavos ?? 0),
    pares:              s?.pares ?? 0,
    cobertura_de:       s?.cobertura_de ?? null,
    cobertura_ate:      s?.cobertura_ate ?? null,
    ultima_atualizacao: s?.ultima_atualizacao ?? null,
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

export async function inserirLoteDemonstrativoCompetenciaAction(
  lote: DemonstrativoCompetenciaRaw[],
  isFirst: boolean,
  arquivoOrigem: string,
): Promise<{ inseridas: number } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const supabase = getAdminClient()
    const bound = (supabase.rpc as unknown as BoundRpc).bind(supabase)

    if (isFirst) {
      const { error } = await bound('truncar_demonstrativo_competencia')
      if (error) return { error: `Erro ao limpar tabela: ${error.message}` }
    }

    const rows = lote.map(r => ({ ...r, arquivo_origem: arquivoOrigem }))
    const { error } = await bound('inserir_lote_demonstrativo_competencia', { p_linhas: rows })
    if (error) return { error: `Erro ao inserir lote: ${error.message}` }

    return { inseridas: lote.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Alarme de ingestão: o que o arquivo tinha × o que a base gravou.
 *
 * `somaCentavosArquivo` vem de `somaCentavos()` (o parser), a mesma função que o teste
 * prova — não há segunda implementação da soma. A comparação é entre INTEIROS nas duas
 * pontas, então "bate" quer dizer bate ao centavo, não "bate aproximadamente".
 */
export async function finalizarDemonstrativoCompetenciaAction(
  totalEnviadas: number,
  somaCentavosArquivo: number,
): Promise<{ sucesso: true; status: StatusDemonstrativoCompetencia } | { error: string }> {
  await requireAreaAction('admin/uploads')
  try {
    const status = await lerStatusDemonstrativoCompetencia()
    if ('error' in status) return { error: `Erro ao conferir a carga: ${status.error}` }

    const problemas: string[] = []
    if (status.total !== totalEnviadas) {
      problemas.push(`o arquivo tinha ${totalEnviadas} linha(s) e a base gravou ${status.total}`)
    }
    if (status.soma_centavos !== somaCentavosArquivo) {
      const fmt = (c: number) =>
        (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      problemas.push(`a soma do arquivo é ${fmt(somaCentavosArquivo)} e a da base é ${fmt(status.soma_centavos)}`)
    }
    if (problemas.length > 0) {
      return {
        error:
          `A carga NÃO fecha com o arquivo: ${problemas.join(' e ')}. ` +
          `A base ficou com o conteúdo enviado, mas confira o arquivo e recarregue antes de usar os números.`,
      }
    }

    return { sucesso: true, status }
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
