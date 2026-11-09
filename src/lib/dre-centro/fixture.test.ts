import { describe, it, expect } from 'vitest'
import type { DreLinha } from '@/lib/dre/schemas'
import { CHAVE_BASE_AV } from '@/lib/dre/av'
import { CENTROS } from './centros'
import { CATEGORIA_TAXA_ANTECIPACAO, fixtureDreCentro, pesosFicticios } from './fixture'
import { BLOCOS, EMPRESA, FIM, REX, TAXA, tot } from './empresa-sintetica'
import { montarAnoCentro } from './montar'
import {
  LINHA_RES, ROTULO_RESULTADO_OPERACIONAL, TITULO_TOTAL_LADO, TITULO_TOTAL_SELECAO,
  visaoConsolidado, visaoLadoALado, visaoLadoALadoConsolidado, visaoMensal,
} from './visoes'

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

  it('o CSC não tem receita própria (sem receita, a AV dele fica em travessão) — entrada e pagamento seguem a operação', () => {
    expect(tot(byKey(d.arvores.csc, 'RB_H').meses)).toBe(0)
    expect(tot(byKey(d.arvores.csc, 'PAG_H').meses)).toBe(0)
    for (const c of ['trips', 'weddings', 'corp'] as const) expect(tot(byKey(d.arvores[c], 'RB_H').meses)).toBeGreaterThan(0)
  })

  it('Resultado de caixa: Σ centros ≡ REX da Empresa em todo mês realizado (inv. 1)', () => {
    const ano = montarAnoCentro(d)
    for (let i = 0; i < FIM; i++) {
      const s = CENTROS.reduce((acc, c) => acc + byKey(ano.porCentro[c].linhas, LINHA_RES.chave).meses[i], 0)
      expect(s).toBeCloseTo(REX[i], 6)
    }
  })

  it('o operacional difere da Empresa só pelo deslocamento e pela taxa (inv. 4)', () => {
    const ano = montarAnoCentro(d)
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
    const ano = montarAnoCentro(d)
    expect(ano.notas.naoIdentificadas).toHaveLength(1)
    expect(ano.notas.naoIdentificadas[0].data).toBe('2026-10-08')
    expect(ano.notas.taxaPendente).toBeLessThan(0)
    expect(ano.notas.coberturaPct).toBeGreaterThan(0.98)
    expect(ano.notas.naoDevolvido).toBeGreaterThan(0)
  })
})

