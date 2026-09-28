// Rota da LIMPEZA do cru (v6.0.0/M6b — errata 3(b); desenho em
// `docs/briefings/anexo-v6-0-0-m6b-retencao-do-cru.md`). Chamada pelo cron `ingestao-retencao`
// (diário, 07:30 UTC — migration 0282, NASCE INATIVO; só se ativa depois do deploy, M9).
//
// Auth: MESMO molde de `/api/ingestao/vigia` e das rotas de cron (ADR-0153) — `CRON_SECRET` (o cron
// não tem sessão) OU sessão com a área `admin/uploads` (diagnóstico manual). `?simular=1` percorre
// a regra inteira e NÃO apaga nada — é o primeiro passo de qualquer diagnóstico. **GET sempre
// simula**: apagar exige POST.
//
// Isenção do proxy: `/api/ingestao/` já é isento por PREFIXO desde a M4; o segmento estático
// `retencao/` tem precedência sobre o dinâmico `[base]/` no App Router (mesmo caso do vigia).
//
// A rota é fina por desenho: a regra (pura) e as travas moram em `@/lib/ingestao/retencao`.
export const runtime = 'nodejs'
// Inventário + remoção em lotes de 100 + registro; o volume esperado é de dezenas de objetos por
// dia, mas o primeiro dia depois de 3 meses concentra a expiração de um trimestre.
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { requireAreaApi } from '@/lib/auth/sessao'
import { rodarRetencao } from '@/lib/ingestao/retencao'

async function handle(req: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const cronOk = !!secret && req.headers.get('authorization') === `Bearer ${secret}`
  if (!cronOk) {
    const guard = await requireAreaApi(['admin/uploads'])
    if (guard instanceof Response) return guard
  }

  // Apagar de verdade SÓ por POST (achado ALTO do revisor): GET com sessão é alcançável por
  // navegação de topo (CSRF sob SameSite=Lax) e por robôs de pré-visualização de link — a mesma
  // classe do incidente do magic link (skill contrato-rpc-front §6), aqui com dano irreversível.
  // O cron chama por POST (`net.http_post`, 0282); GET fica só para diagnóstico e SEMPRE simula.
  const simular = req.method !== 'POST' || req.nextUrl.searchParams.get('simular') === '1'
  const r = await rodarRetencao({ simular })
  // `recusado` não é falha do servidor: uma trava funcionou. 200 com ok:false deixa isso claro
  // para quem lê o corpo; `erro` é 500 para o `net.http_post` do cron não parecer verde.
  const status = r.status === 'erro' ? 500 : 200
  return NextResponse.json({ ok: r.status === 'ok' || r.status === 'simulado', ...r }, { status })
}

export const GET = handle
export const POST = handle
