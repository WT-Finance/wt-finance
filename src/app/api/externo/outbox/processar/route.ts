// API Route do processador da outbox de callbacks (v5.4.0/M4, ADR-0161).
//
// Chamada pelo pg_cron a cada 5 minutos (migration 0213, `net.http_post`),
// autenticada por `Authorization: Bearer $CRON_SECRET` — MESMO molde de
// src/app/api/monde/ingest/route.ts, mas SEM a 2ª porta de sessão daquela rota:
// esta é um serviço interno puro (nenhum humano aciona pelo navegador), então a
// ausência do CRON_SECRET é só 401, sem fallback de área.
//
// runtime nodejs, server-only. NUNCA lança: `processarOutboxUmaVez` absorve
// toda falha de RPC/rede/callback — o pior resultado é `{processados:0,...}`
// (os itens continuam 'pendente' e o próximo tick tenta de novo).
export const runtime = 'nodejs'
export const maxDuration = 60

import { NextRequest, NextResponse } from 'next/server'
import { processarOutboxUmaVez } from '@/lib/api-externa/outbox'

async function handle(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const autorizado = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!autorizado) {
    return NextResponse.json({ ok: false, erro: 'não autorizado' }, { status: 401 })
  }

  const resultado = await processarOutboxUmaVez(20, 10_000)
  return NextResponse.json({ ok: true, ...resultado })
}

export const GET = handle
export const POST = handle
