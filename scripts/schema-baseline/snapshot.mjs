// Baseline de schema versionado (v6.0.0/M8, briefing §5.H) — UM MÓDULO SÓ gera e compara.
//
// O briefing pede `supabase db dump --schema-only` → .sql; não dá nesta máquina (o dump roda
// num container e o socket do Docker está negado, sem `pg_dump` local — divergência registrada
// pelo orquestrador). O retrato nasce das MESMAS queries de catálogo que o projeto já usa
// (`sonda-leitores-vendas-excel.test.ts`, `derivar-allowlist.mjs`), em JSON estruturado —
// comparar SQL bruto exigiria parsear texto, e o defeito que esta missão existe para evitar é
// justamente gerador e comparador usando fontes DIFERENTES (skill banco-e-rpc: "CREATE OR
// REPLACE a partir do arquivo errado perde o que o catálogo vivo tinha, em silêncio" — o mesmo
// raciocínio vale para gerador × teste).
//
// `snapshotCatalogo(client)` recebe um `pg.Client`/`pg.Pool` JÁ CONECTADO — a abertura da
// conexão e a trava `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` são responsabilidade
// de quem chama (skill banco-e-rpc §6: "primeiro comando depois do connect()"), exatamente como
// em `sonda-leitores-vendas-excel.test.ts`/`derivar-allowlist.mjs`. Esta função só LÊ.
//
// DECISÕES DE SIMPLIFICAÇÃO (declaradas, não escondidas):
//   • ACL de tabela/view/função usa `relacl`/`proacl` CRUS (NULL ⇒ mapa de ACL vazio), sem
//     `acldefault(...)` para resolver o privilégio DEFAULT implícito quando a coluna é NULL —
//     os códigos de tipo aceitos por `acldefault` não puderam ser confirmados sem acesso a um
//     banco vivo (este agente é editor puro) e um char errado quebraria a geração INTEIRA do
//     baseline; o preço é não enxergar drift teórico em privilégio "default" nunca explicitado
//     via GRANT — mas `ALTER DEFAULT PRIVILEGES` fica coberto à parte (ver `default_acl` abaixo),
//     que é onde essa mudança realmente aconteceria.
//   • Sequências não entram como item de catálogo próprio (o briefing não pede) — o que uma
//     sequência sustenta (IDENTITY) já aparece em `colunas[].identity`.
//   • ACL de USO DE SCHEMA (`GRANT USAGE ON SCHEMA ... TO <role>`) não entra no retrato dos
//     papéis — o briefing pede só a allowlist de EXECUTE; USAGE de schema é achado a reportar,
//     não escopo desta missão.
import { createHash } from 'node:crypto'

// ── JSDoc typedefs — allowJs infere o shape a partir DESTES comentários (sem @types/pg
// instalado, então `client` fica solto de propósito: qualquer objeto com `.query(sql, params)`
// serve, é o duck-typing que os testes/o gerador já assumem). O `.test.ts` consumidor usa
// `Awaited<ReturnType<typeof snapshotCatalogo>>` para herdar este shape sem precisar de `any`.
// UM `@typedef` POR COMENTÁRIO (não vários numa única bolha) — associação de `@property` ao
// `@typedef` errado sob um comentário combinado não é garantia que se queira testar sem tsc.
/**
 * @typedef {Object} Coluna
 * @property {string} tipo
 * @property {boolean} not_null
 * @property {string|null} default
 * @property {'ALWAYS'|'BY DEFAULT'|null} identity
 * @property {'STORED'|null} generated
 */

/**
 * @typedef {Object} Policy
 * @property {string} comando
 * @property {string[]} roles
 * @property {string|null} using
 * @property {string|null} with_check
 */

/** @typedef {Record<string, Record<string, boolean>>} Acl */

/**
 * @typedef {Object} Tabela
 * @property {'tabela'|'particionada'} tipo
 * @property {string} dono
 * @property {boolean} rls_habilitado
 * @property {boolean} rls_forcado
 * @property {Record<string, Coluna>} colunas
 * @property {Record<string, string>} constraints
 * @property {Record<string, string>} indices
 * @property {Record<string, Policy>} policies
 * @property {Record<string, string>} triggers
 * @property {Acl} acl
 */

