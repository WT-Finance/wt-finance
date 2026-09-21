import { describe, it, expect } from 'vitest'
import { salvarEstruturaResultSchema } from './schemas'

// ── v5.9.5 (0268) — desfazer em lote robusto a MÚLTIPLOS TOQUES por linha ─────────────
// `financeiro.reverter_diario` percorria o lote em ASC e comparava a linha INTEIRA contra
// `dados_depois`; um lote que tocasse a mesma linha duas vezes (só migrations fazem isso —
// lote 132178, a 0251) abortava sem reverter nada. A 0268 processa em DESC e compara sem
// as colunas voláteis (`atualizado_em`, que a própria reversão avança).
//
// Prova COMPORTAMENTAL contra a base viva, em transação REVERTIDA (`BEGIN … ROLLBACK`, `pg`
// direto — padrão da v5.9.4, agora permanente): cada caso monta a cadeia sintética dentro
// da transação, chama a função e confere o estado; nada persiste. É o primeiro teste da
// suíte que escreve-e-reverte a cada `npm test` — deliberado e registrado no out-briefing
// da v5.9.5. Sem `SUPABASE_DB_URL` (offline), é pulado; o gate segue verde.
//
// v6.0.0/M1 — os casos que EXERCITAM as RPCs de escrita da estrutura da DRE (guard de payload
// duplicado, lote vazio, token inválido, id inexistente) rodavam via REST com a service role e
// depois migrariam para a credencial `verificador`. Não migraram: conceder EXECUTE nessas RPCs à
// credencial de verificação a tornaria capaz de escrever de verdade (achado ALTO do
// `revisor-db` na 0273). Passaram para AQUI, em transação revertida com identidade JWT
// simulada (`set_config('request.jwt.claims', …)`, o molde de `estante-rpcs.test.ts`): o corpo
// roda até o guard, o erro tem de ser o do guard, e nada persiste. A allowlist do `verificador`
// fica só com leitura.

const DB_URL = process.env.SUPABASE_DB_URL

type Linha = Record<string, unknown>
type Cliente = { query: (q: string, p?: unknown[]) => Promise<{ rows: Linha[] }> }

const MAP = 'financeiro.dre_categoria_map'
const BLOCO = 'financeiro.dre_bloco'

async function emTransacaoRevertida<T>(f: (c: Cliente) => Promise<T>): Promise<T> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c: Cliente & { connect: () => Promise<void>; end: () => Promise<void> } =
    new pg.Client({ connectionString: DB_URL })
  await c.connect()
  await c.query('BEGIN')
  // Dois `npm test` concorrentes (duas worktrees, mesmo banco) disputariam o lock das mesmas
  // linhas; sem isto o teste TRAVARIA até o timeout do runner. Falhar rápido é o certo.
  await c.query(`SET LOCAL lock_timeout = '5s'`)
  try { return await f(c) } finally {
    await c.query('ROLLBACK')
    await c.end()
  }
}

/** ids do diário criados NESTA transação para a linha (lote = txid_current()). */
async function entradas(c: Cliente, tabela: string, registroId: number | string): Promise<number[]> {
  const r = await c.query(
    `SELECT id FROM financeiro.diario_alteracoes
      WHERE lote_id = txid_current() AND tabela_alvo = $1 AND registro_id = $2 ORDER BY id`,
    [tabela, String(registroId)],
  )
  return r.rows.map(x => Number(x.id))
}

/** Chama reverter_diario sob SAVEPOINT: erro não derruba a transação do teste. */
async function reverter(c: Cliente, ids: number[]): Promise<{ ok: true; n: number } | { ok: false; msg: string }> {
  await c.query('SAVEPOINT chamada')
  try {
    const r = await c.query('SELECT financeiro.reverter_diario($1::bigint[]) AS n', [ids])
    return { ok: true, n: Number(r.rows[0].n) }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT chamada')
    return { ok: false, msg: (e as Error).message }
  }
}

/** Três linhas mapeadas do caixa (existem desde a 0205; não dependem de id fixo). */
async function tresLinhas(c: Cliente): Promise<number[]> {
  const r = await c.query(`SELECT id FROM ${MAP} WHERE bloco_chave IS NOT NULL ORDER BY id LIMIT 3`)
  expect(r.rows.length).toBe(3)
  return r.rows.map(x => Number(x.id))
}

async function ordem(c: Cliente, id: number): Promise<number | null> {
  const r = await c.query(`SELECT ordem FROM ${MAP} WHERE id = $1`, [id])
  return r.rows[0] ? Number(r.rows[0].ordem) : null
}

