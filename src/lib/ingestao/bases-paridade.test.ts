import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASES_INGESTAO } from './bases'

// As cinco bases do contrato vivem em VÁRIOS lugares: `bases.ts` (rota, UI, escopo), o CHECK de
// `app.api_chave.escopo_bases` na migration 0274, e — desde a 0276 — o CHECK
// `ingestao_carga_base_valida` de `ingestao.carga` mais a validação nomeada `BASE_INVALIDA`
// repetida dentro de DUAS RPCs (`ingestao_carga_abrir`, `ingestao_carga_ultima`). "As duas
// pontas mudam juntas" em comentário não reprova nada (lição da v5.6.0 → `paridade-sql.test.ts`);
// este teste lê o SQL aplicado e compara. ⚠️ Lê cada migration por NOME DE ARQUIVO: uma alteração
// futura de qualquer um desses CHECKs/validações vem numa migration NOVA — apontar o bloco
// correspondente deste teste para ela faz parte da mudança.
const RAIZ = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(RAIZ, 'supabase/migrations/0274_role_ingestor_e_escopo_api_chave.sql'), 'utf8')
const SQL_0276 = readFileSync(join(RAIZ, 'supabase/migrations/0276_ingestao_carga_e_bucket.sql'), 'utf8')
const SQL_0277 = readFileSync(join(RAIZ, 'supabase/migrations/0277_ingestao_estrutura_atomica.sql'), 'utf8')