/**
 * @typedef {Object} View
 * @property {'view'|'matview'} tipo
 * @property {string} dono
 * @property {string[]|null} reloptions
 * @property {string|null} hash_definicao
 * @property {Acl} acl
 */

/**
 * @typedef {Object} Funcao
 * @property {string} retorno
 * @property {string} linguagem
 * @property {boolean} security_definer
 * @property {string} volatilidade
 * @property {string[]} proconfig
 * @property {string} dono
 * @property {string|null} hash_corpo
 * @property {Acl} acl
 */

/**
 * @typedef {Object} RoleAtributos
 * @property {boolean} rolsuper
 * @property {boolean} rolinherit
 * @property {boolean} rolcreaterole
 * @property {boolean} rolcreatedb
 * @property {boolean} rolcanlogin
 * @property {boolean} rolreplication
 * @property {boolean} rolbypassrls
 * @property {number} rolconnlimit
 */

/**
 * @typedef {Object} Role
 * @property {RoleAtributos} atributos
 * @property {string[]} membro_de
 * @property {string[]} tem_como_membros
 * @property {string[]} configuracoes
 * @property {string[]} allowlist
 */

/**
 * @typedef {Object} RolePlataforma
 * @property {RoleAtributos} atributos
 * @property {string[]} membro_de
 * @property {string[]} configuracoes
 */

/**
 * @typedef {Object} CronJob
 * @property {string} schedule
 * @property {boolean} active
 * @property {string} username
 * @property {string} database
 * @property {string|null} hash_comando
 */

/**
 * @typedef {Object} Snapshot
 * @property {string|null} ultima_migration
 * @property {string[]} schemas_nao_sistema
 * @property {Record<string, string>} extensoes
 * @property {Record<string, Tabela>} tabelas
 * @property {Record<string, View>} views
 * @property {Record<string, Funcao>} funcoes
 * @property {Record<string, Role|null>} roles
 * @property {Record<string, RolePlataforma|null>} roles_plataforma
 * @property {Record<string, Record<string, Record<string, string[]>>>} default_acl
 * @property {Record<string, CronJob>} cron
 */

/** Schemas do projeto — catálogo detalhado (tabelas/views/funções) só aqui dentro. */
export const SCHEMAS_PROJETO = Object.freeze([
  'analytics', 'app', 'audit', 'dim', 'estante', 'financeiro',
  'ingestao', 'monde', 'patrimonio', 'public', 'raw',
])

/** Schemas de PLATAFORMA — drift ali é do Supabase, não deste projeto. */
export const SCHEMAS_EXCLUIDOS = Object.freeze([
  'auth', 'storage', 'realtime', 'net', 'vault', 'extensions',
  'graphql', 'graphql_public', 'pgbouncer', 'cron', 'supabase_migrations',
])

/** As duas credenciais de máquina cujo retrato completo entra no baseline. */
const ROLES_MAQUINA = Object.freeze(['verificador', 'ingestor'])

/** Papéis da PLATAFORMA que o PostgREST usa em toda requisição (achado MÉDIO do `revisor`): o
 *  `rolconfig` deles carrega o `statement_timeout` por role e o `TimeZone=America/Sao_Paulo`
 *  (skill banco-e-rpc §3) — mudar isso pelo Dashboard, fora de migration, é drift que interessa.
 *  Entram só atributos, membership e configurações; os GRANTs deles já aparecem na ACL de cada
 *  tabela/view/função do projeto, e uma allowlist de ~300 assinaturas aqui só duplicaria isso. */
const ROLES_PLATAFORMA = Object.freeze(['anon', 'authenticated', 'service_role', 'authenticator'])

function sha256(texto) {
  if (texto === null || texto === undefined) return null
  return createHash('sha256').update(texto, 'utf8').digest('hex')
}

// Fila por cliente: os blocos abaixo disparam várias leituras com `Promise.all`, mas um
// `pg.Client` só executa UMA query por vez — chamá-lo enquanto outra está em curso é deprecado
// (o pg@9 vai remover; o aviso apareceu na primeira geração do baseline). Encadear aqui mantém a
// leitura dos blocos e garante que o client nunca recebe uma query com outra em andamento.
// Não há perda: com um Client só, o próprio pg já as enfileirava.
const filaPorCliente = new WeakMap()

