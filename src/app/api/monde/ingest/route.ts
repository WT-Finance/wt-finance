// API Route de ingestão do Monde (v5.1.2/M5; alcance corrigido na v5.4.4). runtime nodejs,
// server-only. Aciona `ingestWindow` (lista→detalhe→transform→staging→promover→refresh) com um
// client SERVICE-ROLE (as RPCs monde_ingest_* são service_role-only). Idempotente por raw_hash.
//
// Auth (duas portas):
//   • Vercel Cron / pg_cron → header `Authorization: Bearer $CRON_SECRET` (Vercel injeta quando
//     CRON_SECRET está no ambiente). Sem sessão/cookies.
//   • Disparo manual (backfill/window/auditoria) → sessão com área `admin/uploads`.
//
// Modos (?mode=):
//   • incremental (default) — janela = hoje−7d..hoje. É o que o cron de 15min chama.
//   • reconciliacao (v5.4.4) — UM mês por invocação, ciclando os 3 últimos meses por cursor.
//     A rede AUTO-CURATIVA desta versão. Fecha o ciclo populando o tripwire.
//   • auditoria&from&to (v5.4.4) — SÓ LEITURA: lista a API e pergunta ao banco quais vendas
//     faltam. É o detector do furo e o teste de aceitação da versão.
//   • window&from=YYYY-MM-DD&to=YYYY-MM-DD[&max=N] — janela explícita (demonstração/checkpoint).
//   • backfill[&from=YYYY-MM-DD] — resumível por cursor de MÊS: processa o próximo mês após o
//     cursor e avança; re-invocar até `done:true`. UPSERT torna o reprocesso seguro.
//
// ── POR QUE A v5.4.4 EXISTE ────────────────────────────────────────────────────────────────
// A API do Monde filtra a listagem por DATA DA VENDA. A janela antiga do incremental era
// `hoje−2d..hoje`, então venda REGISTRADA COM ATRASO e data retroativa nunca caía nela — e o
// incremental nunca voltava àquele dia. Medido em 04/08/2026 contra a API, venda a venda: 42
// vendas fora do espelho (R$ 392.070,01 de faturamento), 37 de 38 registradas mais de 2 dias
// depois da data da venda, atraso mediano 4 dias e MÁXIMO 32. O espelho é a fonte de produção
// de Metas e Performance desde a v5.1.4 ⇒ era subestimação de faturamento em produção.
//
// A correção NÃO é alargar a janela até caber o pior caso (32 dias observado não é teto
// garantido, e puxar 35 dias 96×/dia é caro). É janela curta e barata para o caso comum +
// reconciliação larga diária, que é AUTO-CURATIVA: não depende de acertar o tamanho de nenhuma
// janela. Ver ADR-0164 e a migration 0232.
export const runtime = 'nodejs'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getAdminClient } from '@/lib/supabase/admin'
import { ingestWindow, type MondeDb } from '@/lib/monde/ingest'
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
import { listarJanelaDaApi } from '@/lib/monde/auditoria'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>

/** Dias que o incremental cobre. Era 2 até a v5.4.4; o atraso MEDIANO de registro é 4. */
const DIAS_INCREMENTAL = 7

/**
 * TTL do lock de ingestão. ⚠️ Tem de ficar > 2× `maxDuration` (ver o corpo de
 * `monde_ingest_claim`, migration 0232): não há heartbeat nem fencing token, então é essa
 * margem que impede o lock de um processo VIVO de ser expirado debaixo dele. Mexeu no
 * `maxDuration`? Mexa aqui.
 */
const LOCK_TTL_SEGUNDOS = 900

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function addDiasISO(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Mês seguinte a um `YYYY-MM` — cursor do backfill, que avança para frente sem ciclar. */
function proxMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m, 1)) // m (1-based) → mês seguinte (0-based)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

