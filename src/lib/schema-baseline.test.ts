import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// .mjs sem .d.ts, mas com JSDoc (@typedef Snapshot etc.) — allowJs infere o shape a partir
// desses comentários, então Awaited<ReturnType<typeof snapshotCatalogo>> abaixo é um tipo
// CONCRETO (não `any`), e o arquivo não precisa de `as any` em lugar nenhum.
import {
  snapshotCatalogo,
  compararBaseline,
  SCHEMAS_PROJETO,
  SCHEMAS_EXCLUIDOS,
} from '../../scripts/schema-baseline/snapshot.mjs'

// ── Baseline de schema versionado + teste de drift (v6.0.0/M8, briefing §5.H) ──────────────
//
// UM MÓDULO SÓ gera e compara (scripts/schema-baseline/snapshot.mjs) — este arquivo só
// EXERCITA esse módulo, nunca reimplementa uma query paralela (é o defeito que a missão existe
// para evitar: gerador e comparador com fontes diferentes de verdade).
//
// Offline (sempre roda): compararBaseline é pura — cada classe de diferença nomeada por um
// fixture construído à mão. Vivo (skipIf, READ ONLY): compara o catálogo vivo contra o arquivo
// commitado, prova que um drift SINTÉTICO (mutação em memória) é nomeado, e prova que o retrato
// enxerga o POSITIVO (query vazia não pode passar verde).
//
// Só `pg` READ ONLY (catálogo, via SUPABASE_DB_URL) — declarado em `sonda-teste-escreve-banco`
// (SOMENTE_LEITURA) e em `sonda-skipif-silencioso` (envs). Molde de conexão idêntico ao de
// `sonda-leitores-vendas-excel.test.ts` (createRequire, sem `require(` literal).

const RAIZ_REPO = fileURLToPath(new URL('../../', import.meta.url))
const CAMINHO_BASELINE = join(RAIZ_REPO, 'supabase', 'baseline', 'schema-v6.json')

const DB_URL = process.env.SUPABASE_DB_URL
const ON = Boolean(DB_URL)

type Snapshot = Awaited<ReturnType<typeof snapshotCatalogo>>

async function abrirConexaoReadOnly() {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const cliente = new pg.Client({ connectionString: DB_URL })
  await cliente.connect()
  await cliente.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
  return cliente
}

async function obterVivo(): Promise<Snapshot> {
  const cliente = await abrirConexaoReadOnly()
  try {
    return await snapshotCatalogo(cliente)
  } finally {
    await cliente.end()
  }
}

/** Lê o arquivo commitado — FALHA com mensagem clara se ele ainda não existir (nunca pula em
 *  silêncio: é o mesmo defeito que sonda-skipif-silencioso existe para impedir, v5.4.3). */
