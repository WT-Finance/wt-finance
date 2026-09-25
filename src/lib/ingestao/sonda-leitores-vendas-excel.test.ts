import { describe, it, expect } from 'vitest'

// ── Sonda: nenhum leitor NOVO de raw.vendas_excel escapa do filtro Welcome (v6.0.0/M7a) ──
// A 0277 (M5) pôs `setor_macro IS DISTINCT FROM 'Welcome'` numa view
// (`analytics.vendas_excel_para_fato`) e trocou só `transform_raw_to_analytics()` para lê-la. A
// 0283 (M7a) repontou os outros seis leitores que existiam no catálogo vivo em 25/09/2026
// (anexo v6.0.0/M7 §2). Esta sonda é o enforcement mecânico que impede um SÉTIMO leitor de nascer
// direto sobre `raw.vendas_excel` sem passar pela view — ela lê o CATÁLOGO VIVO (`pg_proc.prosrc`,
// `pg_get_viewdef`), não o texto das migrations, porque é o catálogo que decide o que roda.
//
// ⚠️ ESTA SONDA REPROVA DE PROPÓSITO até a 0283 ser aplicada: antes dela, os seis objetos abaixo
// (regenerar_dim_operacao_weddings, contar_convidados_operacao, get_carteira_weddings__nucleo,
// get_operacao_weddings__nucleo, get_operacoes_weddings__nucleo, vw_vendas_agregadas) ainda leem
// `raw.vendas_excel` diretamente e não estão na lista fechada — é o estado esperado ANTES da
// migration ser empurrada, não um defeito desta sonda.
//
// `public.inserir_lote_raw(jsonb)`, `public.promover_carga_vendas()` (assinatura zero-arg),
// `public.validar_carga_staging()` e `public.truncate_dynamic_tables()` são LEGADO previsto para
// sair no GATE 3 (M10, skill ingestao-planilhas §5 — "RPCs do caminho destrutivo antigo... só
// porque `npm run seed` ainda as usa"). Quando saírem, a lista fechada ABAIXO encolhe junto —
// não é para "já tirar agora" nesta sonda, que só enumera o que está vivo hoje no catálogo.
//
// O PADRÃO de busca casa `raw\.vendas_excel` seguido de FIM-DE-PALAVRA (não `[a-z0-9_]`), não
// substring solta — sem isso, `raw.vendas_excel_staging` (um nome DIFERENTE) casaria também, e
// `inserir_lote_staging`/`limpar_staging_vendas` (que só tocam a STAGING, nunca a tabela crua)
// entrariam na enumeração por um acidente de nome, não por lerem a tabela que este filtro protege.
// Mesmo assim os dois estão na lista fechada abaixo — são escritores do mesmo pipeline e é
// inofensivo declará-los ainda que nunca apareçam na enumeração hoje.
//
// `transform_raw_to_analytics()` NÃO entra na lista fechada, de propósito: desde a 0277 seu corpo
// já não cita `raw.vendas_excel` (só a view) — pré-allowlistá-lo cegaria esta sonda para a MESMA
// classe de regressão que a skill banco-e-rpc §5 documenta ("CREATE OR REPLACE a partir da
// migration errada perde o que o catálogo vivo tinha, em silêncio"): se o corpo dele um dia voltar
// a citar a tabela crua, é exatamente isso que esta sonda deve pegar.
//
// Só `pg` READ ONLY (catálogo). Declarado em `sonda-teste-escreve-banco` (SOMENTE_LEITURA) e em
// `sonda-skipif-silencioso` (envs) — molde de `credencial-ingestor.test.ts`.

const DB_URL = process.env.SUPABASE_DB_URL
const ON = Boolean(DB_URL)

/**
 * Lista FECHADA de objetos autorizados a citar `raw.vendas_excel` no corpo/definição: os
 * escritores/carregadores do pipeline de Vendas (nunca tocados por esta missão — "não fazer" da
 * delegação) + a PRÓPRIA view do filtro (a definição dela É `SELECT * FROM raw.vendas_excel
 * WHERE ...` — citar a tabela é o motivo dela existir). Identificador no formato
 * `schema.nome(tipos dos parâmetros, na ordem, via format_type)` para função — SEM nome de
 * parâmetro nem DEFAULT, que é o que `pg_get_function_identity_arguments` incluiria e faria a
 * chave nunca bater — ou `schema.nome` para view/matview.
 */
const OBJETOS_LEGITIMOS: Record<string, string> = {
  'public.inserir_lote_raw(jsonb)':
    'INSERT INTO raw.vendas_excel — carregador do caminho LEGADO (0107); só `npm run seed` chama (skill ingestao-planilhas §5); candidato a sair no GATE 3 (M10)',
  'public.inserir_lote_staging(jsonb)':
    'só toca raw.vendas_excel_staging (nunca a tabela crua) — declarado por ser o mesmo pipeline; não deve aparecer na enumeração hoje',
  'public.limpar_staging_vendas()':
    'só toca raw.vendas_excel_staging (nunca a tabela crua) — declarado por ser o mesmo pipeline; não deve aparecer na enumeração hoje',
  'public.validar_carga_staging()':
    'compara o preenchimento de operacao_propria da staging contra a base viva (`FROM raw.vendas_excel`, 0135) — LEGADO previsto para sair no GATE 3 (M10)',
  'public.truncate_dynamic_tables()':
    'TRUNCATE ... raw.vendas_excel — só `npm run seed` chama (0035); LEGADO previsto para sair no GATE 3 (M10)',
  'public.promover_carga_vendas()':
    'TRUNCATE + INSERT INTO raw.vendas_excel a partir da staging — assinatura ZERO-ARG LEGADA (0135); só o seed chama; candidata a sair no GATE 3 (M10)',
  'public.promover_carga_vendas(jsonb, uuid)':
    'TRUNCATE + INSERT INTO raw.vendas_excel, mais FROM raw.vendas_excel r (checksum pós-gravação) — assinatura NOVA do pipeline vivo (0278, v6.0.0/M5)',
  'analytics.vendas_excel_para_fato':
    'a PRÓPRIA view do filtro Welcome (0277) — sua definição É `SELECT * FROM raw.vendas_excel WHERE setor_macro IS DISTINCT FROM \'Welcome\'`; citar a tabela é o motivo dela existir',
}

