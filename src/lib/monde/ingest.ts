// Núcleo de ingestão do Monde — API OFICIAL v3 (v6.2.0). Server-side. Não importa 'server-only' aqui
// de propósito (reuso fora do bundle Next); o segredo mora no client.ts e no client service-role.
//
// ── POR QUE O DESENHO MUDOU ─────────────────────────────────────────────────────────────────
// A `monde-data` (TTARS), desligada em 02/10/2026, filtrava a lista por DATA DA VENDA e devolvia o
// `total` da janela; cada invocação lia a janela inteira com 8 detalhes em paralelo. A v3 não tem nada
// disso (medido em 05/10/2026):
//   • a lista não filtra por data e vem ordenada por CRIAÇÃO (`created_at` desc — 0 inversões em 300;
//     em `sale_date`, 41). A instrução recebida mandava parar "quando sale_date passar do início do
//     período": a venda 74632 (data 01/08, criada 23/09) estava na posição 242, e esse corte a
//     perderia — o mesmo furo da v5.4.4. O corte aqui é por `created_at`;
//   • não existe "alterado desde" ⇒ o índice `monde.venda_cabecalho` (migration 0290) guarda o
//     cabeçalho de cada venda e só a venda nova ou com status/totais diferentes vai para a fila de
//     detalhe (instrução do Yan);
//   • limite de 1 chamada a cada 1,3 s ⇒ cada invocação trabalha sob ORÇAMENTO de tempo e o que não
//     couber fica na fila para o próximo tick. Nada aqui assume "a janela termina numa chamada só".
//
// Fluxo: varrer cabeçalhos (cursor) até o corte → fila (pendentes, depois revisita) → por lote:
// detalhe → nomes → transform → staging → `monde_ingest_promover` → SÓ ENTÃO `monde_cabecalho_marcar`
// (marcar antes e falhar no promover deixaria a venda "lida" sem estar no espelho) → refresh da mv.
import { OrcamentoEsgotado, ErroMonde, type ClienteMonde } from './client'
import { transformSale, type VendaEspelho } from './transform'
import { CacheNomes, carregarCampos } from './nomes'
import type { Cabecalho, VendaDetalhe } from './schemas'

/** Client mínimo (supabase-js/admin) — só o que a ingestão usa. Evita acoplar a database.ts. */
export interface MondeDb {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>
}

export interface PromoverResult {
  ok: boolean; inseridas: number; atualizadas: number; ignoradas: number; itens: number
}

type Classificacao = 'espelhada' | 'welcome' | 'sem_setor' | 'erro'

async function rpc(db: MondeDb, fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args)
  if (error) throw new Error(`RPC ${fn} falhou: ${JSON.stringify(error)}`)
  return data
}

/** `created_at` no formato da v3 (`AAAA-MM-DDTHH:MM:SS`, Brasília) para o início de um dia `AAAA-MM-DD`. */
export function corteDoDia(diaISO: string): string {
  return `${diaISO}T00:00:00`
}

// ── 1. Varredura de cabeçalhos ────────────────────────────────────────────────────────────

export interface ResultadoVarredura {
  paginas: number
  registrados: number
  novos: number
  /** Cabeçalhos que ficaram (ou já estavam) com o detalhe pendente, segundo o registrar. */
  pendentes: number
  /** Linhas da lista sem id/data/criação — não registráveis. Bloqueiam a cura (a venda some da conta). */
  invalidos: number
  /** A varredura alcançou o corte (ou o fim da lista)? `false` = parou por orçamento. */
  chegou_no_corte: boolean
  /** Cursor para continuar uma varredura parcial (modos manuais). */
  cursor_final: string | null
  /** `now()` do BANCO no registro da 1ª página — o `p_visto_desde` da apuração (sem relógio do app). */
  inicio_banco: string | null
}

