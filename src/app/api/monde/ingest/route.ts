// API Route de ingestão do Monde (v5.1.2/M5; alcance corrigido na v5.4.4; API oficial v3 na v6.2.0).
// runtime nodejs, server-only. Aciona `sincronizar` (varredura de cabeçalhos → fila de detalhe →
// transform → staging → promover → marcar → refresh) com um client SERVICE-ROLE (as RPCs monde_* são
// service_role-only).
//
// Auth (duas portas):
//   • Vercel Cron / pg_cron → header `Authorization: Bearer $CRON_SECRET`. Sem sessão/cookies.
//   • Disparo manual (backfill/window/auditoria) → sessão com área `admin/uploads`.
//
// Modos (?mode=):
//   • incremental (default, cron de 15 min) — varre a lista até as vendas CRIADAS há 7 dias e drena a
//     fila sob orçamento; o que não couber fica para o próximo tick.
//   • reconciliacao (3×/dia, um mês por invocação em ciclo) — varre fundo (janela de 3 meses + margem
//     de criação), drena, e APURA o mês pela tabela de cabeçalhos para a CURA e o TRIPWIRE.
//   • auditoria&from&to — SÓ LEITURA: lista a API e pergunta ao banco quais vendas faltam.
//   • window&from&to[&max=N] — força a releitura de um intervalo de data de venda; resumível (re-invocar
//     até `done:true`).
//   • backfill[&from=YYYY-MM-DD] — `window` mês a mês por cursor, resumível.
//
// ── v6.2.0: POR QUE A FORMA MUDOU ──────────────────────────────────────────────────────────
// A `monde-data` (TTARS) foi desligada em 02/10/2026. A v3 não filtra por data, ordena por CRIAÇÃO, não
// tem "alterado desde" nem `total`, e aceita 1 chamada a cada 1,3 s. Ver o topo de `ingest.ts`. A rede
// AUTO-CURATIVA da v5.4.4 continua: a reconciliação é a varredura FUNDA + a cura; a venda lançada com
// atraso entra pelo incremental, porque aparece no topo da lista (é recém-criada).
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getAdminClient } from '@/lib/supabase/admin'
import { criarClienteMonde } from '@/lib/monde/client'
import {
  sincronizar, apurarMes, bloqueioDaApuracao, corteDoDia,
  type MondeDb, type ResultadoSincronizacao,
} from '@/lib/monde/ingest'
import {
  MESES_RECONCILIACAO,
  MESES_TRIPWIRE,
  TETO_REMOCOES_RECONCILIACAO,
  mesesRecentes,
  rangeDoMes,
  proximoMesReconciliacao,
  podeCurar,
  avaliarMes,
  mesclarTripwire,
  type Tripwire,
} from '@/lib/monde/reconciliacao'
import { listarJanelaDaApi, menosDias, MARGEM_CRIACAO_DIAS } from '@/lib/monde/auditoria'
import { abrirExecucao, concluirExecucao } from '@/lib/ingestao/execucao'

// v5.10.0/D4-011: `unknown` em vez de `any` — o retorno já é estreitado por cast/validação.
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Dias de CRIAÇÃO que o incremental varre (o atraso mediano de registro é 0–4 dias; p99 11). */
const DIAS_INCREMENTAL = 7

/**
 * Orçamento de chamadas à API por invocação. A 1 chamada / 1,3 s cabem ~175 chamadas; o resto do
 * `maxDuration` (70 s) fica para staging/promover/marcar/refresh e para a cura.
 */
const PRAZO_API_MS = 230_000

/** Uma venda já lida só é RE-lida (revisita) depois deste intervalo. */
const REVISITA_HORAS = 12

/**
 * TTL do lock de ingestão. ⚠️ Tem de ficar > 2× `maxDuration` (ver o corpo de `monde_ingest_claim`,
 * migration 0232): não há heartbeat nem fencing token.
 */