async function abrirConexaoReadOnly() {
  const { createRequire } = await import('node:module')
  const pg = createRequire(process.cwd() + '/')('pg')
  const cliente = new pg.Client({ connectionString: DB_URL })
  await cliente.connect()
  await cliente.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
  return cliente
}

// Fronteira de palavra dos DOIS lados de `vendas_excel`: início/fim da string OU um caractere que
// não é letra/dígito/underscore. Sem ela, `raw.vendas_excel_staging` e a própria view
// `analytics.vendas_excel_para_fato` (nomes DIFERENTES) casariam também.
//
// O schema NÃO entra no padrão de propósito (achado MÉDIO do `revisor-db` na M7a): procurar só
// `raw.vendas_excel` deixaria escapar `"raw"."vendas_excel"` (identificador entre aspas) e, pior,
// um leitor com `SET search_path TO raw, …` que escreva `FROM vendas_excel` sem qualificar — a
// convenção `search_path TO ''` do projeto não é vigiada por sonda nenhuma. O preço é um falso
// positivo se algum corpo citar o nome num comentário ou string: aparece na lista e se decide lá.
const FRONTEIRA = "[^_[:alnum:]]"
const PADRAO_RAW_VENDAS_EXCEL = `(^|${FRONTEIRA})vendas_excel($|${FRONTEIRA})`

/** Enumera, no catálogo VIVO, toda função e toda view/matview cujo corpo/definição cita
 *  `raw.vendas_excel` (fim de palavra, não substring de `raw.vendas_excel_staging`), fora de
 *  `pg_catalog`/`information_schema`. Identificador de função por TIPOS (format_type), não por
 *  `pg_get_function_identity_arguments` (que inclui nome de parâmetro e DEFAULT e nunca bateria
 *  com as chaves só-tipo de OBJETOS_LEGITIMOS). */
async function leitoresDeVendasExcel(): Promise<string[]> {
  const cliente = await abrirConexaoReadOnly()
  try {
    const funcoes = (await cliente.query(`
      SELECT n.nspname || '.' || p.proname || '(' ||
             coalesce((
               SELECT string_agg(format_type(a.tipo, NULL), ', ' ORDER BY a.ord)
                 -- unnest(oidvector) é overload nativo do Postgres (não precisa de cast p/ oid[]).
               FROM unnest(p.proargtypes) WITH ORDINALITY AS a(tipo, ord)
             ), '') || ')' AS obj
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND p.prosrc ~ $1
    `, [PADRAO_RAW_VENDAS_EXCEL])) as { rows: Array<{ obj: string }> }

    const views = (await cliente.query(`
      SELECT n.nspname || '.' || cl.relname AS obj
        FROM pg_class cl
        JOIN pg_namespace n ON n.oid = cl.relnamespace
       WHERE cl.relkind IN ('v', 'm')
         AND n.nspname NOT IN ('pg_catalog', 'information_schema')
         AND pg_get_viewdef(cl.oid) ~ $1
    `, [PADRAO_RAW_VENDAS_EXCEL])) as { rows: Array<{ obj: string }> }

    return [...funcoes.rows.map(r => r.obj), ...views.rows.map(r => r.obj)]
  } finally {
    await cliente.end()
  }
}

describe.skipIf(!ON)('sonda — todo leitor de raw.vendas_excel está na lista fechada (v6.0.0/M7a)', () => {
  it('a sonda ENXERGA o exemplo positivo (a view do filtro + um escritor vivo) — senão não vale nada', async () => {
    const achados = await leitoresDeVendasExcel()
    expect(achados.length).toBeGreaterThan(0)
    expect(achados).toContain('analytics.vendas_excel_para_fato')
    expect(achados).toContain('public.promover_carga_vendas(jsonb, uuid)')
  })

  it('nenhum objeto fora da lista fechada cita raw.vendas_excel', async () => {
    const achados = await leitoresDeVendasExcel()
    const foraDaLista = achados.filter(obj => !(obj in OBJETOS_LEGITIMOS))
    expect(
      foraDaLista,
      `Objeto(s) lendo raw.vendas_excel diretamente, fora da lista fechada: ${foraDaLista.join(', ')}. ` +
        'Se é um leitor de negócio (RPC de tela, view), leia de analytics.vendas_excel_para_fato ' +
        '(a view do filtro Welcome, 0277/0283) em vez da tabela crua. Se é um escritor/carregador ' +
        'do pipeline de ingestão, adicione-o a OBJETOS_LEGITIMOS nesta sonda com a justificativa.',
    ).toEqual([])
  })
})