/** Cabeçalho da lista → linha de `monde_cabecalho_registrar`; `null` se faltar o essencial. */
export function linhaDeCabecalho(c: Cabecalho): Record<string, unknown> | null {
  if (!c.id || !c.sale_number || !/^\d{4}-\d{2}-\d{2}$/.test(c.sale_date) || !/^\d{4}-\d{2}-\d{2}T/.test(c.created_at) || !c.status) return null
  return {
    sale_id: c.id, venda_numero: c.sale_number, data_venda: c.sale_date,
    criado_monde: c.created_at, status: c.status, totais: c.totals,
  }
}

export async function varrerCabecalhos(
  db: MondeDb,
  cliente: ClienteMonde,
  opts: { corte: string; cursorInicial?: string | null; onLog?: (m: string) => void },
): Promise<ResultadoVarredura> {
  const r: ResultadoVarredura = {
    paginas: 0, registrados: 0, novos: 0, pendentes: 0, invalidos: 0,
    chegou_no_corte: false, cursor_final: opts.cursorInicial ?? null, inicio_banco: null,
  }
  let cursor = opts.cursorInicial ?? null
  try {
    for (;;) {
      const pagina = await cliente.listarVendas(cursor)
      r.paginas++
      const linhas: Record<string, unknown>[] = []
      for (const c of pagina.data) {
        const l = linhaDeCabecalho(c)
        if (l) linhas.push(l)
        else r.invalidos++
      }
      if (linhas.length) {
        const res = (await rpc(db, 'monde_cabecalho_registrar', { p_cabecalhos: linhas })) as
          { registrados: number; novos: number; pendentes: number; agora: string }
        r.registrados += res.registrados
        r.novos += res.novos
        r.pendentes += res.pendentes
        r.inicio_banco ??= res.agora
      }
      // A lista é desc por criação: se a ÚLTIMA da página já é anterior ao corte, todas as próximas
      // também são — a varredura terminou.
      const ultima = pagina.data[pagina.data.length - 1]
      const passouDoCorte = ultima !== undefined && ultima.created_at !== '' && ultima.created_at < opts.corte
      const fim = !pagina.pagination.has_next_page || !pagina.pagination.next_cursor
      cursor = pagina.pagination.next_cursor ?? null
      r.cursor_final = cursor
      if (passouDoCorte || fim) { r.chegou_no_corte = true; break }
    }
  } catch (e) {
    if (!(e instanceof OrcamentoEsgotado)) throw e
    opts.onLog?.(`varredura parou por orçamento em ${r.paginas} página(s) — continua no próximo tick`)
  }
  opts.onLog?.(
    `varredura: ${r.paginas} pág. · ${r.registrados} cabeçalhos (${r.novos} novos, ${r.pendentes} p/ ler)` +
    (r.invalidos ? ` · ${r.invalidos} INVÁLIDOS` : '') + ` · corte ${opts.corte} ${r.chegou_no_corte ? 'alcançado' : 'NÃO alcançado'}`,
  )
  return r
}

// ── 2. Fila de detalhe ────────────────────────────────────────────────────────────────────

export interface ItemFila { sale_id: string; venda_numero: string; cabecalho_hash: string; motivo: 'pendente' | 'revisita' }

export interface ResultadoFila {
  lidas: number
  espelhadas: number
  excluidas: { welcome: number; sem_setor: number; sem_item_ativo: number }
  erros: number
  promover: PromoverResult
  parou_por_orcamento: boolean
}

function somarPromover(a: PromoverResult, b: PromoverResult | null): PromoverResult {
  if (!b) return a
  return {
    ok: a.ok && b.ok, inseridas: a.inseridas + b.inseridas, atualizadas: a.atualizadas + b.atualizadas,
    ignoradas: a.ignoradas + b.ignoradas, itens: a.itens + b.itens,
  }
}

