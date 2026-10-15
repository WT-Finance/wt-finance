import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BASES_INGESTAO, BASES_COM_ESCOPO_DE_CHAVE, BASES_MULTIARQUIVO } from './bases'

// As bases do contrato vivem em VÁRIOS lugares: `bases.ts` (rota, UI, escopo), o CHECK de
// `app.api_chave.escopo_bases` na migration 0274, o CHECK `ingestao_carga_base_valida` de
// `ingestao.carga` (0276), o `ingestao_promocao_base_valida` de `ingestao.promocao` (0277), o CHECK
// da expectativa do vigia (0280) e a validação nomeada `BASE_INVALIDA` repetida dentro de TRÊS RPCs
// (`ingestao_carga_abrir`, `ingestao_carga_ultima`, `ingestao_soma_por_ano`). "As duas pontas mudam
// juntas" em comentário não reprova nada (lição da v5.6.0 → `paridade-sql.test.ts`); este teste lê o
// SQL aplicado e compara.
//
// ⚠️ LÊ POR NOME DE ARQUIVO (os blocos de CHECK): uma alteração futura de qualquer um desses CHECKs vem
// numa migration NOVA — apontar o bloco correspondente deste teste para ela faz parte da mudança.
// EXCEÇÕES que se LOCALIZAM sozinhas (seguem a migration vigente, a última que recria a função):
//   • `ESCOPO_INVALIDO` de `api_chave_registrar` (a 0289 a redefiniu inteira);
//   • `BASE_INVALIDA` das três RPCs acima (a 0295, v6.4.0, as redefiniu para aceitar `contas-receber`).
//
// v6.4.0 (`contas-receber`, a sexta base):
//   • os CHECKs de `ingestao.carga` e `ingestao.promocao` NÃO podem ser ampliados por migration
//     aditiva (é DROP + ADD CONSTRAINT) — a ampliação mora no PATCH destrutivo
//     `supabase/patches/contas_receber_checks_ingestao.sql`, que o Yan aplica em TTY. O teste lê a lista
//     do patch (comentários SQL removidos antes: o DOWN, comentado, ainda traz as 5 bases). Quando o
//     patch virar migration numerada, apontar `PATCH` para ela.
//   • `contas-receber` NÃO entra no escopo de chave de API nem na expectativa do vigia — não há RPA para
//     ela (briefing da v6.4.0 §11) e não há cadência de carga a vigiar por ora. É exceção DECLARADA
//     abaixo, não esquecimento: se um dia ganhar RPA/expectativa, a exceção sai daqui e a migration
//     correspondente entra.
const RAIZ = join(__dirname, '..', '..', '..')
const PASTA_MIGRATIONS = join(RAIZ, 'supabase/migrations')
const SQL = readFileSync(join(PASTA_MIGRATIONS, '0274_role_ingestor_e_escopo_api_chave.sql'), 'utf8')
const SQL_0280 = readFileSync(join(PASTA_MIGRATIONS, '0280_ingestao_execucao_alarmes_vigia.sql'), 'utf8')
const SQL_PATCH = semComentariosSql(
  readFileSync(join(RAIZ, 'supabase/patches/contas_receber_checks_ingestao.sql'), 'utf8'),
)

/** Bases SEM RPA: fora do CHECK de escopo de chave (0274/0289) e da expectativa do vigia (0280). */
const BASES_SEM_RPA_NEM_EXPECTATIVA: readonly string[] = ['contas-receber']
const BASES_COM_RPA = BASES_INGESTAO.filter((b) => !BASES_SEM_RPA_NEM_EXPECTATIVA.includes(b))

/** Remove comentários de linha (`-- …`) — o DOWN e as notas do patch trazem listas de bases e a
 *  sintaxe dos próprios CHECKs em comentário, e não podem ser lidos como definição. */
function semComentariosSql(sql: string): string {
  return sql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
}

/** A definição VIGENTE de `api_chave_registrar(text, text, uuid, text[])` — a validação nomeada
 *  `ESCOPO_INVALIDO` mora no CORPO da função, e a 0289 (v6.1.1/M3, troca de `solicitacoes` por
 *  `api-externa` no `exigir_acesso`) a redefiniu por inteiro (`CREATE OR REPLACE`). Ler a 0274 por
 *  nome fiscalizaria uma definição morta; aqui pega-se a ÚLTIMA migration (ordem do nome) que
 *  recria a função COM a validação — se uma futura a redefinir de novo, o teste a segue sozinho. */