async function q(client, sql, params = []) {
  const anterior = filaPorCliente.get(client) ?? Promise.resolve()
  const atual = anterior.catch(() => {}).then(() => client.query(sql, params))
  filaPorCliente.set(client, atual)
  const { rows } = await atual
  return rows
}

/** Agrupa linhas por uma chave (string) — devolve Map<chave, linha[]>. */
function agrupar(linhas, chaveFn) {
  const mapa = new Map()
  for (const linha of linhas) {
    const chave = chaveFn(linha)
    if (!mapa.has(chave)) mapa.set(chave, [])
    mapa.get(chave).push(linha)
  }
  return mapa
}

const ARGS_POR_FORMAT_TYPE = `
  coalesce((
    SELECT string_agg(format_type(a.tipo, NULL), ', ' ORDER BY a.ord)
    FROM unnest(p.proargtypes) WITH ORDINALITY AS a(tipo, ord)
  ), '')
`

// ═══════════════════════════════════════════════════════════════════════════════════════
// Seções do retrato — cada uma devolve um objeto plano; snapshotCatalogo as combina.
// ═══════════════════════════════════════════════════════════════════════════════════════

async function ultimaMigration(client) {
  const linhas = await q(client, `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 1`)
  return linhas[0]?.version ?? null
}

async function schemasNaoSistema(client) {
  const linhas = await q(client, `
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT LIKE 'pg\\_%' AND nspname <> 'information_schema'
    ORDER BY nspname
  `)
  return linhas.map(l => l.nspname)
}

async function extensoes(client) {
  const linhas = await q(client, `SELECT extname, extversion FROM pg_extension ORDER BY extname`)
  const saida = {}
  for (const l of linhas) saida[l.extname] = l.extversion
  return saida
}

/** Mapa oid(string) → rolname, para resolver grantee de ACL (grantee=0 ⇒ PUBLIC). */
async function mapaRoles(client) {
  const linhas = await q(client, `SELECT oid, rolname FROM pg_roles`)
  const mapa = new Map(linhas.map(l => [String(l.oid), l.rolname]))
  return (oid) => (String(oid) === '0' ? 'PUBLIC' : (mapa.get(String(oid)) ?? `oid:${oid}`))
}

/** ACL crua de uma lista de oids de relação ('r' — tabela/view/matview), agrupada por oid. */
async function aclRelacoes(client, oids, nomeDeGrantee) {
  if (oids.length === 0) return new Map()
  const linhas = await q(client, `
    SELECT c.oid AS alvo_oid, e.grantee, e.privilege_type, e.is_grantable
    FROM pg_class c
    CROSS JOIN LATERAL aclexplode(c.relacl) e
    WHERE c.oid = ANY($1::oid[]) AND c.relacl IS NOT NULL
    ORDER BY c.oid, e.grantee, e.privilege_type, e.grantor
  `, [oids])
  return construirMapaAcl(linhas, nomeDeGrantee)
}

function construirMapaAcl(linhas, nomeDeGrantee) {
  const porOid = agrupar(linhas, l => String(l.alvo_oid))
  const saida = new Map()
  for (const [oid, itens] of porOid) {
    const acl = {}
    for (const item of itens) {
      const grantee = nomeDeGrantee(item.grantee)
      acl[grantee] ??= {}
      // OR entre grantors (achado MÉDIO do `revisor`): com mais de um grantor para o mesmo par
      // grantee+privilégio, "o último escrito vence" dependeria da ordem de chegada das linhas —
      // e um "GRANT mudou" fantasma apareceria sem mudança real. OR é independente da ordem.
      acl[grantee][item.privilege_type] = (acl[grantee][item.privilege_type] ?? false) || item.is_grantable
    }
    saida.set(oid, acl)
  }
  return saida
}