export async function drenarFila(
  db: MondeDb,
  cliente: ClienteMonde,
  nomes: CacheNomes,
  campos: { campoSetor: number; campoVendedorWeddings: number | null },
  opts: { limite: number; revisitaDesde: string; revisitaAntes: string; lote?: number; onLog?: (m: string) => void },
): Promise<ResultadoFila> {
  const lote = opts.lote ?? 20
  const log = (m: string) => opts.onLog?.(m)
  const out: ResultadoFila = {
    lidas: 0, espelhadas: 0, excluidas: { welcome: 0, sem_setor: 0, sem_item_ativo: 0 }, erros: 0,
    promover: { ok: true, inseridas: 0, atualizadas: 0, ignoradas: 0, itens: 0 }, parou_por_orcamento: false,
  }
  const fila = ((await rpc(db, 'monde_cabecalho_fila', {
    p_limite: opts.limite, p_revisita_desde: opts.revisitaDesde, p_revisita_antes: opts.revisitaAntes,
  })) ?? []) as ItemFila[]
  if (!fila.length) { log('fila vazia'); return out }

  const resolvedor = nomes.resolvedor(campos)
  for (let i = 0; i < fila.length && !out.parou_por_orcamento; i += lote) {
    const bloco = fila.slice(i, i + lote)
    const lidos: { item: ItemFila; detalhe: VendaDetalhe; raw: unknown }[] = []
    const resultados: { sale_id: string; lido_hash: string; classificacao: Classificacao; erro?: string }[] = []

    // 2a. Detalhes. Orçamento acabou no meio ⇒ o que já foi lido NESTE bloco ainda é processado.
    for (const item of bloco) {
      try {
        lidos.push({ item, ...(await cliente.detalheVenda(item.sale_id)) })
      } catch (e) {
        if (e instanceof OrcamentoEsgotado) { out.parou_por_orcamento = true; break }
        out.erros++
        const msg = e instanceof ErroMonde ? e.message : (e as Error).message
        resultados.push({ sale_id: item.sale_id, lido_hash: item.cabecalho_hash, classificacao: 'erro', erro: msg })
        log(`venda ${item.venda_numero}: erro no detalhe — ${msg}`)
      }
    }

    // 2b. Nomes. Orçamento acabou aqui ⇒ o bloco inteiro volta para a fila (sem nome não se grava).
    try {
      await nomes.preparar(lidos.map((l) => l.detalhe))
    } catch (e) {
      if (!(e instanceof OrcamentoEsgotado)) throw e
      out.parou_por_orcamento = true
      log(`orçamento acabou resolvendo nomes — ${lidos.length} venda(s) voltam para a fila`)
      lidos.length = 0
    }

    // 2c. Transform.
    const vendas: VendaEspelho[] = []
    for (const { item, detalhe, raw } of lidos) {
      try {
        const t = transformSale(detalhe, raw, resolvedor)
        if ('venda' in t) {
          vendas.push(t.venda)
          resultados.push({ sale_id: item.sale_id, lido_hash: item.cabecalho_hash, classificacao: 'espelhada' })
        } else {
          // `sem_item_ativo` nunca é devolvido desde a v5.4.5 (ver transform.ts); se voltar, é erro.
          if (t.excluida === 'sem_item_ativo') throw new Error('transform devolveu sem_item_ativo (removido na v5.4.5)')
          out.excluidas[t.excluida]++
          resultados.push({ sale_id: item.sale_id, lido_hash: item.cabecalho_hash, classificacao: t.excluida })
        }
      } catch (e) {
        out.erros++
        resultados.push({ sale_id: item.sale_id, lido_hash: item.cabecalho_hash, classificacao: 'erro', erro: (e as Error).message })
      }
    }

    // 2d. Staging → promover → marcar (nesta ordem).
    if (vendas.length) {
      await rpc(db, 'monde_ingest_limpar_staging')
      await rpc(db, 'monde_ingest_lote', { p_vendas: vendas })
      out.promover = somarPromover(out.promover, (await rpc(db, 'monde_ingest_promover')) as PromoverResult)
    }
    if (resultados.length) {
      const marcadas = (await rpc(db, 'monde_cabecalho_marcar', { p_resultados: resultados })) as number
      if (marcadas !== resultados.length) {
        throw new Error(`monde_cabecalho_marcar gravou ${marcadas} de ${resultados.length} — cabeçalho ausente?`)
      }
    }
    out.lidas += lidos.length
    out.espelhadas += vendas.length
  }
  log(`fila: ${out.lidas} lida(s) · ${out.espelhadas} espelhada(s) · excluídas ${JSON.stringify(out.excluidas)} · erros ${out.erros}` +
    ` · promover ${JSON.stringify(out.promover)}${out.parou_por_orcamento ? ' · PAROU POR ORÇAMENTO' : ''}`)
  return out
}

