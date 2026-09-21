import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASES_INGESTAO } from './bases'

// As cinco bases do contrato vivem em DOIS lugares: `bases.ts` (rota, UI, escopo) e o CHECK de
// `app.api_chave.escopo_bases` na migration 0274. "As duas pontas mudam juntas" em comentário
// não reprova nada (lição da v5.6.0 → `paridade-sql.test.ts`); este teste lê o SQL aplicado e
// compara. ⚠️ Lê a migration por NOME DE ARQUIVO: uma alteração futura do CHECK vem numa
// migration NOVA — apontar este teste para ela faz parte da mudança.
const RAIZ = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(RAIZ, 'supabase/migrations/0274_role_ingestor_e_escopo_api_chave.sql'), 'utf8')

function basesDoCheck(sql: string): string[] {
  const m = sql.match(/CONSTRAINT api_chave_escopo_bases_validas CHECK \(\s*escopo_bases <@ ARRAY\[([\s\S]*?)\]::text\[\]/)
  expect(m, 'CHECK api_chave_escopo_bases_validas não encontrado na 0274').not.toBeNull()
  return [...m![1].matchAll(/'([a-z-]+)'/g)].map(x => x[1])
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