async function tabelas(client, nomeDeGrantee) {
  const relacoes = await q(client, `
    SELECT c.oid, n.nspname, c.relname, c.relkind,
           c.relrowsecurity AS rls_habilitado, c.relforcerowsecurity AS rls_forcado,
           pg_get_userbyid(c.relowner) AS dono
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1) AND c.relkind IN ('r', 'p')
    ORDER BY n.nspname, c.relname
  `, [SCHEMAS_PROJETO])
  if (relacoes.length === 0) return {}

  const oids = relacoes.map(r => r.oid)
  const [colunas, constraints, indices, triggers, policies, aclMapa] = await Promise.all([
    q(client, `
      SELECT a.attrelid, a.attname, format_type(a.atttypid, a.atttypmod) AS tipo,
             a.attnotnull, pg_get_expr(d.adbin, d.adrelid) AS default_expr,
             a.attidentity, a.attgenerated
      FROM pg_attribute a
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = ANY($1::oid[]) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attrelid, a.attnum
    `, [oids]),
    q(client, `
      SELECT conrelid, conname, pg_get_constraintdef(oid, true) AS definicao
      FROM pg_constraint WHERE conrelid = ANY($1::oid[])
      ORDER BY conrelid, conname
    `, [oids]),
    q(client, `
      SELECT ix.indrelid, ic.relname AS nome, pg_get_indexdef(ix.indexrelid) AS definicao
      FROM pg_index ix JOIN pg_class ic ON ic.oid = ix.indexrelid
      WHERE ix.indrelid = ANY($1::oid[])
      ORDER BY ix.indrelid, ic.relname
    `, [oids]),
    q(client, `
      SELECT tgrelid, tgname, pg_get_triggerdef(oid, true) AS definicao
      FROM pg_trigger WHERE tgrelid = ANY($1::oid[]) AND NOT tgisinternal
      ORDER BY tgrelid, tgname
    `, [oids]),
    q(client, `
      SELECT polrelid, polname,
             CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE'
                         WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' ELSE polcmd::text END AS comando,
             polroles, pg_get_expr(polqual, polrelid) AS using_expr,
             pg_get_expr(polwithcheck, polrelid) AS with_check_expr
      FROM pg_policy WHERE polrelid = ANY($1::oid[])
      ORDER BY polrelid, polname
    `, [oids]),
    aclRelacoes(client, oids, nomeDeGrantee),
  ])

  const colunasPorTabela = agrupar(colunas, l => String(l.attrelid))
  const constraintsPorTabela = agrupar(constraints, l => String(l.conrelid))
  const indicesPorTabela = agrupar(indices, l => String(l.indrelid))
  const triggersPorTabela = agrupar(triggers, l => String(l.tgrelid))
  const policiesPorTabela = agrupar(policies, l => String(l.polrelid))

  const saida = {}
  for (const r of relacoes) {
    const chave = `${r.nspname}.${r.relname}`
    const oidStr = String(r.oid)

    const colunasObj = {}
    for (const c of colunasPorTabela.get(oidStr) ?? []) {
      colunasObj[c.attname] = {
        tipo: c.tipo,
        not_null: c.attnotnull,
        default: c.default_expr,
        identity: c.attidentity === 'a' ? 'ALWAYS' : c.attidentity === 'd' ? 'BY DEFAULT' : null,
        generated: c.attgenerated === 's' ? 'STORED' : null,
      }
    }

    const constraintsObj = {}
    for (const c of constraintsPorTabela.get(oidStr) ?? []) constraintsObj[c.conname] = c.definicao

    const indicesObj = {}
    for (const i of indicesPorTabela.get(oidStr) ?? []) indicesObj[i.nome] = i.definicao

    const triggersObj = {}
    for (const t of triggersPorTabela.get(oidStr) ?? []) triggersObj[t.tgname] = t.definicao

    const policiesObj = {}
    for (const p of policiesPorTabela.get(oidStr) ?? []) {
      policiesObj[p.polname] = {
        comando: p.comando,
        roles: (p.polroles ?? []).map(nomeDeGrantee),
        using: p.using_expr,
        with_check: p.with_check_expr,
      }
    }

    saida[chave] = {
      tipo: r.relkind === 'p' ? 'particionada' : 'tabela',
      dono: r.dono,
      rls_habilitado: r.rls_habilitado,
      rls_forcado: r.rls_forcado,
      colunas: colunasObj,
      constraints: constraintsObj,
      indices: indicesObj,
      policies: policiesObj,
      triggers: triggersObj,
      acl: aclMapa.get(oidStr) ?? {},
    }
  }
  return saida
}

