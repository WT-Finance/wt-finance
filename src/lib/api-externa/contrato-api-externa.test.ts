import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

// Réplica local de hashSegredo (src/lib/api-externa/segredo.ts): aquele módulo é
// `server-only` (o Vitest não resolve o pacote injetado pelo Next) — e o hash aqui
// é fixture de teste, não lógica sob teste. sha256 hex, idêntico ao runtime.
const hashSegredo = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

// v5.4.0/M3b — CONTRATO das RPCs de runtime da API externa de Solicitações
// (criar_solicitacao_externa / cancelar_solicitacao_externa / solic_tipos_api,
// migration 0952) + PARIDADE de validação com a UI (a mesma
// app.solic_validar_e_snapshotar valida as duas portas — mudar uma regra muda as
// duas de uma vez) + preservação de CHAVE ESTÁVEL de campo na edição de tipo
// (admin_solic_salvar_tipo, migration 0950).
//
// Casos via RPC REST (service key — padrão rpc-contrato.test.ts); fixtures
// (roles/tipo/campos/chave de teste) montadas e limpas via `pg` direto
// (SUPABASE_DB_URL — padrão virada-paridade.test.ts), pois não há RPC de escrita
// alcançável sem sessão para essas tabelas de configuração. Skip TOTAL offline
// (sem env) OU se a migration 0952 ainda não tiver sido aplicada no remoto —
// sondado via pg_proc (uma chamada REST com corpo vazio daria 404 tanto para
// "função não existe" quanto para "função existe mas não bate overload", o que
// seria um falso-negativo; consultar o catálogo é inequívoco).

const RAW  = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const HOST = RAW.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
const DB   = process.env.SUPABASE_DB_URL
const ON   = Boolean(HOST && KEY && DB)

const require = createRequire(process.cwd() + '/')

async function sondarRpcPronta(): Promise<boolean> {
  if (!ON) return false
  const pg = require('pg')
  const c = new pg.Client({ connectionString: DB })
  try {
    await c.connect()
    const r = await c.query(`SELECT 1 FROM pg_proc WHERE proname = 'criar_solicitacao_externa'`)
    return (r.rowCount ?? 0) > 0
  } catch {
    return false
  } finally {
    await c.end().catch(() => {})
  }
}

// Top-level await: suportado pelo vite-node do Vitest (módulos ESM) — necessário
// para que `describe.skipIf` já saiba, de forma SÍNCRONA, se a migration 0952
// (aplicada em paralelo por outra missão) já está no remoto.
const RPC_PRONTA = await sondarRpcPronta()

interface RespostaRpc { ok: boolean; status: number; data: unknown; erro: string | null }

