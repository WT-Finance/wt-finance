import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DESTINO_POR_TIPO, ROTULO_ESTADO_CONSERVACAO, ROTULO_MOTIVO_BAIXA, ROTULO_STATUS,
  STATUS_POR_TIPO, TIPOS_MOVIMENTACAO, type CampoDestino,
} from './derivar'
import type { StatusAtivo, TipoMovimentacao } from './tipos'

// ─────────────────────────────────────────────────────────────────────────────────────
// PARIDADE SQL ↔ TS do Inventário de Ativos (v5.6.0/M3).
//
// O contrato "tipo → destino / status" existe DUAS vezes de propósito: como CHECK e função no
// banco (migrations 0247/0248 — a barreira que vale) e como tabela em `derivar.ts` (que decide
// quais campos o modal mostra e como a UI rotula o estado). Os dois arquivos dizem "as duas
// pontas mudam JUNTAS", em comentário. Comentário não reprova nada.
//
// Aqui a paridade é MECÂNICA: o teste lê o SQL aplicado e o compara com o espelho em TS. Se
// alguém mudar um lado, o `npm test` reprova apontando qual tipo divergiu — e não a tela do
// usuário, meses depois, com o modal escondendo um campo que o banco exige.
//
// Ler a migration é legítimo aqui porque migration APLICADA é registro imutável (regra do
// projeto): o arquivo em disco é a verdade do que está no banco. A alternativa — chamar
// `patrimonio.status_derivado` via REST — não existe: a função é REVOKEd e vive fora de
// `public`, exatamente como se quer.
// ─────────────────────────────────────────────────────────────────────────────────────

const MIGRATIONS = resolve(__dirname, '../../../../supabase/migrations')

/** SQL sem comentários de linha — sem isto, "detentor_destino_id" citado num comentário do
 *  CHECK entraria na análise e falsearia a regra do tipo. */
function sqlLimpo(arquivo: string): string {
  return readFileSync(resolve(MIGRATIONS, arquivo), 'utf8')
    .split('\n')
    .map(l => l.replace(/--.*$/, ''))
    .join('\n')
}

const ESTRUTURA = sqlLimpo('0247_patrimonio_estrutura.sql')
const RPCS      = sqlLimpo('0248_patrimonio_rpcs.sql')