async function views(client, nomeDeGrantee) {
  const relacoes = await q(client, `
    SELECT c.oid, n.nspname, c.relname, c.relkind, c.reloptions, pg_get_userbyid(c.relowner) AS dono
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1) AND c.relkind IN ('v', 'm')
    ORDER BY n.nspname, c.relname
  `, [SCHEMAS_PROJETO])
  if (relacoes.length === 0) return {}

  const oids = relacoes.map(r => r.oid)
  const [defs, aclMapa] = await Promise.all([
    q(client, `SELECT oid, pg_get_viewdef(oid, true) AS definicao FROM pg_class WHERE oid = ANY($1::oid[])`, [oids]),
    aclRelacoes(client, oids, nomeDeGrantee),
  ])
  const defPorOid = new Map(defs.map(d => [String(d.oid), d.definicao]))

  const saida = {}
  for (const r of relacoes) {
    const chave = `${r.nspname}.${r.relname}`
    const oidStr = String(r.oid)
    saida[chave] = {
      // 'v'/'m' distinguem VIEW de MATERIALIZED VIEW — sem isso, um DROP VIEW + CREATE
      // MATERIALIZED VIEW com o MESMO SELECT produz o MESMO hash_definicao e o drift fica
      // invisível (mudança de natureza do objeto, não do texto).
      tipo: r.relkind === 'm' ? 'matview' : 'view',
      dono: r.dono,
      reloptions: r.reloptions ?? null,
      hash_definicao: sha256(defPorOid.get(oidStr) ?? null),
      acl: aclMapa.get(oidStr) ?? {},
    }
  }
  return saida
}

const VOLATILIDADE = { i: 'IMMUTABLE', s: 'STABLE', v: 'VOLATILE' }

async function funcoes(client, nomeDeGrantee) {
  const linhas = await q(client, `
    SELECT p.oid, n.nspname, p.proname, ${ARGS_POR_FORMAT_TYPE} AS args,
           format_type(p.prorettype, NULL) AS retorno,
           l.lanname AS linguagem, p.prosecdef AS security_definer, p.provolatile,
           p.proconfig, pg_get_userbyid(p.proowner) AS dono, p.prosrc, p.proacl
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = ANY($1) AND p.prokind = 'f'
    ORDER BY n.nspname, p.proname, args
  `, [SCHEMAS_PROJETO])
  if (linhas.length === 0) return {}

  const oids = linhas.map(l => l.oid)
  const aclLinhas = await q(client, `
    SELECT p.oid AS alvo_oid, e.grantee, e.privilege_type, e.is_grantable
    FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(p.proacl) e
    WHERE p.oid = ANY($1::oid[]) AND p.proacl IS NOT NULL
    ORDER BY p.oid, e.grantee, e.privilege_type, e.grantor
  `, [oids])
  const aclMapa = construirMapaAcl(aclLinhas, nomeDeGrantee)

  const saida = {}
  for (const l of linhas) {
    const chave = `${l.nspname}.${l.proname}(${l.args})`
    saida[chave] = {
      retorno: l.retorno,
      linguagem: l.linguagem,
      security_definer: l.security_definer,
      volatilidade: VOLATILIDADE[l.provolatile] ?? l.provolatile,
      proconfig: l.proconfig ?? [],
      dono: l.dono,
      hash_corpo: sha256(l.prosrc),
      acl: aclMapa.get(String(l.oid)) ?? {},
    }
  }
  return saida
}

async function cronJobs(client) {
  const linhas = await q(client, `
    SELECT jobname, schedule, active, username, database, command
    FROM cron.job ORDER BY jobname
  `)
  const saida = {}
  for (const l of linhas) {
    saida[l.jobname] = {
      schedule: l.schedule,
      active: l.active,
      username: l.username,
      database: l.database,
      hash_comando: sha256(l.command),
    }
  }
  return saida
}

const TIPO_OBJETO_DEFAULT_ACL = { r: 'tabela', S: 'sequence', f: 'funcao', T: 'tipo', n: 'schema' }

