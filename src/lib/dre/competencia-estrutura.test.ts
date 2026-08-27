import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Oráculo ESTRUTURAL da DRE por competência (v5.8.0, M2) ────────────────────
//
// Este arquivo prova a ARITMÉTICA da árvore sem banco e sem rede, lendo o SQL que foi
// (ou será) aplicado — `supabase/migrations/0256_dre_competencia_estrutura.sql` — e os
// dois anexos curados do briefing, que são a fonte dela.
//
// POR QUE LER O SQL, E NÃO SÓ O ANEXO: a migration é ARQUIVO GERADO
// (`scripts/gera-seed-dre-competencia.mjs`). "As duas pontas mudam juntas" escrito num
// comentário não reprova nada — foi a lição da v5.6.0, que virou `paridade-sql.test.ts`.
// Aqui o teste compara o SQL de verdade contra o anexo de verdade: mão humana no SQL
// gerado (ou anexo editado sem regerar) fica vermelha.
//
// POR QUE NENHUM NÚMERO DE DINHEIRO APARECE AQUI: a base é um upload que o Yan re-gera,
// e teste puro que crava número de fonte editável nasce falso-vermelho (lição da v5.7.2).
// O oráculo em dinheiro vive no contrato REST (`rpc-contrato.test.ts`), medindo a base
// carregada contra ela mesma. O que se prova AQUI é o que não depende do dado: que a
// estrutura, por construção, faz `REX` ser a soma de tudo e `REXG` ser `REX − REEMB`.

const RAIZ = join(__dirname, '..', '..', '..')
const SQL = readFileSync(join(RAIZ, 'supabase/migrations/0256_dre_competencia_estrutura.sql'), 'utf8')
const CSV_ARVORE = readFileSync(join(RAIZ, 'docs/briefings/anexo-v5-8-0-arvore-competencia.csv'), 'utf8')
const CSV_DEPARA = readFileSync(join(RAIZ, 'docs/briefings/anexo-v5-8-0-depara-competencia.csv'), 'utf8')

const OPERADOR_NO_INICIO = /^\s*\((\+|-|\+\/-|=)\)/