async function chamarRpc(fn: string, body: Record<string, unknown>): Promise<RespostaRpc> {
  const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY as string, Authorization: `Bearer ${KEY as string}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const texto = await res.text()
  let corpo: unknown = null
  try { corpo = texto ? JSON.parse(texto) : null } catch { corpo = texto }
  if (res.ok) return { ok: true, status: res.status, data: corpo, erro: null }
  const msg = (corpo && typeof corpo === 'object' && 'message' in (corpo as Record<string, unknown>))
    ? String((corpo as Record<string, unknown>).message)
    : String(corpo)
  return { ok: false, status: res.status, data: null, erro: msg }
}

/** PREFIXO (antes do ':') de uma mensagem `PREFIXO: detalhe` — ou a mensagem inteira, se não houver ':'. */
function prefixo(erro: string | null): string {
  const m = erro ?? ''
  const idx = m.indexOf(':')
  return (idx === -1 ? m : m.slice(0, idx)).trim()
}

describe.skipIf(!ON || !RPC_PRONTA)('contrato — API externa de Solicitações (v5.4.0/M3b, migration 0952)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any
  let roleId = 0
  let roleForaId = 0
  let tipoId = 0
  let tipoForaWhitelistId = 0
  let chaveId = 0
  let solicitacaoId = 0

  const SEGREDO_TESTE = 'jns_zzteste_v540_contrato_api_externa'
  const IDEM_FELIZ = 'zz-v540-idem-feliz'

  const corpoFeliz = {
    p_tipo_slug:          'zz_teste_api_v540',
    p_destinatario:       'ZZ_TESTE_API_V540',
    p_titulo:             'Teste E2E v5.4.0',
    p_campos:             { assunto: 'Assunto de teste', valor: '1500.50', data_evento: '2027-06-15', categoria: 'a' },
    p_data_limite:        '2027-01-01',
    p_chave_idempotencia: IDEM_FELIZ,
    p_referencia_origem:  null as string | null,
  }

  beforeAll(async () => {
    const pg = require('pg')
    client = new pg.Client({ connectionString: DB })
    await client.connect()

    const r1 = await client.query(`INSERT INTO app.rbac_roles (nome) VALUES ('ZZ_TESTE_API_V540') RETURNING id::int AS id`)
    roleId = r1.rows[0].id
    const r2 = await client.query(`INSERT INTO app.rbac_roles (nome) VALUES ('ZZ_TESTE_API_V540_FORA') RETURNING id::int AS id`)
    roleForaId = r2.rows[0].id

    const t1 = await client.query(
      `INSERT INTO app.solicitacao_tipo (nome, slug, exposto_via_api, exige_referencia_conclusao, api_roles_permitidas)
       VALUES ('ZZ Teste API v5.4.0', 'zz_teste_api_v540', true, false, ARRAY[$1]::bigint[])
       RETURNING id::int AS id`, [roleId])
    tipoId = t1.rows[0].id

    await client.query(
      `INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, chave)
       VALUES ($1, 1, 'Assunto', 'texto_curto', true, 'assunto')`, [tipoId])
    await client.query(
      `INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, chave)
       VALUES ($1, 2, 'Valor', 'moeda', true, 'valor')`, [tipoId])
    await client.query(
      `INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, data_permite_passado, chave)
       VALUES ($1, 3, 'Data do Evento', 'data', true, false, 'data_evento')`, [tipoId])
    await client.query(
      `INSERT INTO app.solicitacao_campo (tipo_id, ordem, rotulo, tipo_campo, obrigatorio, opcoes, chave)
       VALUES ($1, 4, 'Categoria', 'selecao', true, '["a","b"]'::jsonb, 'categoria')`, [tipoId])

    // 2º tipo, EXPOSTO mas fora da whitelist da chave de teste (p/ TIPO_NAO_AUTORIZADO).
    const t2 = await client.query(
      `INSERT INTO app.solicitacao_tipo (nome, slug, exposto_via_api, api_roles_permitidas)
       VALUES ('ZZ Teste API v5.4.0 (fora da whitelist)', 'zz_teste_api_v540_fora', true, ARRAY[$1]::bigint[])
       RETURNING id::int AS id`, [roleId])
    tipoForaWhitelistId = t2.rows[0].id

    // Robô: reaproveita um user_id JÁ cadastrado (nunca INSERT em auth.users via pg).
    const u = await client.query(`SELECT user_id FROM app.rbac_usuarios LIMIT 1`)
    const roboUserId = u.rows[0].user_id as string

    const c = await client.query(
      `INSERT INTO app.api_chave (plataforma, segredo_hash, whitelist_tipos, robo_user_id)
       VALUES ('ZZ_TESTE_API_V540', $1, ARRAY[$2]::bigint[], $3)
       RETURNING id::int AS id`, [hashSegredo(SEGREDO_TESTE), tipoId, roboUserId])
    chaveId = c.rows[0].id
  })

  afterAll(async () => {
    if (!client) return
    await client.query(`DELETE FROM app.solicitacao WHERE origem_chave_id = $1`, [chaveId]).catch(() => {})
    await client.query(`DELETE FROM app.api_chamada_log WHERE chave_id = $1`, [chaveId]).catch(() => {})
    await client.query(`DELETE FROM app.api_chave WHERE id = $1`, [chaveId]).catch(() => {})
    await client.query(`DELETE FROM app.solicitacao_campo WHERE tipo_id = $1`, [tipoId]).catch(() => {})
    await client.query(`DELETE FROM app.solicitacao_tipo WHERE id = $1 AND slug LIKE 'zz_teste_api_v540%'`, [tipoId]).catch(() => {})
    await client.query(`DELETE FROM app.solicitacao_campo WHERE tipo_id = $1`, [tipoForaWhitelistId]).catch(() => {})
    await client.query(`DELETE FROM app.solicitacao_tipo WHERE id = $1 AND slug LIKE 'zz_teste_api_v540%'`, [tipoForaWhitelistId]).catch(() => {})
    await client.query(`DELETE FROM app.rbac_roles WHERE id = $1`, [roleId]).catch(() => {})
    await client.query(`DELETE FROM app.rbac_roles WHERE id = $1`, [roleForaId]).catch(() => {})
    await client.end().catch(() => {})
  })

  // ── (1) criação feliz ────────────────────────────────────────────────────────
  it('criar_solicitacao_externa: criação feliz devolve ok/id/status/destinatario', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', { p_chave_id: chaveId, ...corpoFeliz })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { ok: true; id: number; status: string; destinatario: { id: number; nome: string }; idempotente: boolean }
    expect(typeof d.id).toBe('number')
    expect(d.status).toBe('aberta')
    expect(d.destinatario).toEqual({ id: roleId, nome: 'ZZ_TESTE_API_V540' })
    expect(d.idempotente).toBe(false)
    solicitacaoId = d.id
  })

  // ── (2) paridade de validação (mesma app.solic_validar_e_snapshotar da UI) ────
  it('campo obrigatório ausente → CAMPO_OBRIGATORIO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { valor: '10', data_evento: '2027-01-01', categoria: 'a' }, // sem 'assunto'
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-campo-obrigatorio', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('CAMPO_OBRIGATORIO')
  })

  it('moeda inválida → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: 'abc', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-valor-moeda', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  it('data no passado em campo sem passado (regra v4.19) → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2020-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-data-passado', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  it('opção de seleção fora da lista → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'zzz' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-selecao', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  it('destinatário (role) fora de api_roles_permitidas do tipo → DESTINATARIO_NAO_PERMITIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540_FORA',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-dest-nao-permitido', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('DESTINATARIO_NAO_PERMITIDO')
  })

  it('destinatário (role) inexistente → DESTINATARIO_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_ROLE_INEXISTENTE_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-dest-invalido', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('DESTINATARIO_INVALIDO')
  })

  it('chave de campo desconhecida (fora da definição do tipo) → CAMPO_DESCONHECIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null,
      p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a', campo_fantasma: 'x' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-campo-desconhecido', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('CAMPO_DESCONHECIDO')
  })

  it('tipo fora da whitelist da chave → TIPO_NAO_AUTORIZADO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540_fora', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: {}, p_data_limite: '2027-01-01',
      p_chave_idempotencia: 'zz-v540-tipo-nao-autorizado', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('TIPO_NAO_AUTORIZADO')
  })

  it('sem data_limite → DATA_LIMITE_OBRIGATORIA', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: null, p_chave_idempotencia: 'zz-v540-sem-data-limite', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('DATA_LIMITE_OBRIGATORIA')
  })

  // ── (3) idempotência ───────────────────────────────────────────────────────
  it('repetir a criação feliz com a MESMA chave_idempotencia devolve o MESMO id (idempotente:true), sem duplicar', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', { p_chave_id: chaveId, ...corpoFeliz })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; status: string; idempotente: boolean }
    expect(d.id).toBe(solicitacaoId)
    expect(d.idempotente).toBe(true)
    expect(d.status).toBe('aberta') // ainda não cancelada nesta altura do teste

    const cnt = await client.query(`SELECT count(*)::int n FROM app.solicitacao WHERE origem_chave_id = $1`, [chaveId])
    expect(cnt.rows[0].n).toBe(1)
  })

  // ── (4) cancelamento ─────────────────────────────────────────────────────────
  it('cancelar_solicitacao_externa: cancela a solicitação criada por esta chave', async () => {
    const r = await chamarRpc('cancelar_solicitacao_externa', { p_chave_id: chaveId, p_solicitacao_id: solicitacaoId })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; status: string }
    expect(d.id).toBe(solicitacaoId)
    expect(d.status).toBe('cancelada')
  })

  it('cancelar de novo (já cancelada) → CONFLITO_ESTADO', async () => {
    const r = await chamarRpc('cancelar_solicitacao_externa', { p_chave_id: chaveId, p_solicitacao_id: solicitacaoId })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('CONFLITO_ESTADO')
  })

  it('cancelar id inexistente (para esta chave) → NAO_ENCONTRADA', async () => {
    const r = await chamarRpc('cancelar_solicitacao_externa', { p_chave_id: chaveId, p_solicitacao_id: 999999999 })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('NAO_ENCONTRADA')
  })

  // ── (5) descoberta de tipos ────────────────────────────────────────────────────
  it('solic_tipos_api: devolve o tipo com slug/campos/chaves/destinos, sem campo anexo, só o whitelisted', async () => {
    const r = await chamarRpc('solic_tipos_api', { p_chave_id: chaveId })
    expect(r.ok, r.erro ?? '').toBe(true)
    const tipos = r.data as Array<{
      slug: string; nome: string; exige_referencia_conclusao: boolean
      destinos: Array<{ id: number; nome: string }>
      campos: Array<{ chave: string; rotulo: string; tipo_campo: string; obrigatorio: boolean; opcoes: string[] | null; data_permite_passado: boolean | null }>
    }>
    expect(Array.isArray(tipos)).toBe(true)

    const alvo = tipos.find(t => t.slug === 'zz_teste_api_v540')
    expect(alvo).toBeTruthy()
    expect(alvo!.destinos.some(d => d.nome === 'ZZ_TESTE_API_V540')).toBe(true)
    expect(alvo!.campos.map(c => c.chave).sort()).toEqual(['assunto', 'categoria', 'data_evento', 'valor'])
    expect(alvo!.campos.some(c => c.tipo_campo === 'anexo')).toBe(false)

    // o 2º tipo (exposto, mas FORA da whitelist desta chave) não deve aparecer.
    expect(tipos.some(t => t.slug === 'zz_teste_api_v540_fora')).toBe(false)
  })

  // ── (6) editar tipo preserva chaves (contrato de API sobrevive ao apaga-e-recria) ─
  it('admin_solic_salvar_tipo (edição): preserva as chaves reenviadas e gera uma nova só para o campo novo', async () => {
    const camposPayload = [
      { chave: 'assunto',     rotulo: 'Assunto',       tipo_campo: 'texto_curto', obrigatorio: true },
      { chave: 'valor',       rotulo: 'Valor',          tipo_campo: 'moeda',       obrigatorio: true },
      { chave: 'data_evento', rotulo: 'Data do Evento', tipo_campo: 'data',        obrigatorio: true, data_permite_passado: false },
      { chave: 'categoria',   rotulo: 'Categoria',      tipo_campo: 'selecao',     obrigatorio: true, opcoes: ['a', 'b'] },
      { rotulo: 'Observação Nova', tipo_campo: 'texto_curto', obrigatorio: false }, // sem chave → gerada
    ]
    const rEdit = await client.query(
      `SELECT public.admin_solic_salvar_tipo($1, $2, $3::jsonb, $4::jsonb) AS r`,
      [
        tipoId, 'ZZ Teste API v5.4.0', JSON.stringify(camposPayload),
        JSON.stringify({ exposto_via_api: true, api_roles_permitidas: [roleId] }),
      ],
    )
    expect(rEdit.rows[0].r.ok).toBe(true)

    const depois = await client.query(`SELECT chave, rotulo FROM app.solicitacao_campo WHERE tipo_id = $1 ORDER BY ordem`, [tipoId])
    const porRotulo: Record<string, string> = {}
    for (const row of depois.rows as Array<{ chave: string; rotulo: string }>) porRotulo[row.rotulo] = row.chave

    expect(porRotulo['Assunto']).toBe('assunto')
    expect(porRotulo['Valor']).toBe('valor')
    expect(porRotulo['Data do Evento']).toBe('data_evento')
    expect(porRotulo['Categoria']).toBe('categoria')
    expect(porRotulo['Observação Nova']).toBeTruthy()
    expect(porRotulo['Observação Nova']).not.toBe('')
  })
})

// Sempre roda (mesmo offline) — deixa visível, no relatório do `npm test`, que a
// suíte acima depende de env (.env.local) + da migration 0952 já aplicada no remoto.
describe('gate — API externa de Solicitações: suíte de contrato é pulada, não falha, sem env/migration', () => {
  it('sem SUPABASE_URL/SERVICE_ROLE_KEY/SUPABASE_DB_URL ou sem a migration 0952: skipIf, não erro', () => {
    expect(true).toBe(true)
  })
})