async function defaultAcl(client, nomeDeGrantee) {
  const linhas = await q(client, `
    SELECT coalesce(n.nspname, '*global*') AS schema, d.defaclobjtype,
           pg_get_userbyid(d.defaclrole) AS dono, e.grantee, e.privilege_type
    FROM pg_default_acl d
    LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) e
    WHERE d.defaclnamespace = 0 OR n.nspname = ANY($1)
    ORDER BY 1, 2, 3
  `, [SCHEMAS_PROJETO])

  const saida = {}
  for (const l of linhas) {
    const tipo = TIPO_OBJETO_DEFAULT_ACL[l.defaclobjtype] ?? l.defaclobjtype
    const grantee = nomeDeGrantee(l.grantee)
    saida[l.schema] ??= {}
    saida[l.schema][tipo] ??= {}
    saida[l.schema][tipo][grantee] ??= []
    if (!saida[l.schema][tipo][grantee].includes(l.privilege_type)) {
      saida[l.schema][tipo][grantee].push(l.privilege_type)
    }
  }
  return saida
}

/** Assinaturas (schema.nome(tipos)) dos schemas do projeto — usado como universo para a
 *  allowlist efetiva de cada credencial de máquina. */
async function assinaturasDoProjeto(client) {
  const linhas = await q(client, `
    SELECT n.nspname, p.proname, p.oid, ${ARGS_POR_FORMAT_TYPE} AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ANY($1) AND p.prokind = 'f'
  `, [SCHEMAS_PROJETO])
  return linhas.map(l => ({ oid: l.oid, assinatura: `${l.nspname}.${l.proname}(${l.args})` }))
}

async function roles(client, assinaturas) {
  const atributos = await q(client, `
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
           rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
    FROM pg_roles WHERE rolname = ANY($1)
  `, [ROLES_MAQUINA])
  const existentes = new Set(atributos.map(a => a.rolname))

  const [membroDe, temComoMembros, configLinhas] = await Promise.all([
    q(client, `
      SELECT r1.rolname AS papel, r2.rolname AS grupo
      FROM pg_auth_members m
      JOIN pg_roles r1 ON r1.oid = m.member
      JOIN pg_roles r2 ON r2.oid = m.roleid
      WHERE r1.rolname = ANY($1)
    `, [ROLES_MAQUINA]),
    q(client, `
      SELECT r2.rolname AS papel, r1.rolname AS membro
      FROM pg_auth_members m
      JOIN pg_roles r1 ON r1.oid = m.member
      JOIN pg_roles r2 ON r2.oid = m.roleid
      WHERE r2.rolname = ANY($1)
    `, [ROLES_MAQUINA]),
    q(client, `
      SELECT r.rolname AS papel, s.setconfig
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      WHERE r.rolname = ANY($1)
    `, [ROLES_MAQUINA]),
  ])

  const saida = {}
  for (const nome of ROLES_MAQUINA) {
    if (!existentes.has(nome)) { saida[nome] = null; continue }
    const a = atributos.find(x => x.rolname === nome)
    const grupos = membroDe.filter(x => x.papel === nome).map(x => x.grupo)
    const membros = temComoMembros.filter(x => x.papel === nome).map(x => x.membro)
    const configs = configLinhas.filter(x => x.papel === nome).flatMap(x => x.setconfig ?? [])

    // Uma query só para as ~centenas de assinaturas do projeto (evita N+1 de rede) —
    // has_function_privilege é avaliada POR LINHA pelo motor, dentro de uma única ida.
    const oids = assinaturas.map(x => x.oid)
    const permissoes = oids.length === 0 ? [] : await q(client, `
      SELECT t.oid, has_function_privilege($1::regrole, t.oid, 'EXECUTE') AS pode
      FROM unnest($2::oid[]) AS t(oid)
    `, [nome, oids])
    const podeExecutar = new Set(permissoes.filter(p => p.pode).map(p => String(p.oid)))
    const allowlist = assinaturas.filter(a => podeExecutar.has(String(a.oid))).map(a => a.assinatura)

    saida[nome] = {
      atributos: {
        rolsuper: a.rolsuper, rolinherit: a.rolinherit, rolcreaterole: a.rolcreaterole,
        rolcreatedb: a.rolcreatedb, rolcanlogin: a.rolcanlogin, rolreplication: a.rolreplication,
        rolbypassrls: a.rolbypassrls, rolconnlimit: a.rolconnlimit,
      },
      membro_de: grupos,
      tem_como_membros: membros,
      configuracoes: configs,
      allowlist,
    }
  }
  return saida
}

