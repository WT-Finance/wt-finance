import { describe, it, expect } from 'vitest'

// ── v5.11.0 (0271/0272) — Estante Welcome: as recusas SÃO a regra de negócio ─────
// Prova COMPORTAMENTAL contra a base viva, em transação REVERTIDA (`BEGIN … ROLLBACK`,
// `pg` direto — contrato da skill `banco-e-rpc` §6). Cada caso monta o cenário dentro
// da transação, chama a RPC e confere; nada persiste.
//
// ACHADO (rodada 2, execução real): a conexão de `SUPABASE_DB_URL` é `postgres`, mas
// `rolsuper = false` neste banco. `app.exigir_acesso` (0269) só libera conexão SEM
// claims quando `rolsuper` é verdadeiro — aqui não é, então qualquer RPC gated chamada
// ANTES de assumir uma identidade estoura `AUTH_NECESSARIA: contexto sem identidade`.
// Por isso toda RPC `estante_*` deste arquivo roda sob `SET LOCAL request.jwt.claims`
// de um usuário real: é o que torna os ramos de recusa por permissão testáveis, e
// também o único jeito de a chamada nem sequer PASSAR do guard. `comoServico()` (sem
// claims) deixou de ser um caminho para chamar RPC gated — serve só para SQL direto
// (INSERT/UPDATE/SELECT em tabela), que não passa pelo guard porque a conexão é dona
// das tabelas (RLS não se aplica ao dono, independente de claims).

const DB_URL = process.env.SUPABASE_DB_URL

type Linha = Record<string, unknown>
type Cliente = { query: (q: string, p?: unknown[]) => Promise<{ rows: Linha[] }> }

async function emTransacaoRevertida<T>(f: (c: Cliente) => Promise<T>): Promise<T> {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const c: Cliente & { connect: () => Promise<void>; end: () => Promise<void> } =
    new pg.Client({ connectionString: DB_URL })
  await c.connect()
  await c.query('BEGIN')
  await c.query(`SET LOCAL lock_timeout = '5s'`)
  try { return await f(c) } finally {
    await c.query('ROLLBACK')
    await c.end()
  }
}

/** Assume a identidade de um usuário real dentro da transação. */
async function comoUsuario(c: Cliente, uid: string): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' })])
}

/**
 * Limpa as claims — deixa de haver identidade alguma. NÃO chame nenhuma RPC gated
 * depois disto: a conexão é `postgres` sem `rolsuper`, e sem claims `app.exigir_acesso`
 * recusa com `AUTH_NECESSARIA`. Use só para SQL direto (INSERT/UPDATE/SELECT em
 * tabela) — a conexão é dona das tabelas, então RLS não a restringe de qualquer forma.
 */
async function comoServico(c: Cliente): Promise<void> {
  await c.query(`SELECT set_config('request.jwt.claims', '', true)`)
}

/** Chama a RPC sob SAVEPOINT: erro não derruba a transação do teste. */
async function chamar(c: Cliente, sql: string, p: unknown[]):
  Promise<{ ok: true; v: Linha } | { ok: false; msg: string }> {
  await c.query('SAVEPOINT chamada')
  try {
    const r = await c.query(sql, p)
    return { ok: true, v: r.rows[0] }
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT chamada')
    return { ok: false, msg: (e as Error).message }
  }
}

/** Dois usuários ativos QUAISQUER da base — sem depender de uuid fixo. */
async function doisUsuarios(c: Cliente): Promise<[string, string]> {
  const r = await c.query(
    `SELECT user_id FROM app.rbac_usuarios WHERE ativo ORDER BY criado_em LIMIT 2`)
  expect(r.rows.length).toBe(2)
  return [String(r.rows[0].user_id), String(r.rows[1].user_id)]
}

/** Dá as duas áreas da Estante à role do usuário, DENTRO da transação. */
async function darAreas(c: Cliente, uid: string, areas: string[]): Promise<void> {
  await c.query(
    `INSERT INTO app.rbac_role_permissoes (role_id, area)
     SELECT u.role_id, a FROM app.rbac_usuarios u, unnest($2::text[]) a
      WHERE u.user_id = $1
     ON CONFLICT DO NOTHING`, [uid, areas])
}

/** Tira as áreas da role do usuário, DENTRO da transação. */
async function tirarAreas(c: Cliente, uid: string, areas: string[]): Promise<void> {
  await c.query(
    `DELETE FROM app.rbac_role_permissoes rp
      USING app.rbac_usuarios u
      WHERE u.user_id = $1 AND rp.role_id = u.role_id AND rp.area = ANY($2::text[])`,
    [uid, areas])
}

/**
 * Garante que A e B NÃO compartilham `role_id`. Se compartilharem, `tirarAreas(B, ...)`
 * tiraria a área também de A (mesma role), e um caso "com gestão" logo depois de um
 * "sem gestão" quebraria sem motivo aparente. B é repontado para uma role sintética
 * criada nesta transação — revertida no ROLLBACK, como tudo o mais aqui.
 */