describe('visões', () => {
  const ano = montarAnoCentro(fixtureDreCentro(EMPRESA, BLOCOS))

  it('Mensal: 11 meses (o último parcial) + total + AV', () => {
    const v = visaoMensal({ ano: 2026, centro: 'weddings', lc: ano.porCentro.weddings, fim: FIM, parcial: true })
    expect(v.colunas.map(c => c.id)).toEqual([...Array.from({ length: 11 }, (_, i) => `m${i + 1}`), 'total', 'av'])
    expect(v.colunas[10].rotulo).toBe('Nov · parcial')
    expect(v.colunas[11].rotulo).toBe('Total 2026')
    // memória de saldo: o total é o saldo do fim, não a soma
    expect(v.valores.total['m:MEM_SALDO_OP']).toBe(ano.porCentro.weddings.memoria[1].meses[FIM - 1])
  })

  it('Consolidado com um só ano coberto: YTD + AV, sem Δ%', () => {
    const v = visaoConsolidado({
      mesJanela: FIM,
      anos: [{ ano: 2026, parcial: true, fim: FIM, lc: ano.porCentro.csc }],
    })!
    expect(v.colunas.map(c => c.rotulo)).toEqual(['YTD 26', 'AV'])
  })

  // Num ano FECHADO, a coluna "YTD" corta jan..mesJanela — a AV divide pela Receita Bruta do centro NA MESMA janela.
  it('Consolidado com dois anos: ano cheio + YTD + AV na mesma janela + Δ%', () => {
    const v = visaoConsolidado({
      mesJanela: FIM,
      anos: [
        { ano: 2025, parcial: false, fim: 12, lc: ano.porCentro.weddings },
        { ano: 2026, parcial: true, fim: FIM, lc: ano.porCentro.weddings },
      ],
    })!
    expect(v.colunas.map(c => c.rotulo)).toEqual(['2025', 'YTD 25', 'AV', 'Δ% YTD 25·26', 'YTD 26', 'AV'])
    const soma11 = (k: string) => ano.porCentro.weddings.linhas.find(l => l.chave === k)!.meses.slice(0, FIM).reduce((s, x) => s + x, 0)
    expect(v.valores.av2025['b:REX']).toBeCloseTo((soma11('REX') / soma11(CHAVE_BASE_AV)) * 100, 9)
    expect(v.valores.av2025[`b:${CHAVE_BASE_AV}`]).toBeCloseTo(100, 9)
    expect(v.valores.d2025['b:REX']).toBe(0) // mesmo centro nos dois anos ⇒ Δ% zero
  })

  // Decisão do Yan no PR #311: a AV do CSC segue a regra das demais — 100% na Receita Bruta DELE (não mais a da empresa).
  it('AV do CSC = a das demais: 100% na Receita Bruta do próprio CSC; base ≤ 0 → travessão (regra da Empresa)', () => {
    const csc = ano.porCentro.csc
    // na fixture o CSC não tem receita: toda a coluna AV fica em travessão, nada de AV*
    const semReceita = visaoMensal({ ano: 2026, centro: 'csc', lc: csc, fim: FIM, parcial: true })
    expect(semReceita.colunas.at(-1)).toMatchObject({ rotulo: 'AV' })
    expect(Object.values(semReceita.valores.av).every(x => x == null)).toBe(true)
    // com receita própria positiva, a linha da receita bruta é 100% e as demais dividem por ela
    const comReceita = {
      ...csc,
      linhas: csc.linhas.map(l => (l.chave === CHAVE_BASE_AV ? { ...l, meses: Array.from({ length: 12 }, () => 1_000) } : l)),
    }
    const v = visaoMensal({ ano: 2026, centro: 'csc', lc: comReceita, fim: FIM, parcial: true })
    expect(v.valores.av[`b:${CHAVE_BASE_AV}`]).toBeCloseTo(100, 9)
    const rex = comReceita.linhas.find(l => l.chave === 'REX')!.meses.slice(0, FIM).reduce((s, x) => s + x, 0)
    expect(v.valores.av['b:REX']).toBeCloseTo((rex / (1_000 * FIM)) * 100, 9)
  })

  // Pedidos do Yan no PR #311 ("Todos", id `lado`): Mensal = meses empilhados (sem acumulado); Consolidado = um bloco por ano.
  it('Todos › Mensal: um bloco por mês (5 centros) + Total; Σ centros do mês = REX do mês; Total = REX do ano', () => {
    const v = visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true })
    expect(v.grupos.map(g => g.rotulo)).toEqual(['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov · parcial'])
    expect(v.grupos.every(g => g.span === CENTROS.length)).toBe(true)
    expect(v.grupos.reduce((s, g) => s + g.span, 0)).toBe(v.colunas.filter(c => !c.fixa).length)
    // 11 meses × 5 centros + o Total
    expect(v.colunas.filter(c => c.tipo === 'valor')).toHaveLength(FIM * CENTROS.length + 1)
    const k = `b:${LINHA_RES.chave}`
    expect(v.valores.total[k]).toBeCloseTo(tot(REX.slice(0, FIM)), 4)
    let somaTudo = 0
    for (let i = 0; i < FIM; i++) {
      const doMes = CENTROS.reduce((s, c) => s + (v.valores[`m${i + 1}:${c}`][k] ?? 0), 0)
      expect(doMes).toBeCloseTo(REX[i], 6)
      somaTudo += doMes
    }
    expect(v.valores.total[k]).toBeCloseTo(somaTudo, 6)
    for (const c of CENTROS) {
      // memória de saldo no mês = saldo do fim do mês; a de soma = a do mês
      expect(v.valores[`m${FIM}:${c}`]['m:MEM_SALDO_OP']).toBe(ano.porCentro[c].memoria[1].meses[FIM - 1])
      expect(v.valores[`m3:${c}`]['m:MEM_CEDIDOS']).toBe(ano.porCentro[c].memoria[0].meses[2])
    }
  })

  it('Todos › Consolidado com um ano: um bloco YTD com os 5 centros e a AV de cada um; Total = Σ centros = REX', () => {
    const v = visaoLadoALadoConsolidado({
      mesJanela: FIM,
      anos: [{ ano: 2026, parcial: true, fim: FIM, porCentro: ano.porCentro }],
    })!
    expect(v.grupos).toEqual([expect.objectContaining({ rotulo: 'YTD 26', span: CENTROS.length * 2 })])
    expect(v.colunas.at(-2)).toMatchObject({ id: 'total', rotulo: 'Total YTD 26', fixa: 'total' })
    const k = `b:${LINHA_RES.chave}`
    const soma = CENTROS.reduce((s, c) => s + (v.valores[`y2026:${c}`][k] ?? 0), 0)
    expect(v.valores.total[k]).toBeCloseTo(soma, 6)
    expect(v.valores.total[k]).toBeCloseTo(tot(REX.slice(0, FIM)), 4)
    // AV de cada centro sobre a própria receita (CSC inclusive); na planilha cada AV leva o centro
    const csc = v.colunas.find(c => c.id === 'av2026:csc')!
    expect(csc).toMatchObject({ rotulo: 'AV', rotuloExport: 'AV CSC' })
    expect(csc.ajuda).toBeFalsy()
  })

  it('vários centros marcados (parcial): colunas só deles, Total = soma deles, título do Total avisa', () => {
    const cs = ['trips', 'corp'] as const
    const k = `b:${LINHA_RES.chave}`
    const m = visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true, centros: cs })
    expect(m.grupos.every(g => g.span === cs.length)).toBe(true)
    expect(m.colunas.filter(c => !c.fixa).every(c => /:(trips|corp)$/.test(c.id))).toBe(true)
    const somaMeses = cs.reduce((s, c) => s + Array.from({ length: FIM }, (_, i) => m.valores[`m${i + 1}:${c}`][k] ?? 0).reduce((a, x) => a + x, 0), 0)
    expect(m.valores.total[k]).toBeCloseTo(somaMeses, 6)
    expect(m.colunas.find(c => c.id === 'total')?.titulo).toBe(TITULO_TOTAL_SELECAO)
    const c = visaoLadoALadoConsolidado({
      mesJanela: FIM, centros: cs,
      anos: [{ ano: 2026, parcial: true, fim: FIM, porCentro: ano.porCentro }],
    })!
    expect(c.grupos[0].span).toBe(cs.length * 2)
    expect(c.valores.total[k]).toBeCloseTo((c.valores['y2026:trips'][k] ?? 0) + (c.valores['y2026:corp'][k] ?? 0), 6)
    // com os cinco (Todos), o título volta a ser o da paridade com a Empresa
    expect(visaoLadoALado({ ano: 2026, porCentro: ano.porCentro, fim: FIM, parcial: true }).colunas.find(x => x.id === 'total')?.titulo)
      .toBe(TITULO_TOTAL_LADO)
  })

  it('Todos › Consolidado com dois anos: ano inteiro, YTD, Δ% por centro e Total do YTD de referência', () => {
    const v = visaoLadoALadoConsolidado({
      mesJanela: FIM,
      anos: [
        { ano: 2025, parcial: false, fim: 12, porCentro: ano.porCentro },
        { ano: 2026, parcial: true, fim: FIM, porCentro: ano.porCentro },
      ],
    })!
    expect(v.grupos.map(g => g.rotulo)).toEqual(['2025', 'YTD 25', 'Δ% YTD 25·26', 'YTD 26'])
    expect(v.grupos.reduce((s, g) => s + g.span, 0)).toBe(v.colunas.filter(c => !c.fixa).length)
    const k = `b:${LINHA_RES.chave}`
    for (const c of CENTROS) expect(v.valores[`d2025:${c}`][k]).toBe(0) // mesmo dado nos dois anos ⇒ Δ% zero
    expect(v.colunas.at(-2)?.rotulo).toBe('Total YTD 26')
  })
})
