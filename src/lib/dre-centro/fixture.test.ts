import { describe, it, expect } from 'vitest'
import type { DreLinha } from '@/lib/dre/schemas'
import { CENTROS } from './centros'
import { CATEGORIA_TAXA_ANTECIPACAO, fixtureDreCentro, pesosFicticios } from './fixture'
import { BLOCOS, EMPRESA, FIM, REX, TAXA, tot } from './empresa-sintetica'
import { montarAnoCentro } from './montar'
import { LINHA_RES, ROTULO_RESULTADO_OPERACIONAL, visaoConsolidado, visaoLadoALado, visaoMensal } from './visoes'

describe('pesos fictícios', () => {
  it.each(['ENT_H', 'PAG_H', 'RH', 'ADM', undefined])('somam 1 em todo mês (%s)', (folha) => {
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

  it('o CSC não tem receita própria (a AV dele usa a da empresa) — entrada e pagamento seguem a operação', () => {
    expect(tot(byKey(d.arvores.csc, 'RB_H').meses)).toBe(0)
    expect(tot(byKey(d.arvores.csc, 'PAG_H').meses)).toBe(0)
    for (const c of ['trips', 'weddings', 'corp'] as const) expect(tot(byKey(d.arvores[c], 'RB_H').meses)).toBeGreaterThan(0)
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
  const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS), Array.from({ length: 12 }, () => 100_000))

  it('Mensal: 11 meses (o último parcial) + total + AV', () => {
    const v = visaoMensal({ ano: 2026, centro: 'weddings', lc: ano.porCentro.weddings, fim: FIM, parcial: true, rbEmpresaMeses: null })
    expect(v.colunas.map(c => c.id)).toEqual([...Array.from({ length: 11 }, (_, i) => `m${i + 1}`), 'total', 'av'])
    expect(v.colunas[10].rotulo).toBe('Nov · parcial')
    expect(v.colunas[11].rotulo).toBe('Total 2026*')
    // memória de saldo: o total é o saldo do fim, não a soma
    expect(v.valores.total['m:MEM_SALDO_OP']).toBe(ano.porCentro.weddings.memoria[1].meses[FIM - 1])
  })

  it('Consolidado com um só ano coberto: YTD + AV, sem Δ%', () => {
    const v = visaoConsolidado({
      centro: 'csc', mesJanela: FIM,
      anos: [{ ano: 2026, parcial: true, fim: FIM, lc: ano.porCentro.csc, rbEmpresaMeses: ano.rbEmpresaMeses }],
    })!
    expect(v.colunas.map(c => c.rotulo)).toEqual(['YTD 26*', 'AV*'])
  })

  // Achado ALTO do revisor: num ano FECHADO, a coluna "YTD" corta jan..mesJanela — e a AV* do CSC tem
  // de dividir pela receita da empresa NA MESMA janela, não pelos 12 meses do ano.
  it('Consolidado com dois anos: ano cheio + YTD + AV* do CSC na mesma janela + Δ%', () => {
    const rb2025 = Array.from({ length: 12 }, (_, i) => 1_000 * (i + 1)) // jan 1.000 … dez 12.000
    const v = visaoConsolidado({
      centro: 'csc', mesJanela: FIM,
      anos: [
        { ano: 2025, parcial: false, fim: 12, lc: ano.porCentro.csc, rbEmpresaMeses: rb2025 },
        { ano: 2026, parcial: true, fim: FIM, lc: ano.porCentro.csc, rbEmpresaMeses: ano.rbEmpresaMeses },
      ],
    })!
    expect(v.colunas.map(c => c.rotulo)).toEqual(['2025', 'YTD 25', 'AV*', 'Δ% YTD 25·26', 'YTD 26*', 'AV*'])
    const rex = ano.porCentro.csc.linhas.find(l => l.chave === 'REX')!
    const ytd11 = rex.meses.slice(0, FIM).reduce((s, x) => s + x, 0)
    const rb11 = rb2025.slice(0, FIM).reduce((s, x) => s + x, 0) // 66.000 (jan..nov), não 78.000
    expect(v.valores.av2025['b:REX']).toBeCloseTo((ytd11 / rb11) * 100, 9)
    expect(v.valores.d2025['b:REX']).toBe(0) // mesmo centro nos dois anos ⇒ Δ% zero
  })

  it('Lado a lado: Total = Σ centros e Resultado de caixa = REX da Empresa no ano', () => {
    const v = visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true, rbEmpresaMeses: null })
    const k = `b:${LINHA_RES.chave}`
    expect(v.valores.total[k]).toBeCloseTo(tot(REX.slice(0, FIM)), 4)
    // 11 meses × 5 centros + 5 centros no acumulado + o Total
    expect(v.colunas.filter(c => c.tipo === 'valor')).toHaveLength(FIM * CENTROS.length + CENTROS.length + 1)
    const somaCentros = CENTROS.reduce((s, c) => s + (v.valores[`v:${c}`][k] ?? 0), 0)
    expect(v.valores.total[k]).toBeCloseTo(somaCentros, 6)
  })

  // Pedido do Yan no PR #311: os meses empilhados, um bloco por mês com os 5 centros.
  it('Lado a lado: um bloco por mês (5 centros), o mês fecha com o acumulado e Σ centros do mês = REX do mês', () => {
    const v = visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true, rbEmpresaMeses: null })
    expect(v.grupos.map(g => g.rotulo)).toEqual([
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov · parcial', 'Acumulado 2026',
    ])
    expect(v.grupos.slice(0, FIM).every(g => g.span === CENTROS.length)).toBe(true)
    // os spans cobrem exatamente as colunas não presas
    expect(v.grupos.reduce((s, g) => s + g.span, 0)).toBe(v.colunas.filter(c => !c.fixa).length)
    const k = `b:${LINHA_RES.chave}`
    for (let i = 0; i < FIM; i++) {
      const doMes = CENTROS.reduce((s, c) => s + (v.valores[`m${i + 1}:${c}`][k] ?? 0), 0)
      expect(doMes).toBeCloseTo(REX[i], 6)
    }
    for (const c of CENTROS) {
      const somaMeses = Array.from({ length: FIM }, (_, i) => v.valores[`m${i + 1}:${c}`][k] ?? 0).reduce((s, x) => s + x, 0)
      expect(somaMeses).toBeCloseTo(v.valores[`v:${c}`][k] ?? 0, 6)
      // memória de saldo no mês = saldo do fim do mês; a de soma = a do mês
      expect(v.valores[`m${FIM}:${c}`]['m:MEM_SALDO_OP']).toBe(ano.porCentro[c].memoria[1].meses[FIM - 1])
      expect(v.valores[`m3:${c}`]['m:MEM_CEDIDOS']).toBe(ano.porCentro[c].memoria[0].meses[2])
    }
  })
})