function lerBaselineCommitado(): Snapshot {
  if (!existsSync(CAMINHO_BASELINE)) {
    throw new Error(
      `${CAMINHO_BASELINE} não existe. Gere com \`npm run db:baseline\` e commite o arquivo antes de rodar este teste.`,
    )
  }
  return JSON.parse(readFileSync(CAMINHO_BASELINE, 'utf8'))
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// Fixtures — um retrato mínimo, mas com um exemplo de cada classe do catálogo, para o
// comparador ter o que comparar sem precisar de banco.
// ═══════════════════════════════════════════════════════════════════════════════════════

function fixtureBase(): Snapshot {
  return {
    ultima_migration: '0283',
    schemas_nao_sistema: ['analytics', 'app', 'public', 'raw'],
    extensoes: { pgcrypto: '1.3' },
    tabelas: {
      'raw.vendas_excel': {
        tipo: 'tabela',
        dono: 'postgres',
        rls_habilitado: true,
        rls_forcado: false,
        colunas: {
          venda_numero: { tipo: 'text', not_null: true, default: null, identity: null, generated: null },
          setor_macro: { tipo: 'text', not_null: false, default: null, identity: null, generated: null },
        },
        constraints: {},
        indices: {},
        policies: {
          p_leitura: { comando: 'SELECT', roles: ['authenticated'], using: 'true', with_check: null },
        },
        triggers: {},
        acl: { service_role: { SELECT: false } },
      },
    },
    views: {
      'analytics.vendas_excel_para_fato': {
        tipo: 'view', dono: 'postgres', reloptions: null, hash_definicao: 'hash-view-aaa', acl: {},
      },
    },
    funcoes: {
      'public.promover_carga_vendas(jsonb, uuid)': {
        retorno: 'jsonb', linguagem: 'plpgsql', security_definer: true, volatilidade: 'VOLATILE',
        proconfig: ['search_path='], dono: 'postgres', hash_corpo: 'hash-fn-bbb',
        acl: { service_role: { EXECUTE: false } },
      },
    },
    roles: {
      verificador: {
        atributos: {
          rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false,
          rolcanlogin: false, rolreplication: false, rolbypassrls: false, rolconnlimit: -1,
        },
        membro_de: [], tem_como_membros: [], configuracoes: ['statement_timeout=8s'],
        allowlist: ['public.get_saldo_caixa()'],
      },
      ingestor: {
        atributos: {
          rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false,
          rolcanlogin: false, rolreplication: false, rolbypassrls: false, rolconnlimit: -1,
        },
        membro_de: [], tem_como_membros: [], configuracoes: [],
        allowlist: ['public.promover_carga_vendas(jsonb, uuid)'],
      },
    },
    roles_plataforma: {
      authenticated: {
        atributos: {
          rolsuper: false, rolinherit: true, rolcreaterole: false, rolcreatedb: false,
          rolcanlogin: false, rolreplication: false, rolbypassrls: false, rolconnlimit: -1,
        },
        membro_de: [], configuracoes: ['statement_timeout=8s', 'TimeZone=America/Sao_Paulo'],
      },
    },
    default_acl: {},
    cron: {
      'ingestao-vigia': {
        schedule: '*/15 * * * *', active: false, username: 'postgres', database: 'postgres',
        hash_comando: 'hash-cron-ccc',
      },
    },
  }
}

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

describe('compararBaseline — offline, pura (cada classe de diferença nomeada)', () => {
  it('dois retratos idênticos ⇒ lista vazia', () => {
    expect(compararBaseline(fixtureBase(), clonar(fixtureBase()))).toEqual([])
  })

  it('coluna A MAIS no vivo é nomeada', () => {
    const vivo = clonar(fixtureBase())
    vivo.tabelas['raw.vendas_excel'].colunas.zz_coluna_nova = { tipo: 'text', not_null: false, default: null, identity: null, generated: null }
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('raw.vendas_excel') && d.includes('zz_coluna_nova') && d.includes('presente no vivo'))).toBe(true)
  })

  it('coluna A MENOS no vivo é nomeada', () => {
    const vivo = clonar(fixtureBase())
    delete vivo.tabelas['raw.vendas_excel'].colunas.setor_macro
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('raw.vendas_excel') && d.includes('setor_macro') && d.includes('ausente no vivo'))).toBe(true)
  })

  it('tipo de coluna mudado é nomeado', () => {
    const vivo = clonar(fixtureBase())
    vivo.tabelas['raw.vendas_excel'].colunas.venda_numero.tipo = 'varchar'
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('venda_numero') && d.includes('tipo') && d.includes('text') && d.includes('varchar'))).toBe(true)
  })

  it('função NOVA no vivo é nomeada', () => {
    const vivo = clonar(fixtureBase())
    vivo.funcoes['public.fn_nova()'] = {
      retorno: 'void', linguagem: 'sql', security_definer: false, volatilidade: 'VOLATILE',
      proconfig: [], dono: 'postgres', hash_corpo: 'x', acl: {},
    }
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('public.fn_nova()') && d.includes('presente no vivo'))).toBe(true)
  })

  it('função SUMIDA no vivo é nomeada', () => {
    const vivo = clonar(fixtureBase())
    delete vivo.funcoes['public.promover_carga_vendas(jsonb, uuid)']
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('promover_carga_vendas') && d.includes('ausente no vivo'))).toBe(true)
  })

  it('hash do corpo de função mudado é nomeado (sem vazar o hex no diff)', () => {
    const vivo = clonar(fixtureBase())
    vivo.funcoes['public.promover_carga_vendas(jsonb, uuid)'].hash_corpo = 'hash-fn-DIFERENTE'
    const diffs = compararBaseline(fixtureBase(), vivo)
    const linha = diffs.find(d => d.includes('promover_carga_vendas') && d.includes('hash_corpo'))
    expect(linha).toBeDefined()
    expect(linha).toContain('hash mudou')
    expect(linha).not.toContain('hash-fn-bbb')
  })

  it('GRANT a MAIS (role nova no ACL) é nomeado', () => {
    const vivo = clonar(fixtureBase())
    vivo.funcoes['public.promover_carga_vendas(jsonb, uuid)'].acl.authenticated = { EXECUTE: false }
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('acl.authenticated') && d.includes('presente no vivo'))).toBe(true)
  })

  it('GRANT a MENOS (role removida do ACL) é nomeado', () => {
    const vivo = clonar(fixtureBase())
    delete vivo.funcoes['public.promover_carga_vendas(jsonb, uuid)'].acl.service_role
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('acl.service_role') && d.includes('ausente no vivo'))).toBe(true)
  })

  it('cron active mudado é nomeado', () => {
    const vivo = clonar(fixtureBase())
    vivo.cron['ingestao-vigia'].active = true
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('ingestao-vigia') && d.includes('active') && d.includes('false') && d.includes('true'))).toBe(true)
  })

  it('policy mudada (using) é nomeada', () => {
    const vivo = clonar(fixtureBase())
    vivo.tabelas['raw.vendas_excel'].policies.p_leitura.using = 'false'
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('p_leitura') && d.includes('using'))).toBe(true)
  })

  it('chave com valor null × chave AUSENTE são diferentes, e a diferença é nomeada', () => {
    // Default de coluna que passa de NULL (sem default) a "não reportado" é mudança de forma do
    // retrato, não de valor — o comparador não pode tratar `null` e ausente como iguais.
    const vivo = clonar(fixtureBase())
    const coluna = vivo.tabelas['raw.vendas_excel'].colunas.setor_macro as unknown as Record<string, unknown>
    delete coluna.default
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('setor_macro') && d.includes('default'))).toBe(true)
  })

  it('schema NOVO não declarado em nenhuma das duas listas é reprovado', () => {
    const vivo = clonar(fixtureBase())
    vivo.schemas_nao_sistema.push('schema_fantasma_teste')
    const diffs = compararBaseline(fixtureBase(), vivo)
    expect(diffs.some(d => d.includes('schema_fantasma_teste') && d.includes('não está declarado'))).toBe(true)
    // as duas listas fixas do módulo continuam sem intersecção com o schema fantasma
    expect(SCHEMAS_PROJETO.includes('schema_fantasma_teste')).toBe(false)
    expect(SCHEMAS_EXCLUIDOS.includes('schema_fantasma_teste')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════
// Vivo — só com SUPABASE_DB_URL. Conexão direta, READ ONLY, catálogo apenas.
// ═══════════════════════════════════════════════════════════════════════════════════════

describe.skipIf(!ON)('schema-baseline — catálogo vivo × arquivo commitado (v6.0.0/M8)', () => {
  it('o catálogo vivo bate com supabase/baseline/schema-v6.json — zero diferenças', async () => {
    const baseline = lerBaselineCommitado()
    const vivo = await obterVivo()
    const diffs = compararBaseline(baseline, vivo)
    expect(
      diffs,
      'Drift entre o catálogo vivo e o baseline commitado (supabase/baseline/schema-v6.json):\n' +
      `${diffs.join('\n')}\n\n` +
      'Aplicou migration? Regenere com `npm run db:baseline` e commite o arquivo junto (ADR-0173).',
    ).toEqual([])
  })

  it('drift SINTÉTICO (3 mutações em memória a partir do vivo) é nomeado, cada uma', async () => {
    const baseline = lerBaselineCommitado()
    const vivoOriginal = await obterVivo()
    const mutado = clonar(vivoOriginal)

    // 1) coluna a mais em raw.vendas_excel
    if (!mutado.tabelas['raw.vendas_excel']) throw new Error('raw.vendas_excel ausente do catálogo vivo — pré-condição do teste')
    mutado.tabelas['raw.vendas_excel'].colunas.zz_coluna_sintetica_m8 = {
      tipo: 'text', not_null: false, default: null, identity: null, generated: null,
    }

    // 2) GRANT a menos do ingestor em public.promover_carga_vendas(jsonb, uuid)
    const assinaturaAlvo = 'public.promover_carga_vendas(jsonb, uuid)'
    const roleIngestor = mutado.roles.ingestor
    if (!roleIngestor) throw new Error('role ingestor ausente do catálogo vivo — pré-condição do teste')
    roleIngestor.allowlist = roleIngestor.allowlist.filter((a) => a !== assinaturaAlvo)

    // 3) active invertido no cron ingestao-vigia
    if (!mutado.cron['ingestao-vigia']) throw new Error('cron ingestao-vigia ausente do catálogo vivo — pré-condição do teste')
    mutado.cron['ingestao-vigia'].active = !mutado.cron['ingestao-vigia'].active

    const diffs = compararBaseline(baseline, mutado)
    expect(diffs.some(d => d.includes('zz_coluna_sintetica_m8'))).toBe(true)
    // "nomear CADA uma" — a assinatura removida tem de aparecer na linha, não só as palavras
    // soltas "ingestor"/"allowlist" (que casariam com qualquer ruído no mesmo caminho).
    expect(diffs.some(d => d.includes('ingestor') && d.includes('allowlist') && d.includes(assinaturaAlvo))).toBe(true)
    expect(diffs.some(d => d.includes('ingestao-vigia') && d.includes('active'))).toBe(true)
  })

  it('a sonda ENXERGA o exemplo positivo — senão não vale nada (query vazia não pode passar verde)', async () => {
    const vivo = await obterVivo()
    expect(vivo.tabelas['raw.vendas_excel']).toBeDefined()
    expect(vivo.tabelas['raw.vendas_excel'].colunas.setor_macro).toBeDefined()
    expect(vivo.roles.ingestor?.allowlist ?? []).toContain('public.promover_carga_vendas(jsonb, uuid)')
    // Presença, não valor: o ESTADO do cron (hoje inativo, 0280) já é cobrado pelo teste acima,
    // contra o baseline. Cravar `false` aqui faria este teste quebrar na ativação da M9 sem
    // defeito nenhum — a ativação muda o baseline (regenerar), não a prova de visibilidade.
    expect(typeof vivo.cron['ingestao-vigia']?.active).toBe('boolean')
    // Papéis da plataforma: o `statement_timeout` por role (skill banco-e-rpc §3) tem de aparecer.
    expect((vivo.roles_plataforma.authenticated?.configuracoes ?? []).some((c) => c.startsWith('statement_timeout='))).toBe(true)
    const algumaPolicy = Object.values(vivo.tabelas).some(
      (t) => Object.keys(t.policies ?? {}).length > 0,
    )
    expect(algumaPolicy).toBe(true)
  })
})
