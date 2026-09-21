import { describe, it, expect } from 'vitest'
import { tokenMaquina, credencialConfigurada } from '@/lib/auth/credencial-maquina'

// ── GATE 2 (parte 2, v6.0.0/M2): a credencial que INGERE não lê nem trunca ───────────────
// A role `ingestor` (0274) só tem EXECUTE no pipeline staging → promoção (allowlist derivada
// de `rpcs-ingestor.ts`). Aqui a barreira é VISTA negando — não basta o catálogo dizer:
//   (1) leitura de negócio (`get_dre_mensal`) ⇒ 4xx;
//   (2) `truncar_*` de base viva ⇒ sem privilégio no catálogo E 4xx via REST (pré-cheque no
//       catálogo ANTES da chamada: se a role tivesse EXECUTE, chamar seria o incidente);
//   (3) o que ela PODE: `validar_carga_staging` (só lê a staging) ⇒ 200.
// A terceira alavanca (chave `x-api-key` revogada ⇒ 401) se prova na rota `/api/ingestao`
// (M4), não aqui — esta credencial é o JWT, não a chave.
//
// Só `pg` READ ONLY (catálogo) + REST. Declarado em `sonda-teste-escreve-banco` (SOMENTE_LEITURA)
// e em `sonda-skipif-silencioso` (envs).

const RAW = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const HOST = RAW.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
// Credencial = login do usuário de máquina (`SUPABASE_INGESTOR_SENHA` + anon key + SUPABASE_URL);
// o hook da 0275 põe `role=ingestor` no token.
const APIKEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const DB_URL = process.env.SUPABASE_DB_URL
const ON = credencialConfigurada('ingestor') && Boolean(DB_URL)

async function statusIngestor(fn: string, body: Record<string, unknown>): Promise<{ status: number; texto: string }> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: APIKEY as string, Authorization: `Bearer ${await tokenMaquina('ingestor')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, texto: await res.text() }
}

async function temExecute(assinatura: string): Promise<boolean | null> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c = new pg.Client({ connectionString: DB_URL })
  await c.connect()
  await c.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
  try {
    const r = await c.query(
      `SELECT CASE WHEN to_regprocedure($1) IS NULL THEN NULL ELSE has_function_privilege('ingestor', $1, 'EXECUTE') END AS tem`,
      [assinatura],
    ) as { rows: Array<{ tem: boolean | null }> }
    return r.rows[0]?.tem ?? null
  } finally { await c.end() }
}

describe.skipIf(!ON)('GATE 2 — a credencial de ingestão NÃO lê nem trunca (v6.0.0/M2)', () => {
  it('leitura de negócio: get_dre_mensal sem EXECUTE no catálogo e negada via REST', async () => {
    expect(await temExecute('public.get_dre_mensal(integer)')).toBe(false)
    const { status, texto } = await statusIngestor('get_dre_mensal', { p_ano: 2026 })
    expect(status, `esperado 4xx, veio ${status}: ${texto}`).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it.each([
    'public.truncar_lancamentos()',
    'public.truncar_lancamentos_movimentacao()',
    'public.truncar_titulos_em_aberto()',
    'public.truncar_demonstrativo_competencia()',
    'public.truncate_dynamic_tables()',
    'public.promover_carga_pessoas()',
  ])('%s: sem EXECUTE no catálogo E negada via REST', async (assinatura) => {
    const tem = await temExecute(assinatura)
    expect(tem, `${assinatura}: função inexistente (assinatura mudou?)`).not.toBeNull()
    expect(tem, `${assinatura}: a role ingestor TEM EXECUTE — allowlist vazou`).toBe(false)
    const nome = assinatura.replace(/^public\./, '').replace(/\(.*$/, '')
    const { status, texto } = await statusIngestor(nome, {})
    expect(status, `${nome}: esperado 4xx, veio ${status}: ${texto}`).toBeGreaterThanOrEqual(400)
    expect(status).toBeLessThan(500)
  })

  it('o que ela PODE: o pipeline de Vendas tem EXECUTE no catálogo', async () => {
    for (const a of ['public.limpar_staging_vendas()', 'public.inserir_lote_staging(jsonb)', 'public.validar_carga_staging()', 'public.promover_carga_vendas()']) {
      expect(await temExecute(a), `${a} deveria estar na allowlist do ingestor`).toBe(true)
    }
  })

  it('validar_carga_staging (só lê a staging) executa via REST com a credencial de ingestão', async () => {
    const { status, texto } = await statusIngestor('validar_carga_staging', {})
    expect(status, texto).toBe(200)
    const d = JSON.parse(texto) as { ok?: boolean }
    expect(typeof d.ok).toBe('boolean')
  })
})
