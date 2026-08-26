import { describe, it, expect } from 'vitest'
import { folhasPorGrupo, somarGrupos, totalFolhas } from './folhas'
import type { DreLinha, DreMensalLike } from './schemas'

// A agregação por folha é a base das duas cascatas. O que se trava aqui é (a) que ela
// deriva a árvore VIVA do próprio payload, (b) que trabalha em centavos inteiros e
// (c) que a bandeja fica de fora.

function cat(g: string, meses: number[]): DreLinha {
  const doze = [...meses, ...Array.from({ length: 12 - meses.length }, () => 0)]
  return {
    t: 'cat', rotulo: `${g} cat`, estrela: false, meses: doze, venc: 0,
    total: doze.reduce((s, v) => s + v, 0), g, categoria_id: Math.random(),
  } as DreLinha
}

function bloco(chave: string, meses: number[]): DreLinha {
  const doze = [...meses, ...Array.from({ length: 12 - meses.length }, () => 0)]
  return {
    t: 'tot', rotulo: chave, estrela: false, meses: doze, venc: 0,
    total: doze.reduce((s, v) => s + v, 0), chave,
  } as DreLinha
}

function payload(linhas: DreLinha[], bandeja: DreMensalLike['bandeja'] = []): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-08-15', relacao: 'corrente', mes_corrente: 8,
    token_estrutura: null, linhas, bandeja,
  }
}

describe('folhasPorGrupo — a árvore viva sai do próprio payload', () => {
  it('agrupa as categorias pelo bloco pai (`g`)', () => {
    const p = payload([cat('ADM', [10, 20]), cat('ADM', [5, 0]), cat('RH', [100])])
    const f = folhasPorGrupo(p, 12)
    expect([...f.keys()].sort()).toEqual(['ADM', 'RH'])
    expect(f.get('ADM')).toBe(3500)  // (10+20+5) reais em centavos
    expect(f.get('RH')).toBe(10_000)
  })

  it('IGNORA as linhas de bloco — somá-las contaria o mesmo dinheiro duas vezes', () => {
    const p = payload([cat('ADM', [10]), bloco('DESP_H', [10]), bloco('LOP', [10])])
    const f = folhasPorGrupo(p, 12)
    expect([...f.keys()]).toEqual(['ADM'])
    expect(totalFolhas(f)).toBe(1000)
  })

  it('respeita a janela de meses', () => {
    const p = payload([cat('ADM', [1, 2, 3, 4])])
    expect(folhasPorGrupo(p, 2).get('ADM')).toBe(300)
    expect(folhasPorGrupo(p, 4).get('ADM')).toBe(1000)
  })

  it('janela 0 zera tudo; janela acima de 12 é o ano inteiro', () => {
    const p = payload([cat('ADM', [1, 2, 3])])
    expect(totalFolhas(folhasPorGrupo(p, 0))).toBe(0)
    expect(folhasPorGrupo(p, 99).get('ADM')).toBe(600)
  })

  it('a BANDEJA fica de fora — ela não pertence a bloco nenhum', () => {
    const p = payload([cat('ADM', [10])], [{
      rotulo: 'órfã', grupo_monde: 'G', chave: 'g · d',
      meses: Array.from({ length: 12 }, () => 500), venc: 0, total: 6000,
    }])
    expect(totalFolhas(folhasPorGrupo(p, 12))).toBe(1000)
  })

  it('categoria sem bloco pai é ignorada em vez de derrubar a cascata', () => {
    const orfa = { ...cat('X', [10]) } as DreLinha
    delete (orfa as Partial<DreLinha>).g
    expect(totalFolhas(folhasPorGrupo(payload([orfa, cat('ADM', [1])]), 12))).toBe(100)
  })
})

describe('centavos inteiros — a aritmética não pode acumular erro de float', () => {
  it('soma exata onde o float erraria', () => {
    // 0.1 + 0.2 !== 0.3 em ponto flutuante; em centavos, 10 + 20 === 30.
    const p = payload([cat('ADM', [0.1, 0.2])])
    expect(folhasPorGrupo(p, 12).get('ADM')).toBe(30)
  })

  it('valores com meio centavo não escapam pelo Math.round(v*100)', () => {
    // 1.005 * 100 dá 100.49999… em binário; o toCentavos canônico lê a representação
    // decimal e devolve 101 (é por isso que ele existe).
    const p = payload([cat('ADM', [1.005])])
    expect(folhasPorGrupo(p, 12).get('ADM')).toBe(101)
  })
})

describe('somarGrupos — chave ausente vale zero', () => {
  it('permite nomear folha que o regime não tem, sem ramificar no chamador', () => {
    const f = folhasPorGrupo(payload([cat('INV', [100])]), 12)
    expect(somarGrupos(f, ['INV', 'IMOB'])).toBe(10_000)
    expect(somarGrupos(f, ['REEMB'])).toBe(0)
    expect(somarGrupos(f, [])).toBe(0)
  })
})
