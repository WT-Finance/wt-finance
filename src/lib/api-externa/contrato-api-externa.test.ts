import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'

// Réplica local de hashSegredo (src/lib/api-externa/segredo.ts): aquele módulo é
// `server-only` (o Vitest não resolve o pacote injetado pelo Next) — e o hash aqui
// é fixture de teste, não lógica sob teste. sha256 hex, idêntico ao runtime.
const hashSegredo = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex')

// v5.4.0/M3b+M4 (+ Round2, migration 0215) — CONTRATO das RPCs de runtime da API
// externa de Solicitações (criar_solicitacao_externa / cancelar_solicitacao_externa
// / solic_tipos_api, migration 0212) + PARIDADE de validação com a UI (a mesma
// app.solic_validar_e_snapshotar valida as duas portas — mudar uma regra muda as
// duas de uma vez) + preservação de CHAVE ESTÁVEL de campo na edição de tipo
// (admin_solic_salvar_tipo, migration 0210) + outbox de callbacks at-least-once
// (api_outbox_enfileirar/reivindicar/resultado, migration 0213/ADR-0161).
//
// Round2 (2026-07-28, decisão de produto do Yan): o conceito "conclusão exige
// referência externa" foi EXTIRPADO (migration 0215) — solic_concluir voltou à
// assinatura de 1 parâmetro e o payload do callback `solicitacao.concluida` NÃO
// carrega mais a chave `referencia`. Os casos que testavam REFERENCIA_OBRIGATORIA/
// payload.referencia foram REMOVIDOS; o caso de outbox de conclusão permanece,
// adaptado à assinatura nova (ver "solic_concluir (pós-0215)" abaixo).
//
// Round3 (2026-07-29, decisão de produto do Yan): a lista branca de equipes POR TIPO
// (`api_roles_permitidas`) foi REVOGADA (migration 0216) — o fluxo humano nunca
// restringiu destino por tipo. `destinatario` segue OBRIGATÓRIO e validado (equipe tem
// que existir), mas QUALQUER equipe é destino válido; o caso que esperava
// DESTINATARIO_NAO_PERMITIDO virou o inverso (destino livre ACEITO).
//
// Round4 (2026-07-30, decisão de produto do Yan, migration 0217): `criar_solicitacao_
// externa` ganha um 9º parâmetro OBRIGATÓRIO, `p_solicitante_email` — precisa ser o
// e-mail de um usuário JÁ cadastrado e ATIVO na plataforma, que vira o SOLICITANTE de
// verdade (solicitante_id), não mais o robô da chave. Todas as chamadas existentes
// abaixo passam a informar `p_solicitante_email` (reusa o e-mail do mesmo usuário ativo
// já usado para `roboUserId`); 2 casos novos cobrem ausência/e-mail sem cadastro ativo
// (SOLICITANTE_OBRIGATORIO/SOLICITANTE_INVALIDO), 1 confere o eco de `solicitante` no
// ack + o `solicitante_id` gravado, 1 PROVA que esse uid vem do e-mail e não do robô
// (usando um SEGUNDO usuário ativo — com o mesmo uid nas duas pontas a asserção seria
// tautológica) e 1 cobre e-mail com caixa/espaços divergentes.
//
// Casos via RPC REST (service key — padrão rpc-contrato.test.ts); fixtures
// (roles/tipo/campos/chave de teste) montadas e limpas via `pg` direto
// (SUPABASE_DB_URL — padrão virada-paridade.test.ts), pois não há RPC de escrita
// alcançável sem sessão para essas tabelas de configuração. Skip TOTAL offline
// (sem env) OU se as migrations 0212/0213/0215 ainda não tiverem sido aplicadas no
// remoto — sondado via pg_proc (uma chamada REST com corpo vazio daria 404 tanto
// para "função não existe" quanto para "função existe mas não bate overload", o
// que seria um falso-negativo; consultar o catálogo é inequívoco).

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
    // Exige 0212 (criar_solicitacao_externa) E 0213 (api_outbox_reivindicar) E
    // 0215 (solic_concluir com 1 ÚNICO parâmetro — pronargs=1 só é verdade
    // depois que a 0215 dropou a versão de 2 parâmetros da 0213) E 0217
    // (criar_solicitacao_externa com 9 parâmetros — pronargs=9 só é verdade
    // depois que a 0217 dropou a versão de 8 parâmetros da 0216) — este
    // arquivo tem casos das QUATRO migrations; um remoto onde a 0217 ainda não
    // tenha rodado deve SKIPAR o arquivo todo, não falhar por assinatura
    // divergente (a chamada com p_solicitante_email cairia num overload
    // inexistente, PGRST202).
    const r = await c.query(
      `SELECT
         (SELECT count(*)::int FROM pg_proc WHERE proname IN ('criar_solicitacao_externa', 'api_outbox_reivindicar')) AS base,
         (SELECT count(*)::int FROM pg_proc WHERE proname = 'solic_concluir' AND pronargs = 1) AS pos215,
         (SELECT count(*)::int FROM pg_proc WHERE proname = 'criar_solicitacao_externa' AND pronargs = 9) AS pos217`,
    )
    return (r.rows[0]?.base ?? 0) >= 2 && (r.rows[0]?.pos215 ?? 0) >= 1 && (r.rows[0]?.pos217 ?? 0) >= 1
  } catch {
    return false
  } finally {
    await c.end().catch(() => {})
  }
}

