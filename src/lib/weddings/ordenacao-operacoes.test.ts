import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CHAVES_ORDENACAO_OPERACOES, CHAVE_ORDENACAO_PADRAO } from './ordenacao-operacoes'

// Guard mecânico do contrato de ordenação da Lista de Operações.
//
// A chave atravessa quatro camadas — cabeçalho → querystring → enum Zod da rota →
// `CASE` do SQL — e as duas pontas que este teste amarra falham de formas opostas e
// igualmente invisíveis para tsc/lint/build:
//   • falta no SQL   ⇒ o `ELSE 'd_data_evento'` ordena por outra coisa, EM SILÊNCIO;
//   • falta no enum  ⇒ a rota devolve 400 e a Lista inteira vira linha de erro.
//
// Foi o segundo caso que aconteceu na v5.5.0: `rend_float` entrou no `CASE` e no
// cabeçalho, mas não no enum, e a verificação da ordenação tinha sido feita via
// REST direto contra a RPC — que pula justamente a camada quebrada.
//
// O teste lê o SQL da MIGRATION mais recente que redefine a whitelist, em vez de uma
// cópia da lista: assim ele acompanha o banco de verdade, e uma migration futura que
// acrescente chave sem atualizar o enum reprova aqui.

const DIR_MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')

/** Última migration que redefine a whitelist de ORDER BY do `__nucleo`. */
function sqlDaWhitelistVigente(): { arquivo: string; sql: string } {
  const candidatos = readdirSync(DIR_MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .filter(f => {
      const sql = readFileSync(join(DIR_MIGRATIONS, f), 'utf8')
      return sql.includes('FUNCTION public.get_operacoes_weddings__nucleo')
        && sql.includes("ELSE 'd_data_evento'")
    })
  const arquivo = candidatos[candidatos.length - 1]
  return { arquivo, sql: readFileSync(join(DIR_MIGRATIONS, arquivo), 'utf8') }
}

/** As chaves do `CASE p_ordenar_por ... WHEN 'x' THEN 'd_x'`. */
function chavesDoSql(sql: string): string[] {
  // ⚠️ O `ELSE` tem de ser procurado A PARTIR do início do CASE. O cabeçalho da
  // migration CITA `ELSE 'd_data_evento'` em prosa, e um `indexOf` solto acha a
  // citação — que vem ANTES do código, produzindo um slice invertido e vazio.
  // O teste passava a olhar uma string vazia e não afirmava nada.
  const inicio = sql.indexOf('v_order_col := CASE p_ordenar_por')
  if (inicio < 0) return []
  const fim = sql.indexOf("ELSE 'd_data_evento'", inicio)
  if (fim < 0) return []
  return [...sql.slice(inicio, fim).matchAll(/WHEN\s+'([a-z_]+)'/g)].map(m => m[1])
}

describe('contrato de ordenação da Lista de Operações — enum da rota × CASE do SQL', () => {
  const { arquivo, sql } = sqlDaWhitelistVigente()
  const doSql = chavesDoSql(sql)

  it('encontrou a whitelist vigente no SQL (senão o teste abaixo é vazio)', () => {
    expect(arquivo).toBeTruthy()
    expect(doSql.length).toBeGreaterThan(5)
  })

  it('toda chave do SQL é aceita pela rota (senão: 400 e a Lista vira erro)', () => {
    const faltando = doSql.filter(k => !CHAVES_ORDENACAO_OPERACOES.includes(k as never))
    expect(faltando, `chaves no ${arquivo} que a rota rejeitaria: ${faltando.join(', ')}`).toEqual([])
  })

  it('toda chave da rota existe no SQL (senão: ordena por data do evento em silêncio)', () => {
    // `data_evento` é o `ELSE`, não um `WHEN` — é a única exceção legítima.
    const esperadas = CHAVES_ORDENACAO_OPERACOES.filter(k => k !== CHAVE_ORDENACAO_PADRAO)
    const faltando = esperadas.filter(k => !doSql.includes(k))
    expect(faltando, `chaves aceitas pela rota e ausentes do ${arquivo}: ${faltando.join(', ')}`).toEqual([])
  })

  it('a coluna nova da v5.5.0 está nas duas pontas', () => {
    // O caso que reprovaria a entrega original desta versão.
    expect(doSql).toContain('rend_float')
    expect(CHAVES_ORDENACAO_OPERACOES).toContain('rend_float')
  })

  it('o fallback do SQL é a chave padrão da rota', () => {
    expect(sql).toContain("ELSE 'd_data_evento'")
    expect(CHAVE_ORDENACAO_PADRAO).toBe('data_evento')
  })
})