function basesDoCheck(sql: string): string[] {
  const m = sql.match(/CONSTRAINT api_chave_escopo_bases_validas CHECK \(\s*escopo_bases <@ ARRAY\[([\s\S]*?)\]::text\[\]/)
  expect(m, 'CHECK api_chave_escopo_bases_validas não encontrado na 0274').not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

/** As bases listadas num `CONSTRAINT <nome> CHECK (base IN (...))`. O nome do CHECK é parâmetro
 *  porque a MESMA lista se repete em constraints diferentes, em migrations diferentes — e cada
 *  repetição precisa do seu próprio fiscal. */
function basesDoCheckCarga(sql: string, constraint = 'ingestao_carga_base_valida'): string[] {
  const m = sql.match(new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\s*base IN \\(([\\s\\S]*?)\\)\\s*\\)`))
  expect(m, `CHECK ${constraint} não encontrado`).not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

/** Todas as posições em que `alvo` ocorre em `sql` (não só a primeira). */
function todosIndices(sql: string, alvo: string): number[] {
  const indices: number[] = []
  let i = sql.indexOf(alvo)
  while (i !== -1) {
    indices.push(i)
    i = sql.indexOf(alvo, i + 1)
  }
  return indices
}

describe('paridade — bases do contrato de ingestão: bases.ts ↔ CHECK da 0274', () => {
  it('o CHECK lista exatamente as bases de BASES_INGESTAO (mesma ordem)', () => {
    expect(basesDoCheck(SQL)).toEqual([...BASES_INGESTAO])
  })
  it('a validação com nome de erro em api_chave_registrar usa a mesma lista', () => {
    const bloco = SQL.slice(SQL.indexOf('ESCOPO_INVALIDO') - 400, SQL.indexOf('ESCOPO_INVALIDO'))
    for (const b of BASES_INGESTAO) expect(bloco, `${b} ausente da validação nomeada`).toContain(`'${b}'`)
  })
  it('são cinco bases, todas em kebab-case', () => {
    expect(BASES_INGESTAO).toHaveLength(5)
    for (const b of BASES_INGESTAO) expect(b).toMatch(/^[a-z]+(-[a-z]+)*$/)
  })
})

describe('paridade — bases do contrato de ingestão: bases.ts ↔ ingestao.carga (CHECK e RPCs da 0276)', () => {
  it('o CHECK ingestao_carga_base_valida lista exatamente as bases de BASES_INGESTAO (mesma ordem)', () => {
    expect(basesDoCheckCarga(SQL_0276)).toEqual([...BASES_INGESTAO])
  })
  it('a validação nomeada BASE_INVALIDA usa a mesma lista nas DUAS RPCs que a repetem (abrir/ultima)', () => {
    const indices = todosIndices(SQL_0276, 'BASE_INVALIDA')
    expect(
      indices.length,
      'esperadas exatamente 2 ocorrências de BASE_INVALIDA na 0276 (ingestao_carga_abrir e ingestao_carga_ultima) — mudou a contagem de RPCs que validam base?',
    ).toBe(2)
    for (const idx of indices) {
      const bloco = SQL_0276.slice(idx - 400, idx)
      for (const b of BASES_INGESTAO) expect(bloco, `${b} ausente de uma validação nomeada BASE_INVALIDA`).toContain(`'${b}'`)
    }
  })
})

// A QUARTA repetição da mesma lista: `ingestao.promocao` (0277), a tabela que torna a promoção
// idempotente por `carga_id`. Achado MÉDIO do `revisor-db` na M5 — sem este bloco, uma base nova
// em `BASES_INGESTAO` sem a migration correspondente passaria batida justamente aqui.
describe('paridade — bases do contrato de ingestão: bases.ts ↔ ingestao.promocao (CHECK da 0277)', () => {
  it('o CHECK ingestao_promocao_base_valida lista exatamente as bases de BASES_INGESTAO (mesma ordem)', () => {
    expect(basesDoCheckCarga(SQL_0277, 'ingestao_promocao_base_valida')).toEqual([...BASES_INGESTAO])
  })
})

// A QUINTA e a SEXTA repetições (0280, M6): o CHECK `ingestao_expectativa_alvo_valido` (as bases
// que o vigia pode esperar) e a validação `BASE_INVALIDA` de `ingestao_soma_por_ano` (a medida do
// alarme "ano fechado alterado"). Base nova sem estas duas nasceria sem cadência e sem o alarme.
// O mesmo CHECK repete os PROCESSOS de `ingestao.execucao` — e uma divergência ali deixaria o
// vigia esperando um processo que não consegue gravar execução (ou o contrário).
describe('paridade — bases e processos da ingestão: 0280 (expectativa, soma por ano, execução)', () => {
  const SQL_0280 = readFileSync(join(RAIZ, 'supabase/migrations/0280_ingestao_execucao_alarmes_vigia.sql'), 'utf8')

  function listaDoRamo(ramo: 'processo' | 'base'): string[] {
    const m = SQL_0280.match(
      new RegExp(`CONSTRAINT ingestao_expectativa_alvo_valido CHECK \\([\\s\\S]*?WHEN '${ramo}' THEN alvo IN \\(([\\s\\S]*?)\\)`),
    )
    expect(m, `ramo '${ramo}' do CHECK ingestao_expectativa_alvo_valido não encontrado`).not.toBeNull()
    return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
  }

  it('o ramo base do CHECK da expectativa lista exatamente BASES_INGESTAO (mesma ordem)', () => {
    expect(listaDoRamo('base')).toEqual([...BASES_INGESTAO])
  })
  it('o CHECK da expectativa fecha em ELSE false (CASE sem ELSE é fail-open sob CHECK)', () => {
    const inicio = SQL_0280.indexOf('CONSTRAINT ingestao_expectativa_alvo_valido')
    expect(SQL_0280.slice(inicio, SQL_0280.indexOf('END', inicio))).toMatch(/ELSE false\s*$/)
  })
  it('a validação nomeada BASE_INVALIDA de ingestao_soma_por_ano usa a mesma lista', () => {
    const indices = todosIndices(SQL_0280, "RAISE EXCEPTION 'BASE_INVALIDA")
    expect(indices.length, 'esperada exatamente 1 validação BASE_INVALIDA na 0280 (ingestao_soma_por_ano)').toBe(1)
    const bloco = SQL_0280.slice(indices[0] - 400, indices[0])
    for (const b of BASES_INGESTAO) expect(bloco, `${b} ausente da validação BASE_INVALIDA`).toContain(`'${b}'`)
  })
  it('os processos esperáveis são exatamente os processos que gravam execução (mesma ordem)', () => {
    const m = SQL_0280.match(/CONSTRAINT ingestao_execucao_processo_valido CHECK \(\s*processo IN \(([\s\S]*?)\)\s*\)/)
    expect(m, 'CHECK ingestao_execucao_processo_valido não encontrado').not.toBeNull()
    const daExecucao = [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
    expect(daExecucao).toHaveLength(4)
    expect(listaDoRamo('processo')).toEqual(daExecucao)
  })
})