describe.skipIf(!DB_URL)('reverter_diario (0268) — cadeias de toques na MESMA linha, em transação revertida', () => {
  it('U→U: dois updates na mesma linha revertem ao estado original', async () => {
    await emTransacaoRevertida(async c => {
      const [id] = await tresLinhas(c)
      const antes = await ordem(c, id)
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [id])
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [id])
      const ids = await entradas(c, MAP, id)
      expect(ids.length).toBe(2)
      const r = await reverter(c, ids)
      expect(r).toEqual({ ok: true, n: 2 })
      expect(await ordem(c, id)).toBe(antes)
    })
  })

  it('I→U: insert + update revertem até a linha deixar de existir', async () => {
    await emTransacaoRevertida(async c => {
      const ins = await c.query(
        `INSERT INTO ${BLOCO} (chave, rotulo, tipo, ordem) VALUES ('ZZ_TESTE_0268', 'Teste', 'sub', 99990) RETURNING id`,
      )
      const id = Number(ins.rows[0].id)
      await c.query(`UPDATE ${BLOCO} SET rotulo = 'Teste renomeado' WHERE id = $1`, [id])
      const ids = await entradas(c, BLOCO, id)
      expect(ids.length).toBe(2)
      const r = await reverter(c, ids)
      expect(r).toEqual({ ok: true, n: 2 })
      const depois = await c.query(`SELECT 1 FROM ${BLOCO} WHERE id = $1`, [id])
      expect(depois.rows.length).toBe(0)
    })
  })

  it('U→D: update + delete revertem reinserindo a linha com o conteúdo original', async () => {
    await emTransacaoRevertida(async c => {
      const [, id] = await tresLinhas(c)
      const antes = await c.query(`SELECT ordem, bloco_chave, categoria_id FROM ${MAP} WHERE id = $1`, [id])
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [id])
      await c.query(`DELETE FROM ${MAP} WHERE id = $1`, [id])
      const ids = await entradas(c, MAP, id)
      expect(ids.length).toBe(2)
      const r = await reverter(c, ids)
      expect(r).toEqual({ ok: true, n: 2 })
      const depois = await c.query(`SELECT ordem, bloco_chave, categoria_id FROM ${MAP} WHERE id = $1`, [id])
      expect(depois.rows[0]).toEqual(antes.rows[0])
    })
  })

  it('conflito REAL (terceiro alterou o conteúdo depois do lote) continua recusado', async () => {
    await emTransacaoRevertida(async c => {
      const [id] = await tresLinhas(c)
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [id])
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [id])
      const ids = await entradas(c, MAP, id)
      await c.query(`UPDATE ${MAP} SET ordem = 777 WHERE id = $1`, [id]) // 3ª entrada, fora do lote pedido
      const r = await reverter(c, ids)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toMatch(/alterada por outra pessoa/)
      expect(await ordem(c, id)).toBe(777)
    })
  })

  it('atomicidade: lote com UMA linha em conflito real não reverte NENHUMA', async () => {
    await emTransacaoRevertida(async c => {
      const [a, , b] = await tresLinhas(c)
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [a])
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [a])
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 1 WHERE id = $1`, [b])
      const ids = [...await entradas(c, MAP, a), ...await entradas(c, MAP, b)]
      const meioA = await ordem(c, a)
      await c.query(`UPDATE ${MAP} SET ordem = 777 WHERE id = $1`, [b]) // terceiro mexe só em b
      const r = await reverter(c, ids)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain(`linha ${b} foi alterada`)
      expect(await ordem(c, a)).toBe(meioA) // a NÃO voltou — tudo ou nada
    })
  })

  it('caminho normal (um toque por linha, 3 linhas) segue revertendo — sem regressão', async () => {
    await emTransacaoRevertida(async c => {
      const ids3 = await tresLinhas(c)
      const antes = await Promise.all(ids3.map(id => ordem(c, id)))
      await c.query(`UPDATE ${MAP} SET ordem = ordem + 5 WHERE id = ANY($1::bigint[])`, [ids3])
      const ids: number[] = []
      for (const id of ids3) ids.push(...await entradas(c, MAP, id))
      const r = await reverter(c, ids)
      expect(r).toEqual({ ok: true, n: 3 })
      expect(await Promise.all(ids3.map(id => ordem(c, id)))).toEqual(antes)
    })
  })

  it('catálogo vivo: DESC e a constante de colunas voláteis (reprova REPLACE escrito da 0206)', async () => {
    await emTransacaoRevertida(async c => {
      const r = await c.query(`SELECT pg_get_functiondef('financeiro.reverter_diario(bigint[])'::regprocedure) AS def`)
      const def = String(r.rows[0].def)
      expect(def).toMatch(/ORDER BY id DESC/)
      expect(def).toMatch(/c_volateis\s+CONSTANT\s+text\[\]\s*:=\s*ARRAY\['atualizado_em'\]/)
      expect(def).toMatch(/\(v_atual - c_volateis\) IS DISTINCT FROM \(e\.dados_depois - c_volateis\)/)
      // e a guarda continua: as três mensagens de conflito estão lá
      expect(def).toContain('foi alterada por outra pessoa depois desta criação')
      expect(def).toContain('foi alterada por outra pessoa depois desta edição')
      expect(def).toContain('não existe mais (foi excluída depois)')
    })
  })
})

/** Assume, dentro da transação, a identidade de um usuário REAL e ATIVO com a área
 *  `financeiro/dre` (escolhido dinamicamente — nunca id fixo). `app.exigir_acesso` lê as
 *  claims e percorre o caminho normal de usuário; a conexão é `postgres` (owner das tabelas). */
async function comoUsuarioDaDre(c: Cliente): Promise<void> {
  const r = await c.query(
    `SELECT u.user_id FROM app.rbac_usuarios u
       JOIN app.rbac_role_permissoes p ON p.role_id = u.role_id
      WHERE u.ativo AND p.area = 'financeiro/dre' ORDER BY u.criado_em LIMIT 1`,
  )
  expect(r.rows.length, 'nenhum usuário ativo com financeiro/dre para simular').toBe(1)
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: r.rows[0].user_id, role: 'authenticated' })])
}

/** Chama uma RPC sob SAVEPOINT e devolve o erro (ou o valor). Erro não derruba a transação. */
async function chamar(c: Cliente, sql: string, p: unknown[]): Promise<{ ok: true; v: Linha } | { ok: false; msg: string }> {
  await c.query('SAVEPOINT chamada')
  try {
    const r = await c.query(sql, p)
    return { ok: true, v: r.rows[0] }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT chamada')
    return { ok: false, msg: (e as Error).message }
  }
}

describe.skipIf(!DB_URL)('guards das RPCs de escrita da estrutura da DRE — em transação revertida, com identidade simulada (v6.0.0)', () => {
  // Token propositalmente inválido: se o guard rodasse DEPOIS da trava otimista, o erro
  // seria DRE_CONFLITO. Tem de ser o do guard — nada é lido nem escrito.
  const dup = JSON.stringify([
    { categoria_id: 1, bloco_chave: 'ENT_H', ordem: 1, excluida: false },
    { categoria_id: 1, bloco_chave: 'PAG_H', ordem: 2, excluida: false },
  ])
  it('dre_estrutura_salvar recusa a mesma categoria duas vezes no lote, antes da trava', async () => {
    await emTransacaoRevertida(async c => {
      await comoUsuarioDaDre(c)
      const r = await chamar(c, `SELECT public.dre_estrutura_salvar($1::jsonb, '1970-01-01T00:00:00Z'::timestamptz)`, [dup])
      expect(r.ok).toBe(false)
      const msg = (r as { msg: string }).msg
      expect(msg).toMatch(/DRE_PAYLOAD_INVALIDO/)
      expect(msg).toMatch(/mais de uma vez/)
      expect(msg).not.toMatch(/DRE_CONFLITO/)
    })
  })
  it('dre_comp_estrutura_salvar recusa a mesma linha duas vezes no lote, antes da trava', async () => {
    await emTransacaoRevertida(async c => {
      await comoUsuarioDaDre(c)
      const r = await chamar(c, `SELECT public.dre_comp_estrutura_salvar($1::jsonb, '1970-01-01T00:00:00Z'::timestamptz)`, [dup])
      expect(r.ok).toBe(false)
      const msg = (r as { msg: string }).msg
      expect(msg).toMatch(/DRE_PAYLOAD_INVALIDO/)
      expect(msg).toMatch(/mais de uma vez/)
      expect(msg).not.toMatch(/DRE_CONFLITO/)
    })
  })

  // Vieram de `rpc-contrato.test.ts` (v6.0.0/M1) — lá rodavam via REST com a service role.
  it('dre_estrutura_salvar: lote vazio é no-op (gravadas=0); token errado → DRE_CONFLITO (nada muda)', async () => {
    await emTransacaoRevertida(async c => {
      await comoUsuarioDaDre(c)
      const est = await c.query(`SELECT (public.dre_estrutura()->>'token') AS token`)
      const token = est.rows[0].token as string
      expect(token).toBeTruthy()
      const ok = await chamar(c, `SELECT public.dre_estrutura_salvar('[]'::jsonb, $1::timestamptz) AS r`, [token])
      expect(ok.ok, (ok as { msg?: string }).msg).toBe(true)
      // O mesmo schema Zod do call-site (parseRpc) — shape do retorno REAL, não só o campo.
      const r = salvarEstruturaResultSchema.parse((ok as { v: Linha }).v.r)
      expect(r.ok).toBe(true)
      expect(r.gravadas).toBe(0)
      const conflito = await chamar(c, `SELECT public.dre_estrutura_salvar('[]'::jsonb, '1970-01-01T00:00:00Z'::timestamptz)`, [])
      expect(conflito.ok).toBe(false)
      expect((conflito as { msg: string }).msg).toMatch(/DRE_CONFLITO/)
    })
  })
  it('dre_estrutura_desfazer_lote/linha: id inexistente → erro amigável, nada muda', async () => {
    await emTransacaoRevertida(async c => {
      await comoUsuarioDaDre(c)
      const lote = await chamar(c, `SELECT public.dre_estrutura_desfazer_lote($1::bigint)`, [1])
      expect(lote.ok).toBe(false)
      expect((lote as { msg: string }).msg).toMatch(/inexistente/)
      const linha = await chamar(c, `SELECT public.dre_estrutura_desfazer_linha($1::bigint)`, [1])
      expect(linha.ok).toBe(false)
      expect((linha as { msg: string }).msg).toMatch(/inexistente/)
    })
  })
})