// ── 3. Rodada completa ────────────────────────────────────────────────────────────────────

export interface ResultadoSincronizacao {
  varredura: ResultadoVarredura
  fila: ResultadoFila
  api: { chamadas: number; c429: number; pessoas: number; produtos: number; catalogo_paginas: number }
}

/** Uma rodada: varre até o corte, drena a fila sob orçamento e atualiza a mv se algo mudou. */
export async function sincronizar(
  db: MondeDb,
  cliente: ClienteMonde,
  opts: {
    corte: string
    revisitaDesde: string
    revisitaAntes: string
    limiteFila?: number
    cursorInicial?: string | null
    antesDaFila?: () => Promise<void>
    onLog?: (m: string) => void
  },
): Promise<ResultadoSincronizacao> {
  const campos = await carregarCampos(cliente)
  const nomes = new CacheNomes(db, cliente)
  await nomes.iniciar()
  const varredura = await varrerCabecalhos(db, cliente, { corte: opts.corte, cursorInicial: opts.cursorInicial, onLog: opts.onLog })
  await opts.antesDaFila?.()
  const fila = await drenarFila(db, cliente, nomes, campos, {
    limite: opts.limiteFila ?? 400, revisitaDesde: opts.revisitaDesde, revisitaAntes: opts.revisitaAntes, onLog: opts.onLog,
  })
  if (fila.promover.inseridas + fila.promover.atualizadas > 0) await rpc(db, 'monde_refresh_mv')
  return {
    varredura,
    fila,
    api: {
      chamadas: cliente.metricas.chamadas, c429: cliente.metricas.c429,
      pessoas: nomes.metricas.pessoas_api, produtos: nomes.metricas.produtos_api, catalogo_paginas: nomes.metricas.catalogo_paginas,
    },
  }
}

// ── 4. Apuração do mês (cura e tripwire) ──────────────────────────────────────────────────

export interface ApuracaoMes {
  api: number
  espelhaveis: number
  welcome: number
  sem_setor: number
  erros: number
  pendentes: number
  espelhaveis_ids: string[]
}

/**
 * Apura um mês pela tabela de cabeçalhos (sem reabrir detalhe). `vistoDesde` = início da varredura
 * desta rodada, do relógio do BANCO: venda que a varredura não listou fica fora da conta — e por isso
 * vira candidata da cura (mesma semântica da v5.6.3).
 */
export async function apurarMes(db: MondeDb, from: string, to: string, vistoDesde: string): Promise<ApuracaoMes> {
  return (await rpc(db, 'monde_cabecalho_apurar', { p_from: from, p_to: to, p_visto_desde: vistoDesde })) as ApuracaoMes
}

/**
 * Por que a apuração deste mês NÃO pode alimentar cura nem tripwire (ou `null` se pode). Os bloqueios
 * de integridade da apuração em si (rodada vazia, erros, paridade) seguem em `podeCurar`; aqui ficam os
 * que só existem na v3: a varredura não chegou ao corte, a lista trouxe linha inválida, ou ainda há
 * venda do mês esperando leitura (pendente não é "sem sale_id" — não pode acender o tripwire).
 */
export function bloqueioDaApuracao(v: ResultadoVarredura, a: ApuracaoMes): string | null {
  if (!v.chegou_no_corte) return 'varredura não alcançou o corte (orçamento) — a lista do mês está incompleta'
  if (v.invalidos > 0) return `${v.invalidos} linha(s) da lista sem id/data/criação`
  if (!v.inicio_banco) return 'varredura sem nenhum cabeçalho registrado'
  if (a.pendentes > 0) return `${a.pendentes} venda(s) do mês ainda na fila de leitura`
  return null
}
