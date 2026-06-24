import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classificarSql, confirmaDestrutivaEOF } from './classificar.mjs'

// Sonda do db-gate (v4.27.1, ADR-0131). PROVA o classificador de migration e a decisão de
// confirmação destrutiva. É a "execução do gate" pedida pelo briefing (não há UI). Roda em
// `npm test` (vitest.config inclui scripts/**/*.test.mjs).

const MIG = join(dirname(fileURLToPath(import.meta.url)), '../../supabase/migrations')
const conteudo = num => {
  const f = readdirSync(MIG).find(x => x.startsWith(num + '_'))
  if (!f) throw new Error(`migration ${num} não encontrada em ${MIG}`)
  return readFileSync(join(MIG, f), 'utf8')
}

describe('classificarSql — migrations reais 0149..0158 (não-regressão do verdadeiro positivo + fim dos falsos)', () => {
  const esperado = {
    '0149': 'destrutiva', // UPDATE TOP-LEVEL real em linhas existentes (verdadeiro positivo — NÃO afrouxar)
    '0150': 'aditiva',    // ADD COLUMN + CREATE FUNCTION (UPDATE só DENTRO do corpo $$)
    '0151': 'aditiva',    // CREATE OR REPLACE FUNCTION
    '0152': 'aditiva',    // ALTER ROLE ... SET timezone (não toca tabela/dado)
    '0153': 'aditiva',    // CREATE OR REPLACE FUNCTION (UPDATE só DENTRO do corpo $$)
    '0154': 'warn',       // DROP FUNCTION;CREATE (troca de assinatura) + DELETE/UPDATE só no corpo
    '0155': 'aditiva',    // CREATE OR REPLACE FUNCTION
    '0156': 'aditiva',    // CREATE OR REPLACE FUNCTION (sem DML)
    '0157': 'aditiva',
    '0158': 'aditiva',
  }
  for (const [num, nivel] of Object.entries(esperado)) {
    it(`${num} → ${nivel}`, () => {
      expect(classificarSql(conteudo(num)).nivel).toBe(nivel)
    })
  }
})