/** Atributos, membership e configurações dos papéis da plataforma (ver `ROLES_PLATAFORMA`). */
async function rolesPlataforma(client) {
  const atributos = await q(client, `
    SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
           rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
    FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname
  `, [ROLES_PLATAFORMA])
  const membroDe = await q(client, `
    SELECT r1.rolname AS papel, r2.rolname AS grupo
    FROM pg_auth_members m
    JOIN pg_roles r1 ON r1.oid = m.member
    JOIN pg_roles r2 ON r2.oid = m.roleid
    WHERE r1.rolname = ANY($1) ORDER BY 1, 2
  `, [ROLES_PLATAFORMA])
  const configLinhas = await q(client, `
    SELECT r.rolname AS papel, s.setconfig
    FROM pg_db_role_setting s
    JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = ANY($1) ORDER BY 1
  `, [ROLES_PLATAFORMA])

  const saida = {}
  for (const nome of ROLES_PLATAFORMA) {
    const a = atributos.find(x => x.rolname === nome)
    if (!a) { saida[nome] = null; continue }
    saida[nome] = {
      atributos: {
        rolsuper: a.rolsuper, rolinherit: a.rolinherit, rolcreaterole: a.rolcreaterole,
        rolcreatedb: a.rolcreatedb, rolcanlogin: a.rolcanlogin, rolreplication: a.rolreplication,
        rolbypassrls: a.rolbypassrls, rolconnlimit: a.rolconnlimit,
      },
      membro_de: membroDe.filter(x => x.papel === nome).map(x => x.grupo),
      configuracoes: configLinhas.filter(x => x.papel === nome).flatMap(x => x.setconfig ?? []),
    }
  }
  return saida
}

/**
 * Retrato estruturado do catálogo de PRODUÇÃO — só as partes do banco que são DO PROJETO.
 * `client` já conectado e travado READ ONLY pelo chamador (skill banco-e-rpc §6).
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} client
 * @returns {Promise<Snapshot>}
 */