const LOCK_TTL_SEGUNDOS = 900

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
/** Mês seguinte a um `YYYY-MM` — cursor do backfill. */
function proxMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function handle(req: NextRequest): Promise<Response> {
  const inicio = Date.now()
  // ── auth: cron secret OU sessão admin ──
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!cronOk) {
    const guard = await requireAreaApi(['admin/uploads'])
    if (guard instanceof Response) return guard
  }

  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode') ?? 'incremental'
  const admin = getAdminClient()
  const db: MondeDb = { rpc: (fn, args) => (admin.rpc as unknown as Rpc)(fn, args) }
  const log: string[] = []
  const onLog = (m: string) => { log.push(m); console.info(`[monde-ingest] ${m}`) }

  async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error(`RPC ${fn} falhou: ${JSON.stringify(error)}`)
    return data
  }
  async function controle(chave: string): Promise<string | null> {
    const v = await rpc('monde_ingest_control_get', { p_chave: chave })
    return v === null || v === undefined || v === '' ? null : String(v)
  }

  /**
   * Roda `corpo` com o lock de ingestão tomado, ou devolve `null` se outra ingestão já está em curso.
   * O recurso protegido é a STAGING COMPARTILHADA (TRUNCATE a cada lote) e, desde a v6.2.0, também o
   * RITMO da API: duas ingestões simultâneas dobrariam a taxa e levariam 429.
   */
  async function comLock<T>(rotulo: string, corpo: () => Promise<T>): Promise<T | null> {
    const dono = `${rotulo}:${crypto.randomUUID()}`
    const ganhou = await rpc('monde_ingest_claim', { p_ttl_segundos: LOCK_TTL_SEGUNDOS, p_dono: dono })
    if (ganhou !== true) {
      onLog(`lock de ingestão ocupado — ${rotulo} PULADO (outra ingestão em curso)`)
      return null
    }
    try {
      return await corpo()
    } finally {
      try {
        const soltou = await rpc('monde_ingest_release', { p_dono: dono })
        if (soltou !== true) onLog(`aviso: release devolveu ${JSON.stringify(soltou)} — TTL expirou antes do fim?`)
      } catch (e) {
        onLog(`aviso: release do lock falhou — ${(e as Error).message}`)
      }
    }
  }

  const hoje = hojeSP()
  const janela = mesesRecentes(hoje, MESES_RECONCILIACAO)
  /** Início do mês mais antigo da janela de reconciliação — piso da revisita. */
  const inicioJanela = rangeDoMes(janela[janela.length - 1]).from
  const revisitaAntes = new Date(Date.now() - REVISITA_HORAS * 3_600_000).toISOString()
  const novoCliente = () => criarClienteMonde({ prazo: inicio + PRAZO_API_MS })

  /**
   * Força a releitura de [from, to] e drena — o corpo de `window` e `backfill`. Resumível: o cursor da
   * varredura e o "já forçado" moram em `monde.ingest_control`, por intervalo.
   */
  async function releitura(from: string, to: string, maxFila: number | undefined) {
    const chave = `${from}..${to}`
    const cursorInicial = await controle(`window_cursor:${chave}`)
    const cliente = novoCliente()
    const r = await sincronizar(db, cliente, {
      corte: corteDoDia(menosDias(from, MARGEM_CRIACAO_DIAS)),
      cursorInicial,
      revisitaDesde: inicioJanela,
      revisitaAntes,
      limiteFila: maxFila,
      onLog,
      antesDaFila: async () => {
        if ((await controle(`window_forcado:${chave}`)) === null) {
          const n = await rpc('monde_cabecalho_forcar', { p_from: from, p_to: to })
          await rpc('monde_ingest_control_set', { p_chave: `window_forcado:${chave}`, p_valor: new Date().toISOString() })
          onLog(`releitura forçada de ${n} venda(s) já lidas em ${chave}`)
        }
      },
    })
    await rpc('monde_ingest_control_set', {
      p_chave: `window_cursor:${chave}`, p_valor: r.varredura.chegou_no_corte ? '' : (r.varredura.cursor_final ?? ''),
    })
    const situacao = await apurarMes(db, from, to, '-infinity')
    const done = r.varredura.chegou_no_corte && situacao.pendentes === 0 && situacao.erros === 0
    if (done) {
      // Intervalo concluído: limpa as marcas, para uma releitura futura do mesmo intervalo forçar de novo.
      await rpc('monde_ingest_control_set', { p_chave: `window_forcado:${chave}`, p_valor: '' })
    }
    return { resultado: r, pendentes: situacao.pendentes, erros: situacao.erros, done }
  }

  try {
    // ── auditoria (SÓ LEITURA — sem lock, não toca staging nem o índice de cabeçalhos) ─────
    if (mode === 'auditoria') {
      const from = sp.get('from'); const to = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'faltam from/to (YYYY-MM-DD)' }, { status: 400 })
      const janelaApi = await listarJanelaDaApi(novoCliente(), { from, to, onLog })
      const diff = await rpc('monde_vendas_ausentes', { p_numeros: janelaApi.numeros, p_from: from, p_to: to })
      return NextResponse.json({
        mode,
        api: { total: janelaApi.total, paginas: janelaApi.paginas, sem_sale_id: janelaApi.sem_sale_id, parcial: janelaApi.parcial },
        diff,
        // ⚠️ `diff.ausentes` inclui vendas que a transformação exclui por regra (Welcome/sem setor) —
        // ausência CORRETA. A contagem exata do defeito está no `tripwire` de `monde_ingest_status`.
        nota: 'ausentes inclui vendas que a transformação excluiria por regra; a contagem exata do defeito está no tripwire (monde_ingest_status)',
        log,
      })
    }

    if (mode === 'window') {
      const from = sp.get('from'); const to = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'faltam from/to (YYYY-MM-DD)' }, { status: 400 })
      const max = sp.get('max')
      const saida = await comLock('window', () => releitura(from, to, max ? Number(max) : undefined))
      if (saida === null) return NextResponse.json({ mode, pulado: 'lock', log })
      return NextResponse.json({ mode, ...saida, log })
    }

    if (mode === 'backfill') {
      const inicioYm = (sp.get('from') ?? '2023-01-01').slice(0, 7)
      const fimYm = hoje.slice(0, 7)
      const cursor = await controle('backfill_cursor')
      const alvoYm = cursor ? proxMes(cursor) : inicioYm
      if (alvoYm > fimYm) return NextResponse.json({ mode, done: true, cursor })
      const { from, to } = rangeDoMes(alvoYm)
      const saida = await comLock('backfill', () => releitura(from, to, undefined))
      if (saida === null) return NextResponse.json({ mode, pulado: 'lock', log })
      // O cursor só avança com o mês CONCLUÍDO (varredura no corte e fila do mês vazia).
      if (saida.done) await rpc('monde_ingest_control_set', { p_chave: 'backfill_cursor', p_valor: alvoYm })
      return NextResponse.json({ mode, mes: alvoYm, ...saida, mes_concluido: saida.done, done: saida.done && proxMes(alvoYm) > fimYm, log })
    }

    // ── reconciliacao ─────────────────────────────────────────────────────────────────────
    // UM mês por invocação (cursor em ciclo sobre a janela de 3). A varredura é FUNDA (até a criação
    // anterior ao início da janela − margem); a apuração e a cura são do mês do cursor.
    if (mode === 'reconciliacao') {
      // v6.0.0/M6: registra a PRÓPRIA execução em `ingestao.execucao` — camada adicional.
      const execId = await abrirExecucao('monde-reconciliacao')
      try {
      const cursorAtual = await controle('reconciliacao_cursor')
      const mes = proximoMesReconciliacao(cursorAtual, janela)
      const { from, to } = rangeDoMes(mes)
      const fechaCiclo = mes === janela[janela.length - 1]
      onLog(`reconciliação: mês ${mes} (${from}..${to}); janela=${janela.join(',')}`)

      const saida = await comLock('reconciliacao', async () => {
        const resultado: ResultadoSincronizacao = await sincronizar(db, novoCliente(), {
          corte: corteDoDia(menosDias(inicioJanela, MARGEM_CRIACAO_DIAS)),
          revisitaDesde: inicioJanela,
          revisitaAntes,
          onLog,
        })
        // Cursor avança só com a rodada concluída sem exceção — falha retoma o MESMO mês.
        await rpc('monde_ingest_control_set', { p_chave: 'reconciliacao_cursor', p_valor: mes })
        await rpc('monde_ingest_control_set', { p_chave: 'ultima_reconciliacao', p_valor: new Date().toISOString() })

        const apuracao = await apurarMes(db, from, to, resultado.varredura.inicio_banco ?? 'infinity')
        const bloqueio = bloqueioDaApuracao(resultado.varredura, apuracao)
        if (bloqueio) {
          // Sem apuração íntegra NÃO há cura nem tripwire do mês: pendente não é "sem sale_id" e não
          // pode acender alarme. O mês volta ao ciclo na próxima volta do cursor.
          onLog(`apuração de ${mes} adiada — ${bloqueio}`)
          return { resultado, apuracao: { ...apuracao, espelhaveis_ids: apuracao.espelhaveis_ids.length }, tripwire: null, adiada: bloqueio }
        }
        // Mapeamento para as funções puras da v5.x: `lidas` = tudo que tem veredito (inclui erro), de modo
        // que `api − lidas` = pendentes = 0 aqui e a conta fecha por construção.
        const excluidas = { welcome: apuracao.welcome, sem_setor: apuracao.sem_setor, sem_item_ativo: 0 }
        const lidas = apuracao.espelhaveis + apuracao.welcome + apuracao.sem_setor + apuracao.erros

        // ── CURA (v5.6.3): remove do espelho o que deixou de ser espelhável ────────────────
        let removidas = 0
        try {
          const cura = podeCurar({
            apiTotal: apuracao.api, lidas, espelhaveis: apuracao.espelhaveis,
            espelhaveisIds: apuracao.espelhaveis_ids.length, excluidas, erros: apuracao.erros,
          })
          if (!cura.ok) {
            onLog(`cura pulada (apuração não íntegra): ${cura.bloqueio}`)
          } else {
            const r = (await rpc('monde_ingest_remover_vendas', {
              p_espelhaveis_ids: apuracao.espelhaveis_ids, p_from: from, p_to: to, p_teto: TETO_REMOCOES_RECONCILIACAO,
            })) as { removidas: number; bloqueado: boolean; candidatas: number; vendas: { venda_numero: string }[] }
            if (r.bloqueado) {
              onLog(`cura BLOQUEADA pelo teto: ${r.candidatas} candidatas > ${TETO_REMOCOES_RECONCILIACAO} — nada removido`)
            } else if (r.removidas > 0) {
              removidas = r.removidas
              onLog(`cura: ${r.removidas} venda(s) retida(s) removida(s) do espelho — ${JSON.stringify(r.vendas)}`)
              // Venda removida volta a ser "não lida": se reaparecer na lista com o mesmo cabeçalho, é relida.
              await rpc('monde_cabecalho_invalidar', { p_numeros: r.vendas.map((v) => v.venda_numero) })
              await rpc('monde_ingest_control_set', {
                p_chave: 'ultima_remocao',
                p_valor: JSON.stringify({ em: new Date().toISOString(), mes, removidas: r.removidas, vendas: r.vendas }),
              })
              await rpc('monde_refresh_mv')
            }
          }
        } catch (e) {
          onLog(`aviso: cura falhou (a reconciliação segue válida) — ${(e as Error).message}`)
        }

        // ── TRIPWIRE: subproduto da apuração, sem chamada extra à API ──────────────────────
        let tripwire: unknown = null
        try {
          const contagem = (await rpc('monde_vendas_ausentes', { p_numeros: [], p_from: from, p_to: to })) as { espelho?: number } | null
          const apurado = avaliarMes({
            mes, apiTotal: apuracao.api, lidas, espelhaveis: apuracao.espelhaveis, excluidas, erros: apuracao.erros,
            espelho: contagem?.espelho ?? 0, removidas, verificadoEmISO: new Date().toISOString(),
          })
          const anteriorRaw = await controle('tripwire')
          let anterior: Tripwire | null = null
          try {
            anterior = anteriorRaw ? (JSON.parse(anteriorRaw) as Tripwire) : null
          } catch (e) {
            anterior = null
            onLog(`aviso: tripwire anterior corrompido — histórico do painel reiniciado — ${(e as Error).message}`)
          }
          const t = mesclarTripwire(anterior, apurado, mesesRecentes(hoje, MESES_TRIPWIRE), new Date().toISOString())
          await rpc('monde_ingest_control_set', { p_chave: 'tripwire', p_valor: JSON.stringify(t) })
          onLog(
            `tripwire ${mes}: api=${apurado.api} espelhaveis=${apurado.espelhaveis} espelho=${apurado.espelho} ` +
            `sobrando=${apurado.sobrando} removidas=${apurado.removidas ?? 0} erros=${apurado.erros} ` +
            `conta_fecha=${apurado.conta_fecha} · geral ${t.acendeu ? `ACESO (${t.motivos.join('; ')})` : 'apagado'}`,
          )
          tripwire = t
        } catch (e) {
          onLog(`aviso: tripwire falhou (a reconciliação segue válida) — ${(e as Error).message}`)
        }
        return { resultado, apuracao: { ...apuracao, espelhaveis_ids: apuracao.espelhaveis_ids.length }, tripwire, adiada: null }
      })

      if (saida === null) {
        await concluirExecucao(execId, 'pulado', { mes, motivo: 'lock_ocupado' })
        return NextResponse.json({ mode, mes, pulado: 'lock', log })
      }
      await concluirExecucao(execId, 'ok', { mes, ciclo_fechado: fechaCiclo, adiada: saida.adiada })
      return NextResponse.json({ mode, mes, janela, ciclo_fechado: fechaCiclo, ...saida, log })
      } catch (e) {
        await concluirExecucao(execId, 'erro', null, e instanceof Error ? e.message : String(e))
        throw e
      }
    }

    // ── incremental (default) ──────────────────────────────────────────────────────────────
    const execIdIncremental = await abrirExecucao('monde-incremental')
    try {
      const corte = corteDoDia(menosDias(hoje, DIAS_INCREMENTAL))
      const resultado = await comLock('incremental', () =>
        sincronizar(db, novoCliente(), { corte, revisitaDesde: inicioJanela, revisitaAntes, onLog }))
      // Lock ocupado é NORMAL (o tick caiu durante uma reconciliação, que cobre os mesmos dias).
      // Responde 200 e NÃO grava o marcador: pular não é sincronizar.
      if (resultado === null) {
        await concluirExecucao(execIdIncremental, 'pulado', { corte, motivo: 'lock_ocupado' })
        return NextResponse.json({ mode: 'incremental', pulado: 'lock', log })
      }
      // Marcador do alarme de atraso de /metas: só quando a varredura alcançou o corte — aí o índice
      // está em dia com a lista; a fila que sobrar é drenada nos próximos ticks.
      if (resultado.varredura.chegou_no_corte) {
        await rpc('monde_ingest_control_set', { p_chave: 'ultimo_incremental', p_valor: `criadas desde ${corte}` })
      }
      await concluirExecucao(execIdIncremental, 'ok', { corte, varredura: resultado.varredura, fila: resultado.fila, api: resultado.api })
      return NextResponse.json({ mode: 'incremental', corte, resultado, log })
    } catch (e) {
      await concluirExecucao(execIdIncremental, 'erro', null, e instanceof Error ? e.message : String(e))
      throw e
    }
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[monde-ingest] ERRO: ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
