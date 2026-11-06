import { describe, it, expect } from 'vitest'
import type { DreLinha } from '@/lib/dre/schemas'
import { CENTROS } from './centros'
import { CATEGORIA_TAXA_ANTECIPACAO, fixtureDreCentro, pesosFicticios } from './fixture'
import { BLOCOS, EMPRESA, FIM, REX, TAXA, tot } from './empresa-sintetica'
import { montarAnoCentro } from './montar'
import { LINHA_RES, ROTULO_RESULTADO_OPERACIONAL, visaoConsolidado, visaoLadoALado, visaoMensal } from './visoes'

describe('pesos fictícios', () => {
  it.each(['RV', 'RH', 'ADM', undefined])('somam 1 em todo mês (%s)', (folha) => {
    for (let mes = 1; mes <= 12; mes++) {
      const w = pesosFicticios(folha, mes)
      expect(CENTROS.reduce((s, c) => s + w[c], 0)).toBeCloseTo(1, 12)
    }
  })
})

describe('fixtureDreCentro — a soma dos centros fecha com a Empresa', () => {
  const d = fixtureDreCentro(EMPRESA, BLOCOS)
  const byKey = (ls: DreLinha[], k: string) => ls.find(l => l.chave === k || (l.t === 'cat' && `c${l.categoria_id}` === k))!

  it('a taxa de antecipação sai da árvore de todo centro', () => {
    for (const c of CENTROS) {
      expect(d.arvores[c].some(l => l.categoria_id === CATEGORIA_TAXA_ANTECIPACAO)).toBe(false)
    }
    expect(d.taxaMonde.csc.slice(0, FIM)).toEqual(TAXA.slice(0, FIM))
  })

  it('categorias sem deslocamento: Σ centros ≡ Empresa, mês a mês', () => {
    for (const k of ['c2', 'c3', 'c4']) {
      const emp = byKey(EMPRESA.linhas, k)
      for (let i = 0; i < FIM; i++) {
        const s = CENTROS.reduce((acc, c) => acc + byKey(d.arvores[c], k).meses[i], 0)
        expect(s).toBeCloseTo(emp.meses[i], 6)
      }
    }
  })

  it('o CSC não tem receita própria (a AV dele usa a da empresa)', () => {
    expect(tot(byKey(d.arvores.csc, 'RB_H').meses)).toBe(0)
  })

  it('Resultado de caixa: Σ centros ≡ REX da Empresa em todo mês realizado (inv. 1)', () => {
    const ano = montarAnoCentro(d, null)
    for (let i = 0; i < FIM; i++) {
      const s = CENTROS.reduce((acc, c) => acc + byKey(ano.porCentro[c].linhas, LINHA_RES.chave).meses[i], 0)
      expect(s).toBeCloseTo(REX[i], 6)
    }
  })

  it('o operacional difere da Empresa só pelo deslocamento e pela taxa (inv. 4)', () => {
    const ano = montarAnoCentro(d, null)
    for (let i = 0; i < FIM; i++) {
      const op = CENTROS.reduce((acc, c) => acc + byKey(d.arvores[c], 'REX').meses[i], 0)
      const desloc = d.recebiveis.reduce((s, r) =>
        s - (r.mesAntecipacao === i + 1 ? r.valor : 0) + (r.mesVencimento === i + 1 ? r.valor : 0), 0)
      expect(op).toBeCloseTo(REX[i] - TAXA[i] + desloc, 6)
    }
    // e o rótulo do último totalizador é o da D1
    expect(byKey(ano.porCentro.trips.linhas, 'REX').rotulo).toBe(ROTULO_RESULTADO_OPERACIONAL)
  })

  it('notas: a última antecipação fica parcialmente identificada e com taxa pendente', () => {
    const ano = montarAnoCentro(d, null)
    expect(ano.notas.naoIdentificadas).toHaveLength(1)
    expect(ano.notas.naoIdentificadas[0].data).toBe('2026-10-08')
    expect(ano.notas.taxaPendente).toBeLessThan(0)
    expect(ano.notas.coberturaPct).toBeGreaterThan(0.98)
    expect(ano.notas.naoDevolvido).toBeGreaterThan(0)
  })
})

describe('visões', () => {
  const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS), 1_000_000)

  it('Mensal: 11 meses (o último parcial) + total + AV', () => {
    const v = visaoMensal({ ano: 2026, centro: 'weddings', lc: ano.porCentro.weddings, fim: FIM, parcial: true, rbEmpresa: 1 })
    expect(v.colunas.map(c => c.id)).toEqual([...Array.from({ length: 11 }, (_, i) => `m${i + 1}`), 'total', 'av'])
    expect(v.colunas[10].rotulo).toBe('Nov · parcial')
    expect(v.colunas[11].rotulo).toBe('Total 2026*')
    // memória de saldo: o total é o saldo do fim, não a soma
    expect(v.valores.total['m:MEM_SALDO_OP']).toBe(ano.porCentro.weddings.memoria[1].meses[FIM - 1])
  })

  it('Consolidado com um só ano coberto: YTD + AV, sem Δ%', () => {
    const v = visaoConsolidado({
      centro: 'csc', mesJanela: FIM,
      anos: [{ ano: 2026, parcial: true, fim: FIM, lc: ano.porCentro.csc, rbEmpresa: ano.rbEmpresa }],
    })!
    expect(v.colunas.map(c => c.rotulo)).toEqual(['YTD 26*', 'AV*'])
  })

  it('Lado a lado: Total = Σ centros e Resultado de caixa = REX da Empresa no ano', () => {
    const v = visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true, rbEmpresa: null })
    const k = `b:${LINHA_RES.chave}`
    expect(v.valores.total[k]).toBeCloseTo(tot(REX.slice(0, FIM)), 4)
    expect(v.colunas.filter(c => c.tipo === 'valor')).toHaveLength(6)
    const somaCentros = CENTROS.reduce((s, c) => s + (v.valores[`v:${c}`][k] ?? 0), 0)
    expect(v.valores.total[k]).toBeCloseTo(somaCentros, 6)
  })
})