async function garantirRolesDistintas(c: Cliente, a: string, b: string): Promise<void> {
  const r = await c.query(
    `SELECT ua.role_id AS ra, ub.role_id AS rb
       FROM app.rbac_usuarios ua, app.rbac_usuarios ub
      WHERE ua.user_id = $1 AND ub.user_id = $2`, [a, b])
  const { ra, rb } = r.rows[0] as { ra: number | null; rb: number | null }
  if (ra !== null && ra === rb) {
    const nova = await c.query(
      `INSERT INTO app.rbac_roles (nome, descricao)
       VALUES ('ZZ_TESTE_0271 role de B', 'sintética — só existe dentro da transação revertida')
       RETURNING id AS v`)
    const novaId = (nova.rows[0] as { v: number }).v
    await c.query(`UPDATE app.rbac_usuarios SET role_id = $1 WHERE user_id = $2`, [novaId, b])
  }
}

/**
 * Escolhe A e B, garante roles distintas, dá as DUAS áreas da Estante à role de A e
 * assume a identidade de A. CHAME SEMPRE ISTO ANTES de qualquer `estante_*` nesta
 * transação — sem identidade assumida a RPC gated estoura `AUTH_NECESSARIA` (ver o
 * comentário de cabeçalho do arquivo). Devolve [a, b] com A já assumido.
 */
async function prepararGestor(c: Cliente): Promise<[string, string]> {
  const [a, b] = await doisUsuarios(c)
  await garantirRolesDistintas(c, a, b)
  await darAreas(c, a, [USO, GESTAO])
  await comoUsuario(c, a)
  return [a, b]
}

/**
 * Cria um livro. Exige que uma identidade COM a área de gestão já esteja assumida
 * (`comoUsuario`/`prepararGestor`) — `estante_criar_livro` é gated e a conexão pg não
 * tem atalho de superusuário neste banco (ver cabeçalho do arquivo).
 */
async function criarLivro(c: Cliente, titulo: string): Promise<number> {
  const r = await c.query(`SELECT public.estante_criar_livro($1) AS v`, [titulo])
  return Number((r.rows[0].v as { id: number }).id)
}

const USO = 'gestao-pessoas/estante'
const GESTAO = 'gestao-pessoas/estante/gestao'
const MOV = `SELECT public.estante_registrar_movimentacao($1::bigint, $2::text, $3::uuid, $4::date, $5::text) AS v`