function migrationVigenteDeApiChaveRegistrar(): { arquivo: string; sql: string } {
  const candidatas = readdirSync(PASTA_MIGRATIONS)
    .filter(f => /^\d{4}_.*\.sql$/.test(f))
    .sort()
    .map(f => ({ arquivo: f, sql: readFileSync(join(PASTA_MIGRATIONS, f), 'utf8') }))
    .filter(m => /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.api_chave_registrar\s*\(\s*p_plataforma\s+text\s*,\s*p_segredo_hash\s+text\s*,\s*p_robo_user_id\s+uuid\s*,\s*p_escopo_bases\s+text\[\]/i.test(m.sql)
      && m.sql.includes("RAISE EXCEPTION 'ESCOPO_INVALIDO"))
  expect(candidatas.length, 'nenhuma migration recria api_chave_registrar com ESCOPO_INVALIDO').toBeGreaterThan(0)
  return candidatas[candidatas.length - 1]
}

/**
 * O CORPO vigente de `public.<nome>(…)`: da última migration (ordem do nome) que a recria COM a
 * validação `BASE_INVALIDA`, do `CREATE` até o `CREATE FUNCTION` seguinte (ou o fim do arquivo). Se uma
 * migration futura recriar a função, o teste a segue sozinho — e uma que a recriasse SEM a validação
 * (regressão) seria ignorada aqui, então o `expect` de cada bloco abaixo prende o arquivo esperado.
 */
function corpoVigenteComBaseInvalida(nome: string): { arquivo: string; corpo: string } {
  const abertura = new RegExp(`CREATE\\s+(OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.${nome}\\s*\\(`, 'i')
  const proxima = /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/gi
  const candidatas: { arquivo: string; corpo: string }[] = []
  for (const arquivo of readdirSync(PASTA_MIGRATIONS).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort()) {
    const sql = readFileSync(join(PASTA_MIGRATIONS, arquivo), 'utf8')
    const m = abertura.exec(sql)
    if (!m) continue
    proxima.lastIndex = m.index + m[0].length
    const fim = proxima.exec(sql)?.index ?? sql.length
    const corpo = sql.slice(m.index, fim)
    if (corpo.includes("RAISE EXCEPTION 'BASE_INVALIDA")) candidatas.push({ arquivo, corpo })
  }
  expect(candidatas.length, `nenhuma migration recria ${nome} com BASE_INVALIDA`).toBeGreaterThan(0)
  return candidatas[candidatas.length - 1]
}

/** As bases entre aspas no bloco que PRECEDE `RAISE EXCEPTION 'BASE_INVALIDA` (a lista do `ARRAY[…]`). */
function basesDaValidacaoNomeada(corpo: string): string[] {
  const alvo = corpo.indexOf("RAISE EXCEPTION 'BASE_INVALIDA")
  const bloco = corpo.slice(Math.max(0, alvo - 400), alvo)
  const m = bloco.match(/ARRAY\[([^\]]*)\]::text\[\]/)
  expect(m, 'lista ARRAY[…] da validação BASE_INVALIDA não encontrada').not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

function basesDoCheck(sql: string): string[] {
  const m = sql.match(/CONSTRAINT api_chave_escopo_bases_validas CHECK \(\s*escopo_bases <@ ARRAY\[([\s\S]*?)\]::text\[\]/)
  expect(m, 'CHECK api_chave_escopo_bases_validas não encontrado na 0274').not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

/** As bases listadas num `CONSTRAINT <nome> CHECK (base IN (...))`. O nome do CHECK é parâmetro
 *  porque a MESMA lista se repete em constraints diferentes, em arquivos diferentes — e cada
 *  repetição precisa do seu próprio fiscal. Devolve a PRIMEIRA ocorrência. */
function basesDoCheckCarga(sql: string, constraint = 'ingestao_carga_base_valida'): string[] {
  const m = sql.match(new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\s*base IN \\(([\\s\\S]*?)\\)\\s*\\)`))
  expect(m, `CHECK ${constraint} não encontrado`).not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

describe('paridade — bases do contrato de ingestão: bases.ts ↔ CHECK da 0274 (escopo de chave)', () => {
  it('o CHECK lista exatamente as bases COM RPA (BASES_INGESTAO menos as exceções declaradas), na mesma ordem', () => {
    expect(basesDoCheck(SQL)).toEqual([...BASES_COM_RPA])
  })
  it('a exceção declarada é só `contas-receber` — acrescentar outra base aqui é decisão, não conveniência', () => {
    expect([...BASES_SEM_RPA_NEM_EXPECTATIVA]).toEqual(['contas-receber'])
  })
  it('a validação com nome de erro em api_chave_registrar (definição VIGENTE) usa a mesma lista', () => {
    const { arquivo, sql } = migrationVigenteDeApiChaveRegistrar()
    const alvo = sql.indexOf("RAISE EXCEPTION 'ESCOPO_INVALIDO")
    const bloco = sql.slice(alvo - 400, alvo)
    for (const b of BASES_COM_RPA) expect(bloco, `${b} ausente da validação nomeada (${arquivo})`).toContain(`'${b}'`)
    for (const b of BASES_SEM_RPA_NEM_EXPECTATIVA) expect(bloco, `${b} NÃO deveria estar (${arquivo})`).not.toContain(`'${b}'`)
  })
  it('a definição vigente é a 0289 ou posterior (a 0274 foi superada), e a lista é exatamente as bases COM RPA', () => {
    const { arquivo, sql } = migrationVigenteDeApiChaveRegistrar()
    expect(arquivo >= '0289', `vigente: ${arquivo}`).toBe(true)
    const alvo = sql.indexOf("RAISE EXCEPTION 'ESCOPO_INVALIDO")
    const m = sql.slice(0, alvo).match(/ARRAY\[([^\]]*)\]::text\[\]\)\s*THEN\s*$/)
    expect(m, 'lista da validação nomeada não encontrada').not.toBeNull()
    expect([...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])).toEqual([...BASES_COM_RPA])
  })
  it('BASES_COM_ESCOPO_DE_CHAVE (bases.ts, que filtra a UI e a Server Action de chaves) é a mesma lista do SQL', () => {
    expect([...BASES_COM_ESCOPO_DE_CHAVE]).toEqual(basesDoCheck(SQL))
  })
  it('são seis bases, todas em kebab-case, e `contas-receber` é a última (a ordem dos CHECKs a repete)', () => {
    expect(BASES_INGESTAO).toHaveLength(6)
    for (const b of BASES_INGESTAO) expect(b).toMatch(/^[a-z]+(-[a-z]+)*$/)
    expect(BASES_INGESTAO[BASES_INGESTAO.length - 1]).toBe('contas-receber')
  })
  it('as bases multiarquivo são Vendas e Contas a receber (um arquivo por ano / por faixa de vencimento)', () => {
    expect([...BASES_MULTIARQUIVO]).toEqual(['vendas-produto', 'contas-receber'])
  })
})

describe('paridade — bases do contrato de ingestão: bases.ts ↔ ingestao.carga (patch v6.4.0 + RPCs da 0295)', () => {
  it('o CHECK ingestao_carga_base_valida (patch) lista exatamente as bases de BASES_INGESTAO (mesma ordem)', () => {
    expect(basesDoCheckCarga(SQL_PATCH)).toEqual([...BASES_INGESTAO])
  })
  it.each(['ingestao_carga_abrir', 'ingestao_carga_ultima', 'ingestao_soma_por_ano'])(
    'a validação nomeada BASE_INVALIDA de %s (definição VIGENTE: a 0295 ou posterior) usa a mesma lista',
    (nome) => {
      const { arquivo, corpo } = corpoVigenteComBaseInvalida(nome)
      expect(arquivo >= '0295', `vigente de ${nome}: ${arquivo} — a 0295 trouxe contas-receber`).toBe(true)
      expect(basesDaValidacaoNomeada(corpo), `${nome} (${arquivo})`).toEqual([...BASES_INGESTAO])
    },
  )
  it('as três RPCs que validam base são exatamente estas (uma 4ª RPC com BASE_INVALIDA na 0295 pede um bloco aqui)', () => {
    const sql = readFileSync(join(PASTA_MIGRATIONS, readdirSync(PASTA_MIGRATIONS).find(f => f.startsWith('0295_')) ?? ''), 'utf8')
    expect(sql.match(/RAISE EXCEPTION 'BASE_INVALIDA/g)).toHaveLength(3)
  })
  it('ingestao_soma_por_ano tem ramo para a base nova e fecha em ELSE RAISE (CASE/IF sem ELSE é fail-open)', () => {
    const { corpo } = corpoVigenteComBaseInvalida('ingestao_soma_por_ano')
    expect(corpo).toContain("p_base = 'contas-receber'")
    // (comentários SQL podem separar o ELSE do RAISE)
    expect(corpo).toMatch(/ELSE\s*(--[^\n]*\n\s*)*RAISE EXCEPTION 'BASE_SEM_SOMA/)
  })
})

// A QUARTA repetição da mesma lista: `ingestao.promocao` (0277), a tabela que torna a promoção
// idempotente por `carga_id`. Achado MÉDIO do `revisor-db` na M5 — sem este bloco, uma base nova
// em `BASES_INGESTAO` sem a migration correspondente passaria batida justamente aqui.
describe('paridade — bases do contrato de ingestão: bases.ts ↔ ingestao.promocao (patch v6.4.0)', () => {
  it('o CHECK ingestao_promocao_base_valida (patch) lista exatamente as bases de BASES_INGESTAO (mesma ordem)', () => {
    expect(basesDoCheckCarga(SQL_PATCH, 'ingestao_promocao_base_valida')).toEqual([...BASES_INGESTAO])
  })
  it('o patch recria os DOIS CHECKs (carga e promocao) e nenhum outro', () => {
    expect(SQL_PATCH.match(/ADD CONSTRAINT\s+\w+/g)).toEqual([
      'ADD CONSTRAINT ingestao_carga_base_valida',
      'ADD CONSTRAINT ingestao_promocao_base_valida',
    ])
  })
})

// A QUINTA repetição (0280, M6): o CHECK `ingestao_expectativa_alvo_valido` (as bases que o vigia
// pode esperar). `contas-receber` fica FORA por decisão declarada (sem expectativa de vigia por ora).
// O mesmo CHECK repete os PROCESSOS de `ingestao.execucao` — e uma divergência ali deixaria o
// vigia esperando um processo que não consegue gravar execução (ou o contrário).
describe('paridade — bases e processos da ingestão: 0280 (expectativa, execução)', () => {
  function listaDoRamo(ramo: 'processo' | 'base'): string[] {
    const m = SQL_0280.match(
      new RegExp(`CONSTRAINT ingestao_expectativa_alvo_valido CHECK \\([\\s\\S]*?WHEN '${ramo}' THEN alvo IN \\(([\\s\\S]*?)\\)`),
    )
    expect(m, `ramo '${ramo}' do CHECK ingestao_expectativa_alvo_valido não encontrado`).not.toBeNull()
    return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
  }

  it('o ramo base do CHECK da expectativa lista exatamente as bases COM expectativa (BASES_INGESTAO menos as exceções declaradas)', () => {
    expect(listaDoRamo('base')).toEqual([...BASES_COM_RPA])
  })
  it('o CHECK da expectativa fecha em ELSE false (CASE sem ELSE é fail-open sob CHECK)', () => {
    const inicio = SQL_0280.indexOf('CONSTRAINT ingestao_expectativa_alvo_valido')
    expect(SQL_0280.slice(inicio, SQL_0280.indexOf('END', inicio))).toMatch(/ELSE false\s*$/)
  })
  it('os processos esperáveis são exatamente os processos que gravam execução (mesma ordem)', () => {
    const m = SQL_0280.match(/CONSTRAINT ingestao_execucao_processo_valido CHECK \(\s*processo IN \(([\s\S]*?)\)\s*\)/)
    expect(m, 'CHECK ingestao_execucao_processo_valido não encontrado').not.toBeNull()
    const daExecucao = [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
    expect(daExecucao).toHaveLength(4)
    expect(listaDoRamo('processo')).toEqual(daExecucao)
  })
})