// Top-level await: suportado pelo vite-node do Vitest (módulos ESM) — necessário
// para que `describe.skipIf` já saiba, de forma SÍNCRONA, se as migrations
// 0212/0213/0215 (aplicadas em paralelo por outras missões) já estão no remoto.
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

describe.skipIf(!ON || !RPC_PRONTA)('contrato — API externa de Solicitações (v5.4.0/M3b+M4 + Round2/Round4, migrations 0212/0213/0215/0217)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any
  let roleId = 0
  let roleForaId = 0
  let tipoId = 0
  let tipoForaWhitelistId = 0
  let chaveId = 0
  let solicitacaoId = 0
  let solicitacaoConcluirId = 0 // fixture do teste de solic_concluir (pós-0215) abaixo
  let outboxClaimTestId = 0     // item cru inserido p/ testar api_outbox_reivindicar/resultado
  let roboUserId = ''           // uid do robô (solicitante das solicitações externas) — reusado p/ simular JWT
  let solicitanteEmail = ''     // e-mail do MESMO usuário ativo acima — vira p_solicitante_email (0217/Round4)
  let outroSolicitanteId = ''    // 2º usuário ativo, DIFERENTE do robô…
  let outroSolicitanteEmail = '' // …usado só para PROVAR que solicitante_id vem do e-mail, não do robô

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
      `INSERT INTO app.solicitacao_tipo (nome, slug, exposto_via_api)
       VALUES ('ZZ Teste API v5.4.0', 'zz_teste_api_v540', true)
       RETURNING id::int AS id`)
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
      `INSERT INTO app.solicitacao_tipo (nome, slug, exposto_via_api)
       VALUES ('ZZ Teste API v5.4.0 (fora da whitelist)', 'zz_teste_api_v540_fora', true)
       RETURNING id::int AS id`)
    tipoForaWhitelistId = t2.rows[0].id

    // Robô: reaproveita um user_id JÁ cadastrado ATIVO (nunca INSERT em auth.users via
    // pg). ATIVO é exigido a mais nesta versão (v5.4.0/M4): além de FK para
    // robo_user_id, este mesmo uid é reusado para SIMULAR o JWT de um usuário real ao
    // testar solic_concluir via `pg` (app.exigir_acesso exige ativo=true — ver os
    // testes de outbox/conclusão abaixo). v5.4.0/Round4 (0217): o e-mail DESTE MESMO
    // usuário vira `p_solicitante_email` em toda chamada de criar_solicitacao_externa
    // abaixo — como é o mesmo usuário, `solicitante_id` gravado bate com `roboUserId`,
    // então `comoRobo`/solic_concluir (mais abaixo) continuam válidos sem mudança.
    const u = await client.query(`SELECT user_id, email FROM app.rbac_usuarios WHERE ativo AND email IS NOT NULL ORDER BY user_id LIMIT 1`)
    roboUserId = u.rows[0].user_id as string
    solicitanteEmail = u.rows[0].email as string

    // 2º usuário ativo DIFERENTE do robô: só existe para o caso que PROVA a
    // resolução do solicitante. Com o mesmo uid nas duas pontas (caminho feliz), a
    // asserção `solicitante_id = <usuário do e-mail>` passaria mesmo se a RPC
    // tivesse continuado gravando o robô — tautologia. Com um e-mail de outra
    // pessoa, só passa se a resolução realmente aconteceu.
    const u2 = await client.query(
      `SELECT user_id, email FROM app.rbac_usuarios WHERE ativo AND email IS NOT NULL AND user_id <> $1 ORDER BY user_id LIMIT 1`,
      [roboUserId],
    )
    outroSolicitanteId = (u2.rows[0]?.user_id as string) ?? ''
    outroSolicitanteEmail = (u2.rows[0]?.email as string) ?? ''

    // callback_url/callback_segredo preenchidos (v5.4.0/M4): sem eles, todo item da
    // outbox desta chave seria marcado 'esgotado' na hora por api_outbox_reivindicar
    // (chave sem callback nunca é entregável). Domínio .invalid (RFC 2606, nunca
    // resolve) — os testes abaixo não fazem HTTP de verdade, só exercitam o mecanismo
    // de claim/backoff no banco.
    const c = await client.query(
      `INSERT INTO app.api_chave (plataforma, segredo_hash, whitelist_tipos, robo_user_id, callback_url, callback_segredo)
       VALUES ('ZZ_TESTE_API_V540', $1, ARRAY[$2]::bigint[], $3, 'https://example.invalid/zz-callback-teste', 'zz-callback-segredo-teste')
       RETURNING id::int AS id`, [hashSegredo(SEGREDO_TESTE), tipoId, roboUserId])
    chaveId = c.rows[0].id
  })

  afterAll(async () => {
    if (!client) return
    // v5.4.0/M4 (ADR-0161): outbox ANTES do api_chave (FK chave_id) e ANTES da
    // solicitacao_tipo (via a solicitacao, removida na linha seguinte).
    await client.query(`DELETE FROM app.api_outbox WHERE chave_id = $1`, [chaveId]).catch(() => {})
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
  it('criar_solicitacao_externa: criação feliz devolve ok/id/status/destinatario/solicitante', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', { p_chave_id: chaveId, ...corpoFeliz, p_solicitante_email: solicitanteEmail })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as {
      ok: true; id: number; status: string
      destinatario: { id: number; nome: string }
      solicitante: { email: string; nome: string | null }
      idempotente: boolean
    }
    expect(typeof d.id).toBe('number')
    expect(d.status).toBe('aberta')
    expect(d.destinatario).toEqual({ id: roleId, nome: 'ZZ_TESTE_API_V540' })
    // v5.4.0/Round4 (0217): o ack ecoa o solicitante amarrado ao e-mail enviado.
    expect(d.solicitante.email).toBe(solicitanteEmail)
    expect(d.idempotente).toBe(false)
    solicitacaoId = d.id
  })

  // v5.4.0/Round4 (0217): solicitante_id gravado bate com o usuário do e-mail enviado
  // (no caminho feliz é o mesmo user_id reaproveitado como robô — ver beforeAll).
  it('criar_solicitacao_externa: grava solicitante_id = usuário do e-mail enviado', async () => {
    const r = await client.query(`SELECT solicitante_id FROM app.solicitacao WHERE id = $1`, [solicitacaoId])
    expect(r.rows[0].solicitante_id).toBe(roboUserId)
  })

  // O caso ACIMA não distingue "resolveu o e-mail" de "gravou o robô" (mesmo uid nas
  // duas pontas). ESTE distingue: manda o e-mail de OUTRA pessoa ativa e exige que a
  // linha fique com o uid DELA — a regressão "voltou a gravar o robô" reprova aqui.
  it('criar_solicitacao_externa: solicitante_id é o do E-MAIL, não o robô da chave', async () => {
    expect(outroSolicitanteEmail, 'a base precisa de ≥2 usuários ativos com e-mail para este caso').not.toBe('')
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, ...corpoFeliz,
      p_chave_idempotencia: 'zz-idem-outro-solicitante',
      p_solicitante_email: outroSolicitanteEmail,
    })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; solicitante: { email: string } }
    expect(d.solicitante.email).toBe(outroSolicitanteEmail)
    const linha = await client.query(`SELECT solicitante_id, origem_chave_id FROM app.solicitacao WHERE id = $1`, [d.id])
    expect(linha.rows[0].solicitante_id).toBe(outroSolicitanteId)
    expect(linha.rows[0].solicitante_id).not.toBe(roboUserId)
    // origem preservada mesmo com solicitante humano — é o que sustenta o selo
    // "via integração X" na UI (app.solic_json → chave `origem`).
    expect(Number(linha.rows[0].origem_chave_id)).toBe(chaveId)
  })

  // E-mail com caixa/espaços diferentes resolve o MESMO usuário (lower+btrim na RPC).
  it('criar_solicitacao_externa: e-mail do solicitante é case-insensitive', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, ...corpoFeliz,
      p_chave_idempotencia: 'zz-idem-solicitante-caixa',
      p_solicitante_email: `  ${solicitanteEmail.toUpperCase()}  `,
    })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; solicitante: { email: string } }
    expect(d.solicitante.email).toBe(solicitanteEmail)
  })

  // ── (2) paridade de validação (mesma app.solic_validar_e_snapshotar da UI) ────
  it('campo obrigatório ausente → CAMPO_OBRIGATORIO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { valor: '10', data_evento: '2027-01-01', categoria: 'a' }, // sem 'assunto'
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-campo-obrigatorio', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('CAMPO_OBRIGATORIO')
  })

  it('moeda inválida → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: 'abc', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-valor-moeda', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  it('data no passado em campo sem passado (regra v4.19) → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2020-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-data-passado', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  it('opção de seleção fora da lista → VALOR_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'zzz' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-selecao', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('VALOR_INVALIDO')
  })

  // v5.4.0/round3 (0216 — decisão do Yan 29/07): a lista branca de equipes POR TIPO morreu
  // (o fluxo humano nunca restringiu destino por tipo). O caso que antes esperava
  // DESTINATARIO_NAO_PERMITIDO virou o INVERSO: QUALQUER equipe existente é destino válido.
  it('destinatário (role) que existe mas não era da lista do tipo → ACEITO (destino livre, 0216)', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540_FORA',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-dest-livre', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { ok: boolean; id: number; destinatario: { id: number; nome: string } }
    expect(d.destinatario.nome).toBe('ZZ_TESTE_API_V540_FORA')  // destinatário resolvido é ecoado
    // Limpeza: o afterAll apaga por origem_chave_id (cobre esta e a outbox dela).
  })

  it('destinatário (role) inexistente → DESTINATARIO_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_ROLE_INEXISTENTE_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-dest-invalido', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
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
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('CAMPO_DESCONHECIDO')
  })

  it('tipo fora da whitelist da chave → TIPO_NAO_AUTORIZADO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540_fora', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: {}, p_data_limite: '2027-01-01',
      p_chave_idempotencia: 'zz-v540-tipo-nao-autorizado', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('TIPO_NAO_AUTORIZADO')
  })

  it('sem data_limite → DATA_LIMITE_OBRIGATORIA', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: null, p_chave_idempotencia: 'zz-v540-sem-data-limite', p_referencia_origem: null,
      p_solicitante_email: solicitanteEmail,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('DATA_LIMITE_OBRIGATORIA')
  })

  // v5.4.0/Round4 (0217 — decisão do Yan 30/07): solicitante amarrado a um usuário
  // cadastrado e ATIVO virou validação OBRIGATÓRIA, no mesmo espírito do destinatário.
  it('sem p_solicitante_email → SOLICITANTE_OBRIGATORIO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-sem-solicitante', p_referencia_origem: null,
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('SOLICITANTE_OBRIGATORIO')
  })

  it('p_solicitante_email sem cadastro ativo na plataforma → SOLICITANTE_INVALIDO', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, p_tipo_slug: 'zz_teste_api_v540', p_destinatario: 'ZZ_TESTE_API_V540',
      p_titulo: null, p_campos: { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite: '2027-01-01', p_chave_idempotencia: 'zz-v540-solicitante-invalido', p_referencia_origem: null,
      p_solicitante_email: 'zz-nao-existe@janus.internal',
    })
    expect(r.ok).toBe(false)
    expect(prefixo(r.erro)).toBe('SOLICITANTE_INVALIDO')
  })

  // ── (3) idempotência ───────────────────────────────────────────────────────
  it('repetir a criação feliz com a MESMA chave_idempotencia devolve o MESMO id (idempotente:true), sem duplicar', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', { p_chave_id: chaveId, ...corpoFeliz, p_solicitante_email: solicitanteEmail })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; status: string; idempotente: boolean }
    expect(d.id).toBe(solicitacaoId)
    expect(d.idempotente).toBe(true)
    expect(d.status).toBe('aberta') // ainda não cancelada nesta altura do teste

    // Escopo pelo PAR (chave de API, chave_idempotencia) — é exatamente o que a
    // idempotência promete. (Contar TODAS as solicitações da chave acoplaria este caso
    // a qualquer outro que crie solicitação válida — ex.: o de destino livre, 0216.)
    const cnt = await client.query(
      `SELECT count(*)::int n FROM app.solicitacao WHERE origem_chave_id = $1 AND chave_idempotencia = $2`,
      [chaveId, IDEM_FELIZ],
    )
    expect(cnt.rows[0].n).toBe(1)
  })

  // O caso acima reenvia com o MESMO e-mail, então não distingue "ecoa o solicitante
  // GRAVADO" de "re-resolve o e-mail desta chamada" — e a 0217 promete o primeiro
  // ("nunca o e-mail desta chamada, que pode nem bater, num reenvio tardio"). Aqui o
  // reenvio manda o e-mail de OUTRA pessoa: o ack tem de continuar devolvendo o
  // solicitante original, e a linha no banco não pode mudar de dono.
  it('reenvio idempotente com e-mail DIFERENTE ecoa o solicitante ORIGINAL e não troca o dono', async () => {
    expect(outroSolicitanteEmail, 'a base precisa de ≥2 usuários ativos com e-mail para este caso').not.toBe('')
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id: chaveId, ...corpoFeliz, p_solicitante_email: outroSolicitanteEmail,
    })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number; idempotente: boolean; solicitante: { email: string } }
    expect(d.id).toBe(solicitacaoId)
    expect(d.idempotente).toBe(true)
    expect(d.solicitante.email).toBe(solicitanteEmail)        // o da criação…
    expect(d.solicitante.email).not.toBe(outroSolicitanteEmail) // …não o do retry
    const linha = await client.query(`SELECT solicitante_id FROM app.solicitacao WHERE id = $1`, [solicitacaoId])
    expect(linha.rows[0].solicitante_id).toBe(roboUserId)
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
      slug: string; nome: string
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
    // admin_solic_salvar_tipo exige a ÁREA 'solicitacoes' — simular o JWT de um
    // usuário ativo QUE TEM a área, com set_config LOCAL dentro de uma transação
    // explícita (o pooler em transaction mode não preserva config de sessão entre
    // queries; dentro de BEGIN/COMMIT a conexão é a mesma e o escopo local basta).
    const rAdmin = await client.query(
      `SELECT u.user_id FROM app.rbac_usuarios u
       JOIN app.rbac_role_permissoes rp ON rp.role_id = u.role_id
       WHERE u.ativo AND rp.area = 'solicitacoes' LIMIT 1`,
    )
    expect(rAdmin.rows.length, 'precisa existir 1 usuário ativo com a área solicitacoes').toBeGreaterThan(0)
    const adminUid = rAdmin.rows[0].user_id as string

    let rEdit
    try {
      await client.query('BEGIN')
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: adminUid })])
      rEdit = await client.query(
        `SELECT public.admin_solic_salvar_tipo($1, $2, $3::jsonb, $4::jsonb) AS r`,
        [
          tipoId, 'ZZ Teste API v5.4.0', JSON.stringify(camposPayload),
          JSON.stringify({ exposto_via_api: true }),
        ],
      )
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    }
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

  // ── (7) outbox de callbacks — at-least-once (ADR-0161, v5.4.0/M4) ────────────
  it('outbox: a criação externa (testada em (1)) enfileirou exatamente 1 item solicitacao.criada — o retry idempotente (testado em (3)) não duplicou', async () => {
    const r = await client.query(
      `SELECT count(*)::int n FROM app.api_outbox WHERE solicitacao_id = $1 AND evento = 'solicitacao.criada'`,
      [solicitacaoId],
    )
    expect(r.rows[0].n).toBe(1)
  })

  it('outbox: o cancelamento externo (testado em (4)) enfileirou solicitacao.cancelada', async () => {
    const r = await client.query(
      `SELECT count(*)::int n FROM app.api_outbox WHERE solicitacao_id = $1 AND evento = 'solicitacao.cancelada'`,
      [solicitacaoId],
    )
    expect(r.rows[0].n).toBe(1)
  })

  it('cria a solicitação-fixture (p/ o teste de solic_concluir pós-0215 abaixo)', async () => {
    const r = await chamarRpc('criar_solicitacao_externa', {
      p_chave_id:           chaveId,
      p_tipo_slug:          'zz_teste_api_v540',
      p_destinatario:       'ZZ_TESTE_API_V540',
      p_titulo:             'Teste de conclusão (pós-0215)',
      p_campos:             { assunto: 'x', valor: '10', data_evento: '2027-01-01', categoria: 'a' },
      p_data_limite:        '2027-01-01',
      p_chave_idempotencia: 'zz-v540-concluir-fixture',
      p_referencia_origem:  null,
      p_solicitante_email:  solicitanteEmail,
    })
    expect(r.ok, r.erro ?? '').toBe(true)
    const d = r.data as { id: number }
    solicitacaoConcluirId = d.id
  })

  // A chamada abaixo passa por `pg` (conexão direta — superusuário passa o gate
  // de app.exigir_acesso), mas app.pode_ver_solic/sou_atendente ainda dependem de
  // um uid resolvido via `request.jwt.claims` — SIMULADO via
  // set_config('request.jwt.claims', …, false) [escopo de SESSÃO — o `client` é uma
  // conexão única persistente (pg.Client), então o valor sobrevive entre chamadas
  // .query() separadas; sempre resetado no `finally` para NÃO vazar para as demais
  // queries do `client` (incl. o cleanup do afterAll)]. sub = roboUserId = o
  // SOLICITANTE desta solicitação — v5.4.0/Round4 (0217): solicitante_id vem da
  // resolução de p_solicitante_email (solicitanteEmail), que é o e-mail do MESMO
  // usuário reaproveitado como roboUserId (ver beforeAll) — então
  // `v_sol.solicitante_id = uid_jwt()` autoriza a conclusão.
  async function comoRobo<T>(fn: () => Promise<T>): Promise<T> {
    await client.query(
      `SELECT set_config('request.jwt.claims', json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
      [roboUserId],
    )
    try {
      return await fn()
    } finally {
      await client.query(`SELECT set_config('request.jwt.claims', NULL, false)`)
    }
  }

  // Round2 (migration 0215): solic_concluir voltou à assinatura de 1 parâmetro
  // e o payload do callback NÃO carrega mais a chave 'referencia' — o conceito
  // "conclusão exige referência externa" foi EXTIRPADO (decisão do Yan).
  it('solic_concluir (pós-0215, 1 parâmetro): conclui e enfileira solicitacao.concluida SEM a chave referencia no payload', async () => {
    await comoRobo(() => client.query(`SELECT public.solic_concluir($1::bigint)`, [solicitacaoConcluirId]))

    const sol = await client.query(`SELECT status FROM app.solicitacao WHERE id = $1`, [solicitacaoConcluirId])
    expect(sol.rows[0].status).toBe('concluida')

    const outbox = await client.query(
      `SELECT payload FROM app.api_outbox WHERE solicitacao_id = $1 AND evento = 'solicitacao.concluida'`,
      [solicitacaoConcluirId],
    )
    expect(outbox.rows.length).toBe(1)
    expect(outbox.rows[0].payload).not.toHaveProperty('referencia')
  })

  // NOTA (risco de teste, não de produto): esta suíte roda contra o banco REAL (não
  // há staging — ver CLAUDE.md), e a migration 0213 agenda o pg_cron
  // 'api-outbox-processar' a cada 5min. Em tese, se o tick do cron cair EXATAMENTE
  // entre o INSERT abaixo e a chamada a api_outbox_reivindicar, o cron poderia
  // reivindicar este item antes do teste (o callback_url .invalid falharia,
  // reagendando com proximo_retry futuro, e o teste não o encontraria mais
  // 'pendente'). Extremamente improvável na janela de execução do `npm test`; não
  // mitigado aqui (exigiria mockar o agendador, fora do escopo desta suíte).
  it('api_outbox_reivindicar: devolve o item pendente e incrementa tentativas', async () => {
    const insert = await client.query(
      `INSERT INTO app.api_outbox (chave_id, evento, solicitacao_id, payload)
       VALUES ($1, 'zz.teste.reivindicar', $2, '{"x":1}'::jsonb) RETURNING id::int AS id`,
      [chaveId, solicitacaoId],
    )
    outboxClaimTestId = insert.rows[0].id

    const r = await chamarRpc('api_outbox_reivindicar', { p_limite: 100 })
    expect(r.ok, r.erro ?? '').toBe(true)
    const itens = r.data as Array<{ outbox_id: number; evento: string; tentativas: number; callback_url: string; callback_segredo: string | null }>
    const achado = itens.find(i => i.outbox_id === outboxClaimTestId)
    expect(achado).toBeTruthy()
    expect(achado!.evento).toBe('zz.teste.reivindicar')
    expect(achado!.tentativas).toBe(1)
    expect(achado!.callback_url).toBe('https://example.invalid/zz-callback-teste')
  })

  it('api_outbox_resultado(false): reagenda com proximo_retry FUTURO (backoff exponencial)', async () => {
    const antes = await client.query(`SELECT status FROM app.api_outbox WHERE id = $1`, [outboxClaimTestId])
    expect(antes.rows[0].status).toBe('pendente')

    const r = await chamarRpc('api_outbox_resultado', { p_id: outboxClaimTestId, p_sucesso: false, p_erro: 'HTTP 500 (teste)' })
    expect(r.ok, r.erro ?? '').toBe(true)

    const depois = await client.query(`SELECT status, proximo_retry, ultimo_erro FROM app.api_outbox WHERE id = $1`, [outboxClaimTestId])
    expect(depois.rows[0].status).toBe('pendente')
    expect(new Date(depois.rows[0].proximo_retry).getTime()).toBeGreaterThan(Date.now())
    expect(depois.rows[0].ultimo_erro).toBe('HTTP 500 (teste)')
  })
})

// Sempre roda (mesmo offline) — deixa visível, no relatório do `npm test`, que a
// suíte acima depende de env (.env.local) + das migrations 0212/0213/0215/0217 já
// aplicadas no remoto.
describe('gate — API externa de Solicitações: suíte de contrato é pulada, não falha, sem env/migration', () => {
  it('sem SUPABASE_URL/SERVICE_ROLE_KEY/SUPABASE_DB_URL ou sem as migrations 0212/0213/0215/0217: skipIf, não erro', () => {
    expect(true).toBe(true)
  })
})

// ── Sonda de NEGAÇÃO (achado MÉDIO do revisor-db v5.4.0): as RPCs de runtime da API
// externa são service_role-ONLY — anon E authenticated devem ser recusados SEMPRE.
// O SQL de REVOKE/GRANT foi conferido manualmente nas migrations; esta sonda impede
// que uma regressão futura (ex.: default privilege reintroduzido) passe despercebida.
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const RPCS_SERVICE_ONLY = [
  'api_chave_resolver', 'api_chamada_registrar', 'criar_solicitacao_externa',
  'cancelar_solicitacao_externa', 'solic_tipos_api', 'api_outbox_reivindicar',
  'api_outbox_resultado', 'solic_emails_envolvidos_svc', 'api_retrofit_contratos',
] as const

describe.skipIf(!ON || !RPC_PRONTA || !ANON)('negação — RPCs service-only da API externa recusam anon', () => {
  it.each([...RPCS_SERVICE_ONLY])('%s: anon não executa (nunca 2xx)', async (fn) => {
    const res = await fetch(`${HOST}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: ANON as string, Authorization: `Bearer ${ANON as string}`, 'Content-Type': 'application/json' },
      body: '{}',
    })
    // REVOKE de anon → PostgREST responde 401/403/404 (função invisível/negada) —
    // qualquer coisa MENOS sucesso. Argumentos vazios de propósito: a negação de
    // privilégio acontece ANTES da validação de parâmetros.
    expect(res.status, `${fn} respondeu ${res.status}`).toBeGreaterThanOrEqual(400)
  })
})