describe.skipIf(!DB_URL)('RPCs da Estante Welcome (0271/0272)', () => {
  it('livro sem movimentação nasce DISPONÍVEL', async () => {
    await emTransacaoRevertida(async c => {
      await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Essencialismo')
      const r = await c.query(`SELECT public.estante_listar_livros() AS v`)
      const linha = (r.rows[0].v as Array<{ id: number; emprestado: boolean; tem_historico: boolean }>)
        .find(l => Number(l.id) === id)
      expect(linha?.emprestado).toBe(false)
      expect(linha?.tem_historico).toBe(false)
    })
  })

  it('emprestar livro já emprestado ⇒ JA_EMPRESTADO', async () => {
    await emTransacaoRevertida(async c => {
      const [a, b] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Mindset')
      const ok = await chamar(c, MOV, [id, 'emprestimo', a, null, null])
      expect(ok.ok).toBe(true)
      const dup = await chamar(c, MOV, [id, 'emprestimo', b, null, null])
      expect(dup.ok).toBe(false)
      if (!dup.ok) expect(dup.msg).toContain('JA_EMPRESTADO')
    })
  })

  it('devolver livro que está na estante ⇒ NAO_EMPRESTADO', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Sapiens')
      const r = await chamar(c, MOV, [id, 'devolucao', a, null, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('NAO_EMPRESTADO')
    })
  })

  it('devolução de livro alheio: recusada SEM gestão, aceita COM gestão', async () => {
    await emTransacaoRevertida(async c => {
      const [a, b] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Do Zero ao Um')
      await chamar(c, MOV, [id, 'emprestimo', a, null, null])   // A pegou (identidade de A, com gestão)

      // B só com a área de USO: recusado.
      await darAreas(c, b, [USO])
      await tirarAreas(c, b, [GESTAO])
      await comoUsuario(c, b)
      const semGestao = await chamar(c, MOV, [id, 'devolucao', null, null, null])
      expect(semGestao.ok).toBe(false)
      if (!semGestao.ok) expect(semGestao.msg).toContain('DEVOLUCAO_DE_OUTRO')

      // B com gestão: aceito, e a devolução fica no nome de QUEM ESTAVA com o livro.
      // A concessão é SQL direto (não passa pelo guard); a identidade de B segue
      // assumida da linha anterior — não precisa reassumir.
      await darAreas(c, b, [GESTAO])
      const comGestao = await chamar(c, MOV, [id, 'devolucao', null, null, null])
      expect(comGestao.ok).toBe(true)

      await comoServico(c)
      const dono = await c.query(
        `SELECT usuario_id FROM estante.movimentacao
          WHERE livro_id = $1 AND tipo = 'devolucao' ORDER BY id DESC LIMIT 1`, [id])
      expect(String(dono.rows[0].usuario_id)).toBe(a)
    })
  })

  it('usuário só com a área de USO não cadastra livro', async () => {
    await emTransacaoRevertida(async c => {
      const [, b] = await doisUsuarios(c)
      await darAreas(c, b, [USO])
      await tirarAreas(c, b, [GESTAO])
      await comoUsuario(c, b)
      const r = await chamar(c, `SELECT public.estante_criar_livro($1) AS v`, ['ZZ_TESTE_0271 Proibido'])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('PERMISSAO_NEGADA')
    })
  })

  it('remover: livro virgem APAGA, livro com razão ARQUIVA e o histórico sobrevive', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await prepararGestor(c)

      const virgem = await criarLivro(c, 'ZZ_TESTE_0271 Nunca Emprestado')
      const r1 = await c.query(`SELECT public.estante_remover_livro($1::bigint) AS v`, [virgem])
      expect((r1.rows[0].v as { acao: string }).acao).toBe('apagado')
      const sumiu = await c.query(`SELECT 1 FROM estante.livro WHERE id = $1`, [virgem])
      expect(sumiu.rows.length).toBe(0)

      const usado = await criarLivro(c, 'ZZ_TESTE_0271 Já Rodou')
      await chamar(c, MOV, [usado, 'emprestimo', a, null, null])
      const r2 = await c.query(`SELECT public.estante_remover_livro($1::bigint) AS v`, [usado])
      expect((r2.rows[0].v as { acao: string }).acao).toBe('arquivado')
      const razao = await c.query(`SELECT count(*) AS n FROM estante.movimentacao WHERE livro_id = $1`, [usado])
      expect(Number(razao.rows[0].n)).toBe(1)

      // Remover DUAS vezes o mesmo livro arquivado: a 2ª chamada não é um no-op
      // disfarçado de ação — devolve 'ja_arquivado', não 'arquivado' de novo (0272).
      const r3 = await c.query(`SELECT public.estante_remover_livro($1::bigint) AS v`, [usado])
      expect((r3.rows[0].v as { acao: string }).acao).toBe('ja_arquivado')
    })
  })

  it('livro arquivado não aceita movimentação', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Arquivado')
      await chamar(c, MOV, [id, 'emprestimo', a, null, null])
      await c.query(`SELECT public.estante_remover_livro($1::bigint)`, [id])
      const r = await chamar(c, MOV, [id, 'devolucao', a, null, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('LIVRO_ARQUIVADO')
    })
  })

  it('devolução com data ANTERIOR ao empréstimo não inverte o estado (desempate por criado_em)', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Retroativo')
      await chamar(c, MOV, [id, 'emprestimo', a, '2026-09-10', null])
      // Devolução datada ANTES: a data manda, então o livro fica emprestado de novo?
      // Não — a ordenação é (data DESC, criado_em DESC, id DESC) e o empréstimo é o
      // mais recente por data. Este teste PRENDE esse comportamento.
      await chamar(c, MOV, [id, 'devolucao', a, '2026-09-01', null])
      const r = await c.query(`SELECT emprestado FROM estante.v_estado_atual WHERE livro_id = $1`, [id])
      expect(r.rows[0].emprestado).toBe(true)
    })
  })

  it('ano fora do intervalo ⇒ ANO_INVALIDO', async () => {
    await emTransacaoRevertida(async c => {
      await prepararGestor(c)
      const r = await chamar(c,
        `SELECT public.estante_criar_livro($1, NULL, NULL, $2::smallint) AS v`,
        ['ZZ_TESTE_0271 Ano Ruim', 1200])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('ANO_INVALIDO')
    })
  })

  // ── Achados da 2ª rodada do revisor-db (0272) — acompanham a RPC viva ────────────

  it('movimentação com data futura ⇒ DATA_FUTURA (senão o livro congela emprestado para sempre)', async () => {
    await emTransacaoRevertida(async c => {
      const [a] = await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Data Futura')
      const daquiUmAno = new Date()
      daquiUmAno.setFullYear(daquiUmAno.getFullYear() + 1)
      const data = daquiUmAno.toISOString().slice(0, 10)
      const r = await chamar(c, MOV, [id, 'emprestimo', a, data, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('DATA_FUTURA')
    })
  })

  it('tipo NULL ⇒ TIPO_INVALIDO (o cast para o enum não lança para NULL; precisa de guard explícito)', async () => {
    await emTransacaoRevertida(async c => {
      await prepararGestor(c)
      const id = await criarLivro(c, 'ZZ_TESTE_0271 Tipo Nulo')
      const r = await chamar(c, MOV, [id, null, null, null, null])
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.msg).toContain('TIPO_INVALIDO')
    })
  })
})