// ── leitura do CSV (um rótulo tem vírgula dentro do campo citado) ─────────────
function parseCsvLine(l: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < l.length; i++) {
    const ch = l[i]
    if (q) {
      if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
const lerCsv = (t: string) => t.trim().split(/\r?\n/).slice(1).map(parseCsvLine)

// ── leitura das VALUES do SQL ────────────────────────────────────────────────
/** Quebra uma linha `('a', 'b''c', 10, NULL)` nos seus campos, respeitando `''`. */
function camposSql(linha: string): string[] {
  const dentro = linha.trim().replace(/^\(/, '').replace(/\),?;?$/, '')
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < dentro.length; i++) {
    const ch = dentro[i]
    if (q) {
      if (ch === "'") { if (dentro[i + 1] === "'") { cur += "'"; i++ } else q = false } else cur += ch
    } else if (ch === "'") { q = true }
    else if (ch === ',') { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Extrai o bloco de VALUES que segue um INSERT identificado pela tabela. */
function valoresDe(tabela: string): string[][] {
  const i = SQL.indexOf(`INSERT INTO ${tabela}`)
  expect(i, `INSERT de ${tabela} não encontrado na migration`).toBeGreaterThan(-1)
  const depois = SQL.slice(i)
  const fim = depois.indexOf(';')
  const corpo = depois.slice(0, fim)
  return corpo
    .split('\n')
    .filter((l) => /^\s*\(/.test(l))
    .map(camposSql)
}

interface Bloco { ordem: number; tipo: string; chave: string; rotulo: string; formula: string[] | null }

const blocos: Bloco[] = valoresDe('financeiro.dre_comp_bloco').map((c) => ({
  ordem: Number(c[0]),
  tipo: c[1],
  chave: c[2],
  rotulo: c[3],
  formula: c[4] === 'NULL' ? null : (JSON.parse(c[4].replace(/::jsonb$/, '')) as string[]),
}))

const mapas = valoresDe('financeiro.dre_comp_map').map((c) => ({
  grupo: c[0], descricao: c[1], sub: c[2], rotulo: c[3], ordem: Number(c[4]),
}))

const porChave = new Map(blocos.map((b) => [b.chave, b]))
const folhas = blocos.filter((b) => b.formula === null).map((b) => b.chave)

/** Expande uma chave na sua combinação SIGNADA de folhas — o mesmo algoritmo da
 *  view `financeiro.vw_dre_comp_expansao`, reimplementado aqui de propósito: se as duas
 *  implementações discordarem, é porque uma delas está errada, e é isso que se quer saber. */
function expandir(chave: string, profundidade = 0): Map<string, number> {
  if (profundidade > 24) throw new Error(`profundidade excedida em ${chave} — ciclo na árvore?`)
  const bloco = porChave.get(chave)
  if (!bloco) throw new Error(`chave inexistente: ${chave}`)
  const acc = new Map<string, number>()
  if (bloco.formula === null) { acc.set(chave, 1); return acc }
  for (const termo of bloco.formula) {
    const negativo = termo.startsWith('-')
    const ref = negativo ? termo.slice(1) : termo
    for (const [folha, coef] of expandir(ref, profundidade + 1)) {
      acc.set(folha, (acc.get(folha) ?? 0) + (negativo ? -coef : coef))
    }
  }
  // coeficiente 0 = termo que se cancelou (o REEMB do REXG) — sai, como o HAVING da view
  for (const [folha, coef] of [...acc]) if (coef === 0) acc.delete(folha)
  return acc
}

describe('árvore de competência · paridade SQL × anexo', () => {
  it('a árvore da migration é exatamente o anexo curado', () => {
    const doAnexo = lerCsv(CSV_ARVORE).map((c) => ({ ordem: Number(c[0]), tipo: c[1], chave: c[2], rotulo: c[3] }))
    expect(blocos.map((b) => ({ ordem: b.ordem, tipo: b.tipo, chave: b.chave, rotulo: b.rotulo }))).toEqual(doAnexo)
  })

  it('o de-para da migration é exatamente o anexo curado', () => {
    const doAnexo = lerCsv(CSV_DEPARA).map((c) => ({ grupo: c[0], descricao: c[1], sub: c[2], rotulo: c[3] }))
    expect(mapas.map((m) => ({ grupo: m.grupo, descricao: m.descricao, sub: m.sub, rotulo: m.rotulo }))).toEqual(doAnexo)
  })

  it('todo par do de-para aponta para uma chave que existe na árvore', () => {
    for (const m of mapas) expect(porChave.has(m.sub), `${m.sub} não existe na árvore`).toBe(true)
  })

  it('nenhum par (grupo, descrição) se repete — a chave é composta e única', () => {
    const vistos = new Set(mapas.map((m) => `${m.grupo}␟${m.descricao}`))
    expect(vistos.size).toBe(mapas.length)
  })
})

describe('árvore de competência · regra de rótulos da v5.7.0', () => {
  it('toda AGREGAÇÃO carrega operador no rótulo', () => {
    for (const b of blocos) {
      expect(OPERADOR_NO_INICIO.test(b.rotulo), `${b.chave} sem operador: ${b.rotulo}`).toBe(true)
    }
  })

  it('nenhuma FOLHA carrega operador no rótulo', () => {
    for (const m of mapas) {
      expect(OPERADOR_NO_INICIO.test(m.rotulo), `folha com operador: ${m.rotulo}`).toBe(false)
    }
  })
})

describe('árvore de competência · as 3 fusões por nome', () => {
  const FUNDIDAS = ['Comissão', 'Reembolso Cliente', 'Reembolso Fornecedor']

  it('são exatamente estas 3 as descrições que existem sob dois pais', () => {
    const contagem = new Map<string, number>()
    for (const m of mapas) contagem.set(m.descricao, (contagem.get(m.descricao) ?? 0) + 1)
    const duplicadas = [...contagem.entries()].filter(([, n]) => n > 1).map(([d]) => d).sort()
    expect(duplicadas).toEqual([...FUNDIDAS].sort())
  })

  it('as duas pernas de cada fusão caem no MESMO destino e na MESMA ordem', () => {
    for (const nome of FUNDIDAS) {
      const pernas = mapas.filter((m) => m.descricao === nome)
      expect(pernas).toHaveLength(2)
      // grupos de origem DIFERENTES (é o que torna a chave composta necessária)…
      expect(new Set(pernas.map((p) => p.grupo)).size).toBe(2)
      // …e destino idêntico, que é o que faz o GROUP BY fundir as duas numa linha só
      expect(new Set(pernas.map((p) => p.sub)).size).toBe(1)
      expect(new Set(pernas.map((p) => p.rotulo)).size).toBe(1)
      expect(new Set(pernas.map((p) => p.ordem)).size).toBe(1)
    }
  })

  it('141 pares produzem 138 linhas exibidas — 3 fusões, nem uma a mais', () => {
    const destinos = new Set(mapas.map((m) => `${m.sub}␟${m.rotulo}`))
    expect(mapas.length - destinos.size).toBe(3)
    expect(destinos.size).toBe(mapas.length - 3)
  })
})

describe('árvore de competência · o oráculo em forma fechada', () => {
  it('toda chave resolve em folhas, sem ciclo', () => {
    for (const b of blocos) {
      const exp = expandir(b.chave)
      expect(exp.size, `${b.chave} não resolveu em nenhuma folha`).toBeGreaterThan(0)
      for (const folha of exp.keys()) {
        expect(porChave.get(folha)?.formula, `${folha} deveria ser folha`).toBeNull()
      }
    }
  })

  it('REX é a SOMA DE TUDO: coeficiente +1 em cada folha, e nenhuma folha de fora', () => {
    const exp = expandir('REX')
    // as folhas do REX são exatamente as folhas da árvore…
    expect([...exp.keys()].sort()).toEqual([...folhas].sort())
    // …cada uma somando uma vez só. Isto é o oráculo: se todo par do de-para cai numa
    // folha e a bandeja está vazia, REX ≡ Σ(base do ano) por CONSTRUÇÃO — não por
    // coincidência numérica.
    for (const [folha, coef] of exp) expect(coef, `coeficiente de ${folha} em REX`).toBe(1)
  })

  it('todas as folhas da árvore são usadas pelo de-para (nenhum balde morto)', () => {
    const usadas = new Set(mapas.map((m) => m.sub))
    expect([...usadas].sort()).toEqual([...folhas].sort())
  })

  it('REXG = REX − REEMB: o coeficiente de REEMB CANCELA para zero', () => {
    const rex = expandir('REX')
    const rexg = expandir('REXG')
    expect(rex.get('REEMB')).toBe(1)
    // o cancelamento é aritmético (+1 dentro do REX, −1 fora), não caso especial
    expect(rexg.has('REEMB')).toBe(false)
    // e todo o resto continua idêntico ao REX
    for (const folha of folhas) {
      if (folha === 'REEMB') continue
      expect(rexg.get(folha), `coeficiente de ${folha} em REXG`).toBe(rex.get(folha))
    }
    expect(rexg.size).toBe(rex.size - 1)
  })

  it('RB_H é Receita de Vendas + Reembolsos, e a AV se apoia nela', () => {
    // A Análise Vertical usa a chave RB_H como base (src/lib/dre/av.ts, CHAVE_BASE_AV) —
    // a árvore de competência tem de ter essa chave, senão a coluna AV vira travessão.
    expect(porChave.has('RB_H')).toBe(true)
    expect([...expandir('RB_H').keys()].sort()).toEqual(['REEMB', 'RV'])
  })

  it('a cadeia de totalizadores encaixa (ROL → LB → LOP → LL → RAIR → REX)', () => {
    const soma = (a: Map<string, number>, b: Map<string, number>) => {
      const r = new Map(a)
      for (const [k, v] of b) r.set(k, (r.get(k) ?? 0) + v)
      return r
    }
    const igual = (a: Map<string, number>, b: Map<string, number>) => {
      expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
    }
    igual(expandir('ROL'), soma(expandir('RB_H'), expandir('IMP_H')))
    igual(expandir('LB'), soma(expandir('ROL'), expandir('CUSTO')))
    igual(expandir('LOP'), soma(expandir('LB'), expandir('DESP_H')))
    igual(expandir('LL'), soma(expandir('LOP'), expandir('ONOP_H')))
    igual(expandir('RAIR'), soma(expandir('LL'), expandir('INV_H')))
    igual(expandir('REX'), soma(expandir('RAIR'), expandir('DL')))
  })
})
