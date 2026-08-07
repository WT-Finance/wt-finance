// API Route de ingestão da série do CDI (v5.5.0/M2). runtime nodejs, server-only.
// Busca a série SGS do BACEN e grava em `analytics.dim_taxa_cdi` via a RPC
// service-role `cdi_ingest_upsert` (migration 0239). A conversão pura vive em
// `@/lib/cdi/serie-sgs` — aqui fica só a borda (auth, fetch, RPC, resposta).
//
// Auth (duas portas, mesmo molde de /api/monde/ingest — ADR-0153):
//   • pg_cron → header `Authorization: Bearer $CRON_SECRET`. Sem sessão/cookies.
//   • Disparo manual → sessão com área `admin/uploads`.
// ⚠️ A rota precisa estar em `API_AUTH_PROPRIA` no `src/proxy.ts`, senão o proxy
//    exige sessão e o cron nunca autentica — a rota do Monde nasceu com esse bug e
//    ficou assim até a v5.1.7. Há guard mecânico em `route.test.ts`.
//
// ── POR QUE NÃO EXISTE "MODO BACKFILL" ────────────────────────────────────────
// A janela é SEMPRE a série inteira, de ago/2024 até hoje — ~24 linhas, uma
// requisição. Com isso a carga inicial e o tique mensal são literalmente a mesma
// chamada, que é o que o briefing pede ("backfill = a própria ingestão", fonte
// única). De carona a rotina fica AUTO-CURATIVA: um mês que tenha falhado é
// preenchido no tique seguinte, sem ninguém precisar perceber. Um modo separado só
// existiria para poupar tráfego que não é problema nesta escala.
//
// ── FALHA É ALTA, MAS NÃO DERRUBA NADA ────────────────────────────────────────
// Se o BACEN não responder ou mudar o formato, a rota devolve 502 e loga. Ela NÃO
// devolve 200 silencioso: "200 sem conteúdo" é o modo de falha que já enganou este
// projeto (v5.1.11) — falha silenciosa parece saúde. Ao mesmo tempo o indicador
// segue de pé, porque a `dim_taxa_cdi` preserva as taxas anteriores e a premissa da
// versão já é "mês corrente e futuros usam a última taxa fechada conhecida".
// O sinal operacional de que algo parou é `atualizado_em` estagnado.
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { getAdminClient } from '@/lib/supabase/admin'
import {
  converterSerieSgs,
  apenasMesesFechados,
  urlSerieSgs,
  SERIE_SGS_CDI_MENSAL,
} from '@/lib/cdi/serie-sgs'

/** Assinatura frouxa de `rpc` para função fora do `database.ts` congelado. */
type RpcFrouxa = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>

async function handle(req: NextRequest): Promise<Response> {
  // ── auth: cron secret OU sessão admin ──
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!cronOk) {
    const guard = await requireAreaApi(['admin/uploads'])
    if (guard instanceof Response) return guard
  }

  const url = urlSerieSgs(new Date())

  try {
    const resp = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })
    if (!resp.ok) {
      throw new Error(`SGS respondeu ${resp.status} ${resp.statusText}`)
    }

    // O SGS publica o mês CORRENTE parcial (acumulado até hoje). Gravá-lo faria o
    // carry-forward projetar essa fração sobre todo o futuro — ver
    // `apenasMesesFechados`. Só entram meses fechados.
    const taxas = apenasMesesFechados(converterSerieSgs(await resp.json()), new Date())
    if (taxas.length === 0) {
      throw new Error('SGS não devolveu nenhum mês FECHADO')
    }

    const admin = getAdminClient()
    // `cdi_ingest_upsert` é RPC nova e o `database.ts` é congelado ⇒ tipagem frouxa,
    // no molde de `lib/api-externa/rpc.ts`. O `.bind(admin)` NÃO é decoração:
    // `SupabaseClient.rpc` é método de protótipo que faz `this.rest.rpc(...)`, então
    // destacá-lo numa variável perde o `this` e estoura em runtime — foi a causa-raiz
    // da v5.3.5, e o erro só aparece na chamada, nunca em tsc/lint/build.
    const chamarRpc = (admin.rpc as unknown as RpcFrouxa).bind(admin)
    const { data, error } = await chamarRpc('cdi_ingest_upsert', { p_taxas: taxas })
    if (error) {
      throw new Error(`RPC cdi_ingest_upsert falhou: ${JSON.stringify(error)}`)
    }

    return NextResponse.json({ ok: true, serie: SERIE_SGS_CDI_MENSAL, resumo: data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[cdi-ingest] ERRO: ${msg}`)
    // 502 e não 200: a falha precisa ser VISÍVEL para quem opera. O indicador
    // continua funcionando com as taxas já gravadas — degradação, não queda.
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
