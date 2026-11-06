import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// ── Sonda ESTÁTICA da lista fechada da base `lancamentos-centro-custo` (v6.5.1, inv. 7 / D6) ──────
// O relatório do Monde traz `Pessoa` e `Descrição` (nomes de pessoas) e `Valor Lançamento`; nenhuma das
// três pode virar coluna. As provas dinâmicas (saída do parser, chaves do adaptador) e o guard SQL da
// 0304 (roda UMA vez, no push) não pegam uma migration FUTURA que faça
// `ALTER TABLE raw.lancamentos_centro_custo ADD COLUMN pessoa …`. Esta sonda pega: lê o DDL de TODAS as
// migrations e reprova (a) a tabela nascida com colunas diferentes das da lista e (b) qualquer
// migration posterior que acrescente coluna ou recrie a tabela — mudar a lista é decisão de produto,
// e quem a mudar atualiza `COLUNAS` aqui de propósito. (Achado MÉDIO do revisor na M2.)

const DIR = join(process.cwd(), 'supabase', 'migrations')

/** A lista fechada (D6) + os metadados de carga. Nada além disto. */
const COLUNAS = [
  'id', 'arquivo_origem', 'linha_origem', 'numero', 'emissao', 'vencimento', 'movimentacao',
  'centro_custo', 'pct_centro', 'valor_movimentacao', 'valor_centro_custo', 'carregado_em',
]
const PROIBIDAS = /\b(pessoa|descricao|descrição|valor_lancamento)\b/i

/** Remove comentários `--` (o header da 0304 cita as colunas proibidas para dizer que NÃO entram). */
const semComentarios = (sql: string) => sql.replace(/--[^\n]*/g, '')

function colunasDoCreate(sql: string): string[] {
  const m = /CREATE TABLE raw\.lancamentos_centro_custo\s*\(([\s\S]*?)\n\);/.exec(semComentarios(sql))
  if (!m) throw new Error('CREATE TABLE raw.lancamentos_centro_custo não encontrado na 0304')
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0])
}

describe('lista fechada de raw.lancamentos_centro_custo (D6)', () => {
  const migracoes = readdirSync(DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()
  const origem = migracoes.find((f) => f.startsWith('0304_'))

  it('a 0304 cria a tabela com EXATAMENTE as colunas da lista fechada', () => {
    expect(origem).toBeDefined()
    const sql = readFileSync(join(DIR, origem as string), 'utf8')
    expect(colunasDoCreate(sql)).toEqual(COLUNAS)
    // A staging nasce por LIKE da viva (herda a mesma lista, nada além).
    expect(semComentarios(sql)).toMatch(
      /CREATE UNLOGGED TABLE raw\.lancamentos_centro_custo_staging\s*\(LIKE raw\.lancamentos_centro_custo INCLUDING DEFAULTS\)/,
    )
  })

  it('nenhuma coluna proibida (Pessoa, Descrição, Valor Lançamento) no DDL da tabela', () => {
    for (const c of COLUNAS) expect(c).not.toMatch(PROIBIDAS)
  })

  it('nenhuma migration POSTERIOR acrescenta coluna ou recria a tabela (nem a staging)', () => {
    const depois = migracoes.filter((f) => f > (origem as string))
    const ofensas: string[] = []
    for (const f of depois) {
      const sql = semComentarios(readFileSync(join(DIR, f), 'utf8'))
      if (/ALTER TABLE\s+(IF EXISTS\s+)?raw\.lancamentos_centro_custo(_staging)?\b[^;]*\bADD\b/i.test(sql)) ofensas.push(`${f}: ADD`)
      if (/CREATE\s+(UNLOGGED\s+)?TABLE\s+(IF NOT EXISTS\s+)?raw\.lancamentos_centro_custo(_staging)?\b/i.test(sql)) ofensas.push(`${f}: CREATE`)
    }
    expect(ofensas, 'mudar a lista fechada é decisão de produto (D6): atualize COLUNAS aqui de propósito').toEqual([])
  })
})
