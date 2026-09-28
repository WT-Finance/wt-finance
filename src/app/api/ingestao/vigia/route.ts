// Rota do VIGIA (v6.0.0/M6 — anexo `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md`
// §3/§4). Chamada pelo cron `ingestao-vigia` (`*/15`, migration 0280 — NASCE INATIVO; só ativa
// depois do deploy desta versão, `SELECT ingestao_vigia_definir(true)`, anexo §6). Registra a
// PRÓPRIA execução em `ingestao.execucao` (é o que alimenta "última verificação: há N minutos"
// na tela `/admin/ingestao`), lê `ingestao_vigia_estado()`, decide abrir/resolver incidentes de
// ESTADO (`processo_sem_resultado`/`carga_esperada_nao_chegou`) e reenvia qualquer notificação
// pendente — de QUALQUER tipo, inclusive um alarme de EVENTO cujo e-mail falhou em `carga.ts`.
//
// Auth: MESMO molde de `/api/monde/ingest`/`/api/cdi/ingest` (ADR-0153) — `CRON_SECRET` (o
// cron não tem sessão) OU sessão com a área `admin/uploads` (disparo manual/diagnóstico).
//
// ⚠️ Isenção do proxy: NENHUMA mudança em `src/proxy.ts` foi necessária. `/api/ingestao/` já
// está isento por PREFIXO desde a v6.0.0/M4 (`API_AUTH_PROPRIA_PREFIXOS`), e cobre esta rota
// sem ambiguidade: no App Router do Next, um segmento ESTÁTICO (`vigia/`) tem precedência sobre
// o segmento DINÂMICO irmão (`[base]/`) — `POST /api/ingestao/vigia` bate nesta rota, nunca em
// `[base]/route.ts` com `base = "vigia"`. Raciocínio de roteamento do framework, não medido ao
// vivo por este agente (editor puro, sem servidor) — sinalizado no relato desta missão.
//
// A rota em si é fina por desenho: toda a decisão mora em `@/lib/ingestao/vigia` (função pura
// `decidirAcaoExpectativa` + a orquestração `rodarVigia`), no mesmo espírito de
// `/api/monde/ingest`/`/api/cdi/ingest`, que só resolvem auth/log e delegam o corpo do trabalho.
export const runtime = 'nodejs'
// Carga de trabalho leve (poucas chamadas de RPC + no máximo um punhado de e-mails por rodada —
// bem diferente da varredura pesada do Monde/CDI). 60s segue o precedente de `/api/cdi/ingest`,
// a outra rota de cron leve do projeto.
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { abrirExecucao, concluirExecucao } from '@/lib/ingestao/execucao'
import { rodarVigia } from '@/lib/ingestao/vigia'

async function handle(req: NextRequest): Promise<Response> {
  // ── auth: cron secret OU sessão admin (mesmo molde de /api/monde/ingest e /api/cdi/ingest) ──
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!cronOk) {
    const guard = await requireAreaApi(['admin/uploads'])
    if (guard instanceof Response) return guard
  }

  const execId = await abrirExecucao('ingestao-vigia')
  try {
    const resultado = await rodarVigia()
    await concluirExecucao(
      execId,
      resultado.falha_leitura ? 'erro' : 'ok',
      resultado,
      resultado.falha_leitura ? 'ingestao_vigia_estado() indisponível ou em formato inesperado.' : null,
    )
    return NextResponse.json({ ok: !resultado.falha_leitura, resultado })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[ingestao/vigia] ERRO: ${msg}`)
    await concluirExecucao(execId, 'erro', null, msg)
    return NextResponse.json({ ok: false, erro: msg }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