function valoresDoEnum(sql: string, nome: string): string[] {
  const m = sql.match(new RegExp(`CREATE TYPE patrimonio\\.${nome} AS ENUM\\s*\\(([^)]*)\\)`))
  expect(m, `enum ${nome} não encontrado na 0247`).not.toBeNull()
  return [...m![1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

describe('enums do banco × uniões do TS', () => {
  it('tipo_movimentacao — mesmos 8 valores, na mesma ordem', () => {
    const esperado: TipoMovimentacao[] = ['cadastro', ...TIPOS_MOVIMENTACAO]
    expect(valoresDoEnum(ESTRUTURA, 'tipo_movimentacao')).toEqual(esperado)
  })

  it('motivo_baixa — o TS não inventa nem esquece motivo', () => {
    expect(valoresDoEnum(ESTRUTURA, 'motivo_baixa')).toEqual(Object.keys(ROTULO_MOTIVO_BAIXA))
  })

  it('estado_conservacao — idem', () => {
    expect(valoresDoEnum(ESTRUTURA, 'estado_conservacao')).toEqual(Object.keys(ROTULO_ESTADO_CONSERVACAO))
  })
})

// ── CHECK `mov_destino_por_tipo` (0247) × DESTINO_POR_TIPO (derivar.ts) ─────────────

type Exigencia = 'obrigatorio' | 'opcional' | 'proibido'

/** As quatro colunas de destino e como cada uma aparece afirmada no CHECK. */
const COLUNAS: { campo: CampoDestino; coluna: string; presenca: RegExp }[] = [
  { campo: 'area',         coluna: 'area_destino_id',     presenca: /area_destino_id IS NOT NULL/ },
  { campo: 'detentor',     coluna: 'detentor_destino_id', presenca: /detentor_destino_id IS NOT NULL/ },
  { campo: 'motivo_baixa', coluna: 'motivo_baixa',        presenca: /motivo_baixa IS NOT NULL/ },
  // Texto livre não usa IS NOT NULL: string vazia também não vale como destino.
  { campo: 'texto',        coluna: 'destino_texto',       presenca: /btrim\(coalesce\(destino_texto, ''\)\) <> ''/ },
]

/** Ramos `WHEN 'tipo' THEN <predicado>` do CHECK, um por tipo. */
function ramosDoCheck(): Map<string, string> {
  const bloco = ESTRUTURA.slice(ESTRUTURA.indexOf('CONSTRAINT mov_destino_por_tipo'))
  const fim = bloco.indexOf('END')
  expect(fim, 'CASE do CHECK sem END — a análise pararia no lugar errado').toBeGreaterThan(0)
  const corpo = bloco.slice(0, fim)
  const ramos = new Map<string, string>()
  const partes = [...corpo.matchAll(/WHEN\s+'([a-z_]+)'\s+THEN([\s\S]*?)(?=WHEN\s+'|$)/g)]
  for (const p of partes) ramos.set(p[1], p[2])
  return ramos
}

/** Regra que o SQL impõe a um campo, lida do predicado do ramo. */
function exigenciaSql(predicado: string, col: typeof COLUNAS[number]): Exigencia {
  if (col.presenca.test(predicado)) return 'obrigatorio'
  if (new RegExp(`${col.coluna} IS NULL`).test(predicado)) return 'proibido'
  return 'opcional'
}

/** A mesma regra, lida do espelho em TS (campo ausente no mapa = TEM de ser nulo). */
function exigenciaTs(tipo: TipoMovimentacao, campo: CampoDestino): Exigencia {
  return DESTINO_POR_TIPO[tipo][campo] ?? 'proibido'
}

describe('CHECK mov_destino_por_tipo × DESTINO_POR_TIPO', () => {
  const ramos = ramosDoCheck()
  const tipos: TipoMovimentacao[] = ['cadastro', ...TIPOS_MOVIMENTACAO]

  it('o CHECK tem um ramo para cada um dos 8 tipos — CASE sem ramo é FAIL-OPEN', () => {
    expect([...ramos.keys()].sort()).toEqual([...tipos].sort())
  })

  it.each(tipos)('%s exige do banco exatamente o que o TS mostra no modal', tipo => {
    const predicado = ramos.get(tipo)!
    const doSql = Object.fromEntries(COLUNAS.map(c => [c.campo, exigenciaSql(predicado, c)]))
    const doTs  = Object.fromEntries(COLUNAS.map(c => [c.campo, exigenciaTs(tipo, c.campo)]))
    expect(doSql).toEqual(doTs)
  })

  it('o CASE do CHECK fecha em ELSE false — tipo sem ramo REPROVA, não passa batido', () => {
    // Sem o `ELSE`, um valor não previsto faria o CASE devolver NULL, e CHECK que avalia NULL
    // é considerado SATISFEITO pelo Postgres: fail-OPEN. Com `ELSE false`, acrescentar um valor
    // ao enum sem escrever o ramo trava o INSERT — que é o comportamento que se quer.
    const bloco = ESTRUTURA.slice(ESTRUTURA.indexOf('CONSTRAINT mov_destino_por_tipo'))
    expect(bloco.slice(0, bloco.indexOf('END'))).toMatch(/ELSE\s+false/)
  })
})

// ── `patrimonio.status_derivado` (0248) × STATUS_POR_TIPO (derivar.ts) ──────────────

/** Reconstrói o mapa tipo → status a partir do corpo SQL da função. */
function statusDoSql(): { porTipo: Map<string, string>; cadastro: { com: string; sem: string } } {
  const ini = RPCS.indexOf('FUNCTION patrimonio.status_derivado')
  const corpo = RPCS.slice(ini, RPCS.indexOf('$$;', ini))

  const cadastro = corpo.match(
    /p_detentor_destino_id IS NOT NULL THEN '([a-z_]+)' ELSE '([a-z_]+)'/,
  )
  expect(cadastro, 'ramo do cadastro não encontrado em status_derivado').not.toBeNull()

  const porTipo = new Map<string, string>()
  // Dois formatos convivem na função: `IN ('a','b')` e `= 'a'`.
  for (const m of corpo.matchAll(/WHEN p_tipo IN \(([^)]*)\)\s*THEN '([a-z_]+)'/g)) {
    for (const t of [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])) porTipo.set(t, m[2])
  }
  for (const m of corpo.matchAll(/WHEN p_tipo = '([a-z_]+)'\s+THEN '([a-z_]+)'/g)) {
    porTipo.set(m[1], m[2])
  }
  return { porTipo, cadastro: { com: cadastro![1], sem: cadastro![2] } }
}

describe('status_derivado × STATUS_POR_TIPO', () => {
  const { porTipo, cadastro } = statusDoSql()

  it('os 7 tipos que não ramificam produzem o mesmo status nas duas pontas', () => {
    expect(Object.fromEntries(porTipo)).toEqual(STATUS_POR_TIPO)
  })

  it('só o cadastro ramifica: com detentor nasce em uso, sem detentor em estoque', () => {
    // Decisão do Yan (10/08/2026) — resolvida derivando do MESMO registro, sem tipo novo.
    expect(cadastro).toEqual({ com: 'em_uso', sem: 'em_estoque' })
    expect(porTipo.has('cadastro')).toBe(false)
  })

  it('todo status que o SQL emite tem rótulo na UI', () => {
    const emitidos = new Set<string>([...porTipo.values(), cadastro.com, cadastro.sem])
    for (const s of emitidos) expect(ROTULO_STATUS[s as StatusAtivo]).toBeTruthy()
    // E o contrário: rótulo que a UI tem sem o SQL emitir seria status inalcançável.
    expect([...emitidos].sort()).toEqual(Object.keys(ROTULO_STATUS).sort())
  })

  it('o coalesce de estado ausente cai em em_estoque (ativo sem razão é inalcançável)', () => {
    // Invariante 5: a abertura nasce junto do ativo. O coalesce existe para um estado
    // impossível não derrubar a tela — se ele mudar de valor, a lista e o resumo divergem.
    expect(RPCS).toMatch(/coalesce\(e\.status, 'em_estoque'\)/)
  })
})