async function handle(req: NextRequest): Promise<Response> {
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
  const onLog = (m: string) => { log.push(m); console.log(`[monde-ingest] ${m}`) }

  async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await db.rpc(fn, args)
    if (error) throw new Error(`RPC ${fn} falhou: ${JSON.stringify(error)}`)
    return data
  }

  /**
   * Roda `corpo` com o lock de ingestão tomado, ou devolve `null` se outra ingestão já está em
   * curso. Obrigatório em TODO modo que chame `ingestWindow`.
   *
   * O recurso protegido é a STAGING COMPARTILHADA: `monde_ingest_limpar_staging` dá TRUNCATE em
   * `monde.venda_staging`/`venda_item_staging` no início de toda janela, então duas ingestões
   * sobrepostas fazem uma apagar as linhas da outra em pleno vôo e as vendas lidas da API nunca
   * são promovidas — PERDA SILENCIOSA. A race é pré-existente (um ciclo que passe de 15 min já
   * se sobrepõe ao tick seguinte); a reconciliação diária a tornaria rotina.
   *
   * `p_dono` é token por EXECUÇÃO e `monde_ingest_release` compara antes de deletar, então um
   * ciclo não solta o lock de outro (achado ALTO do revisor-db). O release só é alcançado com o
   * claim ganho — o caminho do "pulado" retorna antes do `try`.
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
      // Falha no release não pode mascarar o erro do corpo: engolimos e logamos.
      try {
        const soltou = await rpc('monde_ingest_release', { p_dono: dono })
        if (soltou !== true) onLog(`aviso: release devolveu ${JSON.stringify(soltou)} — TTL expirou antes do fim?`)
      } catch (e) {
        onLog(`aviso: release do lock falhou — ${(e as Error).message}`)
      }
    }
  }

  try {
    // ── auditoria (SÓ LEITURA — sem lock, não toca staging) ────────────────────────────────
    // O detector: compara a API contra o espelho e diz exatamente quais vendas faltam. Teste de
    // aceitação da v5.4.4 e invariante permanente (zero ausentes no range coberto). A referência
    // é a API, NUNCA o upload — que vai ficar dormente e esfriar (decisão do Yan no briefing).
    if (mode === 'auditoria') {
      const from = sp.get('from'); const to = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'faltam from/to (YYYY-MM-DD)' }, { status: 400 })
      const janela = await listarJanelaDaApi({ from, to, onLog })
      const diff = await rpc('monde_vendas_ausentes', {
        p_numeros: janela.numeros, p_from: from, p_to: to,
      })
      return NextResponse.json({
        mode,
        api: { total: janela.total, paginas: janela.paginas, sem_sale_id: janela.sem_sale_id },
        diff,
        // ⚠️ `diff.ausentes` NÃO é a contagem do defeito: a listagem não diz quais vendas a
        // transformação excluiria por regra (Welcome / sem setor / sem item ativo — 29 das 775
        // de jul/2026), e essas aparecem aqui como "ausentes" sendo ausência CORRETA. Saber
        // isso exige o detalhe de cada venda, que só a reconciliação baixa — é ela que produz a
        // contagem exata, no `tripwire` de `monde_ingest_status`. Este modo responde "QUAIS
        // números faltam", para investigar; o tripwire responde "quantas faltam de verdade".
        nota: 'ausentes inclui vendas que a transformação excluiria por regra; a contagem exata do defeito está no tripwire (monde_ingest_status)',
        log,
      })
    }

    if (mode === 'window') {
      const from = sp.get('from'); const to = sp.get('to')
      if (!from || !to) return NextResponse.json({ error: 'faltam from/to (YYYY-MM-DD)' }, { status: 400 })
      const max = sp.get('max')
      const resultado = await comLock('window', () =>
        ingestWindow(db, { from, to, maxSales: max ? Number(max) : undefined, onLog }))
      if (resultado === null) return NextResponse.json({ mode, pulado: 'lock', log })
      return NextResponse.json({ mode, resultado, log })
    }

    if (mode === 'backfill') {
      const inicioYm = (sp.get('from') ?? '2023-01-01').slice(0, 7)
      const fimYm = hojeSP().slice(0, 7)
      const { data: cursor } = await db.rpc('monde_ingest_control_get', { p_chave: 'backfill_cursor' })
      const alvoYm = cursor ? proxMes(String(cursor)) : inicioYm
      if (alvoYm > fimYm) return NextResponse.json({ mode, done: true, cursor })
      const { from, to } = rangeDoMes(alvoYm)
      const resultado = await comLock('backfill', () => ingestWindow(db, { from, to, onLog }))
      if (resultado === null) return NextResponse.json({ mode, pulado: 'lock', log })
      await rpc('monde_ingest_control_set', { p_chave: 'backfill_cursor', p_valor: alvoYm })
      return NextResponse.json({ mode, mes: alvoYm, done: proxMes(alvoYm) > fimYm, resultado, log })
    }

    // ── reconciliacao (v5.4.4) ─────────────────────────────────────────────────────────────
    // UM mês por invocação, ciclando os 3 últimos meses pelo cursor. Um mês cabe folgado no
    // maxDuration=300 (jul/2026 tem ~775 vendas na API), e três disparos diários fecham a
    // janela. Resumível: se falhar, o cursor NÃO avança e a próxima invocação retoma o mesmo mês.
    if (mode === 'reconciliacao') {
      const hoje = hojeSP()
      const janela = mesesRecentes(hoje, MESES_RECONCILIACAO)
      const { data: cursorAtual } = await db.rpc('monde_ingest_control_get', { p_chave: 'reconciliacao_cursor' })
      const mes = proximoMesReconciliacao(cursorAtual ? String(cursorAtual) : null, janela)
      const { from, to } = rangeDoMes(mes)
      const fechaCiclo = mes === janela[janela.length - 1]
      onLog(`reconciliação: mês ${mes} (${from}..${to}); janela=${janela.join(',')}`)

      const saida = await comLock('reconciliacao', async () => {
        const resultado = await ingestWindow(db, { from, to, onLog })
        // Cursor avança só em caso de sucesso — falha retoma o MESMO mês.
        await rpc('monde_ingest_control_set', { p_chave: 'reconciliacao_cursor', p_valor: mes })
        await rpc('monde_ingest_control_set', {
          p_chave: 'ultima_reconciliacao', p_valor: new Date().toISOString(),
        })

        // ── CURA (v5.6.3): remove do espelho o que deixou de ser espelhável ────────────────
        // Venda reclassificada p/ Welcome/sem-setor (ou sumida da listagem) fica congelada
        // somando — a exclusão de escopo é aplicada na escrita e o upsert nunca mais a toca.
        // Guardas fail-closed em `podeCurar` (apuração íntegra) + TETO dentro da própria RPC
        // (0250). Não é caminho crítico: falha aqui não invalida a reconciliação — o tripwire
        // logo abaixo segue acusando o `sobrando` e a próxima rodada tenta de novo.
        let removidas = 0
        try {
          const cura = podeCurar({
            apiTotal: resultado.total_janela,
            lidas: resultado.lidas,
            espelhaveis: resultado.espelhaveis,
            espelhaveisIds: resultado.espelhaveis_ids.length,
            excluidas: resultado.excluidas,
            erros: resultado.erros,
          })
          if (!cura.ok) {
            onLog(`cura pulada (apuração não íntegra): ${cura.bloqueio}`)
          } else {
            const r = (await rpc('monde_ingest_remover_vendas', {
              p_espelhaveis_ids: resultado.espelhaveis_ids,
              p_from: from,
              p_to: to,
              p_teto: TETO_REMOCOES_RECONCILIACAO,
            })) as { removidas: number; bloqueado: boolean; candidatas: number; vendas: unknown }
            if (r.bloqueado) {
              onLog(`cura BLOQUEADA pelo teto: ${r.candidatas} candidatas > ${TETO_REMOCOES_RECONCILIACAO} — nada removido (listagem truncada?)`)
            } else if (r.removidas > 0) {
              removidas = r.removidas
              onLog(`cura: ${r.removidas} venda(s) retida(s) removida(s) do espelho — ${JSON.stringify(r.vendas)}`)
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

        // ── TRIPWIRE: subproduto exato desta reconciliação, sem chamada extra à API ────────
        // A reconciliação já baixou o detalhe de cada venda do mês, então ela sabe quantas eram
        // espelháveis e quantas excluiu, por motivo. É isso que torna a comparação exata —
        // contagem crua contra o `total` da API acenderia todo mês (a API conta o que a
        // transformação exclui por regra). Atualiza SÓ o mês reconciliado agora; os demais
        // ficam como estavam, e os nunca reconciliados como `nao_verificado`.
        // Não é caminho crítico: falha aqui não invalida a reconciliação.
        let tripwire: unknown = null
        try {
          const contagem = (await rpc('monde_vendas_ausentes', {
            p_numeros: [], p_from: from, p_to: to,
          })) as { espelho?: number } | null

          const apurado = avaliarMes({
            mes,
            apiTotal: resultado.total_janela,
            lidas: resultado.lidas,
            espelhaveis: resultado.espelhaveis,
            excluidas: resultado.excluidas,
            erros: resultado.erros,
            espelho: contagem?.espelho ?? 0, // contado APÓS a cura — sobrando reflete o estado curado
            removidas,
            verificadoEmISO: new Date().toISOString(),
          })

          const { data: anteriorRaw } = await db.rpc('monde_ingest_control_get', { p_chave: 'tripwire' })
          let anterior: Tripwire | null = null
          try {
            anterior = anteriorRaw ? (JSON.parse(String(anteriorRaw)) as Tripwire) : null
          } catch (e) {
            // NUNCA silencioso: cair aqui joga fora a apuração acumulada dos outros 11 meses do
            // painel (todos voltam a `nao_verificado`), e sem log ninguém saberia por quê. Um
            // silêncio dentro do mecanismo feito para acabar com silêncios seria a pior espécie.
            anterior = null
            onLog(`aviso: tripwire anterior corrompido — histórico do painel reiniciado — ${(e as Error).message}`)
          }

          const t = mesclarTripwire(anterior, apurado, mesesRecentes(hoje, MESES_TRIPWIRE), new Date().toISOString())
          await rpc('monde_ingest_control_set', { p_chave: 'tripwire', p_valor: JSON.stringify(t) })
          onLog(
            `tripwire ${mes}: api=${apurado.api} lidas=${apurado.lidas} espelhaveis=${apurado.espelhaveis} ` +
            `espelho=${apurado.espelho} sobrando=${apurado.sobrando} removidas=${apurado.removidas ?? 0} ` +
            `erros=${apurado.erros} conta_fecha=${apurado.conta_fecha} · geral ${t.acendeu ? `ACESO (${t.motivos.join('; ')})` : 'apagado'}`,
          )
          tripwire = t
        } catch (e) {
          onLog(`aviso: tripwire falhou (a reconciliação segue válida) — ${(e as Error).message}`)
        }
        return { resultado, tripwire }
      })

      if (saida === null) return NextResponse.json({ mode, mes, pulado: 'lock', log })
      return NextResponse.json({ mode, mes, janela, ciclo_fechado: fechaCiclo, ...saida, log })
    }

    // ── incremental (default) ──────────────────────────────────────────────────────────────
    const to = hojeSP()
    const from = addDiasISO(to, -DIAS_INCREMENTAL)
    const resultado = await comLock('incremental', () => ingestWindow(db, { from, to, onLog }))
    // Lock ocupado é NORMAL aqui (o tick de 15min caiu durante uma reconciliação, que cobre os
    // mesmos dias). Responde 200 e NÃO grava o marcador: pular não é sincronizar, e o marcador é
    // o que alimenta o alarme de atraso de /metas.
    if (resultado === null) return NextResponse.json({ mode: 'incremental', pulado: 'lock', log })
    await rpc('monde_ingest_control_set', { p_chave: 'ultimo_incremental', p_valor: `${from}..${to}` })
    return NextResponse.json({ mode: 'incremental', janela: { from, to }, resultado, log })
  } catch (e) {
    const msg = (e as Error).message
    console.error(`[monde-ingest] ERRO: ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