export async function snapshotCatalogo(client) {
  // `search_path` FIXO antes de qualquer deparse (achado MÉDIO do `revisor`): `pg_get_viewdef`,
  // `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef` e `pg_get_expr` qualificam o
  // schema de um nome CONFORME o search_path da sessão. Sem fixar, um search_path diferente entre
  // gerar e comparar mudaria hashes e textos sem nenhuma mudança real de definição — o
  // falso-positivo mais caro de diagnosticar. `pg_catalog` puro = todo nome do projeto sai
  // qualificado. Fica AQUI (fonte única), não em cada chamador. `SET` não é escrita: vale sob a
  // trava READ ONLY.
  await q(client, 'SET search_path TO pg_catalog')
  const nomeDeGrantee = await mapaRoles(client)
  const assinaturas = await assinaturasDoProjeto(client)

  const [
    ultima_migration, schemas_nao_sistema, extensoesObj, tabelasObj, viewsObj, funcoesObj,
    cron, default_acl, rolesObj, rolesPlataformaObj,
  ] = await Promise.all([
    ultimaMigration(client),
    schemasNaoSistema(client),
    extensoes(client),
    tabelas(client, nomeDeGrantee),
    views(client, nomeDeGrantee),
    funcoes(client, nomeDeGrantee),
    cronJobs(client),
    defaultAcl(client, nomeDeGrantee),
    roles(client, assinaturas),
    rolesPlataforma(client),
  ])

  return {
    ultima_migration,
    schemas_nao_sistema,
    extensoes: extensoesObj,
    tabelas: tabelasObj,
    views: viewsObj,
    funcoes: funcoesObj,
    roles: rolesObj,
    roles_plataforma: rolesPlataformaObj,
    default_acl,
    cron,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Comparador — puro, sem I/O. Recursivo: caminho de chaves vira a mensagem legível.
// ═══════════════════════════════════════════════════════════════════════════════════════

function schemasNaoDeclarados(lista) {
  return (lista ?? []).filter(s => !SCHEMAS_PROJETO.includes(s) && !SCHEMAS_EXCLUIDOS.includes(s))
}

function ehObjetoPlano(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Campos cujo VALOR é um hash — mostrar "hash mudou", nunca o hex (ilegível no diff). */
const CAMPOS_HASH = new Set(['hash_corpo', 'hash_definicao', 'hash_comando'])

function diffValor(esperado, vivo, caminho, diffs) {
  if (esperado === vivo) return
  if (JSON.stringify(esperado) === JSON.stringify(vivo)) return

  const chaveFinal = caminho.split('.').pop()?.replace(/\[.*$/, '')
  if (CAMPOS_HASH.has(chaveFinal) && esperado !== null && vivo !== null) {
    diffs.push(`${caminho}: hash mudou`)
    return
  }

  const okObjE = ehObjetoPlano(esperado)
  const okObjV = ehObjetoPlano(vivo)

  if (okObjE && okObjV) {
    const chaves = new Set([...Object.keys(esperado), ...Object.keys(vivo)])
    for (const chave of [...chaves].sort()) {
      const caminhoFilho = caminho ? `${caminho}.${chave}` : chave
      const temE = Object.prototype.hasOwnProperty.call(esperado, chave)
      const temV = Object.prototype.hasOwnProperty.call(vivo, chave)
      if (!temE) { diffs.push(`${caminhoFilho}: presente no vivo, ausente no baseline`); continue }
      if (!temV) { diffs.push(`${caminhoFilho}: ausente no vivo, presente no baseline`); continue }
      diffValor(esperado[chave], vivo[chave], caminhoFilho, diffs)
    }
    return
  }

  if (okObjE && vivo === null) { diffs.push(`${caminho}: presente no baseline, ausente no vivo`); return }
  if (okObjV && esperado === null) { diffs.push(`${caminho}: presente no vivo, ausente no baseline`); return }

  if (Array.isArray(esperado) && Array.isArray(vivo)) {
    // Todos os arrays do retrato são CONJUNTOS (roles de policy, allowlist, proconfig,
    // schemas_nao_sistema...) — diff ELEMENTO A ELEMENTO, nunca as duas listas inteiras lado a
    // lado (uma allowlist de ~50 assinaturas numa linha só não é "LEGÍVEL", é uma parede).
    const setE = new Set(esperado.map(x => JSON.stringify(x)))
    const setV = new Set(vivo.map(x => JSON.stringify(x)))
    for (const item of setV) if (!setE.has(item)) diffs.push(`${caminho}: presente no vivo, ausente no baseline: ${item}`)
    for (const item of setE) if (!setV.has(item)) diffs.push(`${caminho}: ausente no vivo, presente no baseline: ${item}`)
    return
  }

  diffs.push(`${caminho}: ${JSON.stringify(esperado)} → ${JSON.stringify(vivo)}`)
}

/**
 * Compara dois retratos (o commitado × o vivo, ou vivo × vivo mutado em teste) e devolve a
 * lista de diferenças LEGÍVEIS. Vazio ⇒ idêntico. Pura e determinística — nenhum I/O aqui.
 * @param {Snapshot} esperado
 * @param {Snapshot} vivo
 * @returns {string[]}
 */
export function compararBaseline(esperado, vivo) {
  const diffs = []
  for (const [rotulo, snap] of [['baseline', esperado], ['vivo', vivo]]) {
    for (const schema of schemasNaoDeclarados(snap?.schemas_nao_sistema)) {
      diffs.push(
        `schema ${schema} (${rotulo}) não está declarado em SCHEMAS_PROJETO nem em ` +
        'SCHEMAS_EXCLUIDOS — classifique-o em scripts/schema-baseline/snapshot.mjs',
      )
    }
  }
  diffValor(esperado, vivo, '', diffs)
  return [...new Set(diffs)]
}

/** Canonicaliza para serialização estável (chaves ordenadas, arrays de primitivo ordenados) —
 *  usado só na hora de ESCREVER o arquivo; a comparação acima já é independente de ordem. */
export function ordenarChavesRecursivo(valor) {
  if (Array.isArray(valor)) {
    return [...valor.map(ordenarChavesRecursivo)].sort((a, b) => (a > b ? 1 : a < b ? -1 : 0))
  }
  if (ehObjetoPlano(valor)) {
    const saida = {}
    for (const chave of Object.keys(valor).sort()) saida[chave] = ordenarChavesRecursivo(valor[chave])
    return saida
  }
  return valor
}
