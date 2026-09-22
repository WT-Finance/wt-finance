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

function basesDoCheck(sql: string): string[] {
  const m = sql.match(/CONSTRAINT api_chave_escopo_bases_validas CHECK \(\s*escopo_bases <@ ARRAY\[([\s\S]*?)\]::text\[\]/)
  expect(m, 'CHECK api_chave_escopo_bases_validas não encontrado na 0274').not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
}

function basesDoCheckCarga(sql: string): string[] {
  const m = sql.match(/CONSTRAINT ingestao_carga_base_valida CHECK \(\s*base IN \(([\s\S]*?)\)\s*\)/)
  expect(m, 'CHECK ingestao_carga_base_valida não encontrado na 0276').not.toBeNull()
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