describe('classificarSql — adversarial: o tokenizer NÃO pode esconder um DROP top-level', () => {
  it('DROP TABLE top-level + corpo $$ com UPDATE → destrutiva (o caso adversarial do briefing)', () => {
    const sql = `CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN UPDATE t SET a=1; END $$;\nDROP TABLE analytics.x;`
    expect(classificarSql(sql).nivel).toBe('destrutiva')
  })
  it('DROP TABLE top-level ANTES de um corpo $$ → destrutiva', () => {
    const sql = `DROP TABLE analytics.x;\nCREATE FUNCTION f() AS $$ SELECT 1 $$ LANGUAGE sql;`
    expect(classificarSql(sql).nivel).toBe('destrutiva')
  })
  it('DML SÓ dentro do corpo $$ → aditiva (era o falso-positivo de 0150/0153)', () => {
    const sql = `CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN DELETE FROM t; UPDATE t SET x=1; END $$;`
    expect(classificarSql(sql).nivel).toBe('aditiva')
  })
  it('DROP TABLE em comentário de linha → ignorado (aditiva)', () => {
    expect(classificarSql('-- DROP TABLE x\nCREATE TABLE y (id int);').nivel).toBe('aditiva')
  })
  it('DROP TABLE em comentário de bloco → ignorado (aditiva)', () => {
    expect(classificarSql('/* TODO: DROP TABLE x depois */\nCREATE TABLE y (id int);').nivel).toBe('aditiva')
  })
  it('DROP em literal de string → ignorado (aditiva)', () => {
    expect(classificarSql("INSERT INTO log (msg) VALUES ('DROP TABLE x');").nivel).toBe('aditiva')
  })
  it('tag custom $body$: DROP TABLE no corpo → excisado (aditiva)', () => {
    expect(classificarSql('CREATE FUNCTION f() AS $body$ DROP TABLE inner_t; $body$ LANGUAGE sql;').nivel).toBe('aditiva')
  })
  it('tags diferentes aninhadas: scanner fecha na tag EXTERNA; DROP no meio fica no corpo → aditiva', () => {
    const sql = `CREATE FUNCTION f() AS $outer$ SELECT 1; $inner$ texto $inner$ DROP TABLE z; $outer$ LANGUAGE sql;`
    expect(classificarSql(sql).nivel).toBe('aditiva')
  })
  it('corpo $$ NÃO fechado (ambíguo) → FALHA FECHADO (destrutiva)', () => {
    expect(classificarSql('CREATE FUNCTION f() AS $$ BEGIN UPDATE t SET a=1;').nivel).toBe('destrutiva')
  })
  it('comentário de bloco NÃO fechado (ambíguo) → FALHA FECHADO (destrutiva)', () => {
    expect(classificarSql('/* comentário sem fim\nCREATE TABLE y(id int);').nivel).toBe('destrutiva')
  })
  it('TRUNCATE top-level → destrutiva', () => {
    expect(classificarSql('TRUNCATE analytics.t;').nivel).toBe('destrutiva')
  })
  it('ALTER TABLE ... DROP COLUMN → destrutiva', () => {
    expect(classificarSql('ALTER TABLE analytics.t DROP COLUMN c;').nivel).toBe('destrutiva')
  })
  it('ALTER TABLE ... ADD COLUMN → aditiva', () => {
    expect(classificarSql('ALTER TABLE analytics.t ADD COLUMN c int;').nivel).toBe('aditiva')
  })
  it('DELETE FROM top-level → destrutiva', () => {
    expect(classificarSql('DELETE FROM analytics.t WHERE id = 1;').nivel).toBe('destrutiva')
  })
  it('UPDATE top-level → destrutiva', () => {
    expect(classificarSql('UPDATE analytics.t SET a = 1 WHERE id = 2;').nivel).toBe('destrutiva')
  })
  it('DROP FUNCTION top-level (troca de assinatura) → warn (nem aditiva cega, nem destrutiva)', () => {
    const sql = `DROP FUNCTION IF EXISTS public.f(int);\nCREATE FUNCTION public.f(int, text) RETURNS void AS $$ $$ LANGUAGE sql;`
    expect(classificarSql(sql).nivel).toBe('warn')
  })
  it('nome de função contendo "update" NÃO é UPDATE top-level (sem falso-positivo)', () => {
    const sql = `CREATE OR REPLACE FUNCTION public.update_gerencial_lancamento(p_id bigint, p_updates jsonb) RETURNS boolean AS $$ BEGIN RETURN true; END $$ LANGUAGE plpgsql;`
    expect(classificarSql(sql).nivel).toBe('aditiva')
  })
})

describe('confirmaDestrutivaEOF — EOF/headless NUNCA confirma (inverte o default do CLI)', () => {
  it('não-TTY (headless/EOF) → false, qualquer resposta', () => {
    expect(confirmaDestrutivaEOF(false, 'aplicar')).toBe(false)
    expect(confirmaDestrutivaEOF(false, 'Y')).toBe(false)
    expect(confirmaDestrutivaEOF(false, null)).toBe(false)
    expect(confirmaDestrutivaEOF(false, undefined)).toBe(false)
  })
  it('TTY + resposta afirmativa explícita → true', () => {
    expect(confirmaDestrutivaEOF(true, 'aplicar')).toBe(true)
    expect(confirmaDestrutivaEOF(true, 'APLICAR')).toBe(true)
    expect(confirmaDestrutivaEOF(true, 'Y')).toBe(true)
    expect(confirmaDestrutivaEOF(true, 'sim')).toBe(true)
    expect(confirmaDestrutivaEOF(true, '  s  ')).toBe(true)
  })
  it('TTY + resposta vazia/negativa/null (EOF no meio) → false', () => {
    expect(confirmaDestrutivaEOF(true, '')).toBe(false)
    expect(confirmaDestrutivaEOF(true, 'n')).toBe(false)
    expect(confirmaDestrutivaEOF(true, 'não')).toBe(false)
    expect(confirmaDestrutivaEOF(true, 'qualquer')).toBe(false)
    expect(confirmaDestrutivaEOF(true, null)).toBe(false)
  })
})
