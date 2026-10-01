import { describe, it, expect } from 'vitest'
import {
  montarExportacaoDre, nomeArquivoExportacao, rotuloSeguro,
  FMT_MOEDA, FMT_PCT, NOME_ABA_MENSAL, NOME_ABA_CONSOLIDADO,
  type Celula, type AbaExportacao, type EntradaExportacaoDre,
} from './exportar'
import type { DreLinha, DreBandejaLinha, DreMensalLike, ConsolidadoAno } from './schemas'

// ⚠️ Números ILUSTRATIVOS (como em `av.test.ts`): o módulo é puro e a estrutura do DRE é
// dado editável — nada aqui depende do dado vivo.
//
// A fixture é de um ano CORRENTE (jul/2026, `mes_corrente` 7), no modo 'tudo':
//   · RB_H (Receita Bruta de Vendas) = a base da AV, com 3 categorias (uma delas com rótulo
//     que começa em "=", para a guarda anti-fórmula; uma ZERADA, para provar 0 ≠ ausência);
//   · ENT fica ACIMA da base (sem AV); LUC é um totalizador com `estrela`;
//   · 1 item na bandeja; 2 anos no Consolidado (2025 fechado, 2026 corrente) em que a
//     categoria 2 NÃO existia em 2025 (ausência).
// Nenhum teste passa `abertos`: a entrada do export não tem esse estado — é o ponto.

const doze = (n: number) => Array.from({ length: 12 }, () => n)
/** 7 meses realizados com `a`, 5 meses previstos com `b`. */
const hibrido = (a: number, b: number) => [...Array.from({ length: 7 }, () => a), ...Array.from({ length: 5 }, () => b)]

function linha(over: Partial<DreLinha> & Pick<DreLinha, 't' | 'rotulo' | 'meses' | 'total'>): DreLinha {
  return { estrela: false, venc: 0, ...over } as DreLinha
}

const LINHAS: DreLinha[] = [
  linha({ t: 'blocoH', rotulo: '(+) ENTRADA DE CLIENTES', chave: 'ENT', meses: hibrido(10, 10), prev_corrente: 10, total: 190 }),
  linha({ t: 'blocoH', rotulo: 'RECEITA BRUTA DE VENDAS', chave: 'RB_H', meses: hibrido(100, 50), prev_corrente: 30, total: 980 }),
  linha({ t: 'cat', rotulo: 'Vendas A', g: 'RB_H', categoria_id: 1, meses: hibrido(60, 30), prev_corrente: 20, total: 590 }),
  linha({ t: 'cat', rotulo: '= Vendas B', g: 'RB_H', categoria_id: 2, meses: hibrido(40, 20), prev_corrente: 10, total: 390 }),
  linha({ t: 'cat', rotulo: 'Zerada', g: 'RB_H', categoria_id: 3, meses: doze(0), prev_corrente: 0, total: 0 }),
  linha({ t: 'sub', rotulo: 'Subgrupo', chave: 'SUB', meses: hibrido(5, 5), prev_corrente: 5, total: 65 }),
  linha({ t: 'tot', rotulo: '(=) LUCRO', chave: 'LUC', estrela: true, meses: hibrido(5, 5), prev_corrente: 1, total: 61 }),
]

const BANDEJA: DreBandejaLinha[] = [
  { categoria_id: 99, rotulo: 'Órfã', grupo_monde: 'Grupo X', meses: hibrido(1, 1), prev_corrente: 0.5, venc: 0, total: 12.5 },
]

function dados(over: Partial<DreMensalLike> = {}): DreMensalLike {
  return {
    ano: 2026, hoje: '2026-07-15', relacao: 'corrente', mes_corrente: 7, token_estrutura: null,
    linhas: LINHAS, bandeja: BANDEJA, ...over,
  }
}

const CONS_2025: ConsolidadoAno = {
  ano: 2025, corrente: false,
  porLinha: {
    'b:ENT':  { total: 100,  ytd: 60,  venc: 0 },
    'b:RB_H': { total: 1000, ytd: 600, venc: 0 },
    'c:1':    { total: 600,  ytd: 360, venc: 0 },
    // 'c:2' ausente DE PROPÓSITO: a categoria não existia em 2025.
    'c:3':    { total: 0,    ytd: 0,   venc: 0 },
    'b:LUC':  { total: 50,   ytd: 30,  venc: 0 },
  },
}
const CONS_2026: ConsolidadoAno = {
  ano: 2026, corrente: true,
  porLinha: {
    'b:ENT':  { total: 120, ytd: 70,  venc: 5 },
    'b:RB_H': { total: 980, ytd: 700, venc: 10 },
    'c:1':    { total: 590, ytd: 420, venc: 4 },
    'c:2':    { total: 390, ytd: 280, venc: 6 },
    'c:3':    { total: 0,   ytd: 0,   venc: 0 },
    'b:LUC':  { total: 61,  ytd: 35,  venc: 1 },
    'c:99':   { total: 12.5, ytd: 7,  venc: 0 },
  },
}

function entrada(over: Partial<EntradaExportacaoDre> = {}): EntradaExportacaoDre {
  return {
    titulo: 'Demonstrativo de Resultado por Fluxo de Caixa',
    semPrevisto: false,
    dados: dados(),
    ano: 2026,
    totalModo: 'tudo',
    anosSeguintes: [{
      ano: 2027,
      totais: { 'b:RB_H': 1000, 'c:1': 600, 'c:2': 400, 'b:ENT': 50, 'b:LUC': 100, 'c:99': 7 },
    }],
    consolidadoAnos: [CONS_2025, CONS_2026],
    anosCons: [CONS_2025, CONS_2026],
    mesJanela: 7,
    mesParcial: null,
    geradoEm: '2026-10-01',
    ...over,
  }
}

// ── Navegação na saída ─────────────────────────────────────────────────────────
// Layout de cada aba: 3 linhas de título (título · recorte · em branco), cabeçalho, corpo.
const IDX_CABECALHO = 3

function aba(e: EntradaExportacaoDre, nome: string): AbaExportacao {
  const a = montarExportacaoDre(e).abas.find(x => x.nome === nome)
  if (!a) throw new Error(`aba ${nome} não encontrada`)
  return a
}
const cabecalho = (a: AbaExportacao) => a.linhas[IDX_CABECALHO] as string[]
const corpo = (a: AbaExportacao) => a.linhas.slice(IDX_CABECALHO + 1)
const contas = (a: AbaExportacao) => corpo(a).map(l => l[0] as string)

/** Linha do corpo pelo rótulo (sem o recuo). */
function linhaPor(a: AbaExportacao, rotulo: string): Celula[] {
  const l = corpo(a).find(r => typeof r[0] === 'string' && r[0].trim() === rotulo)
  if (!l) throw new Error(`linha "${rotulo}" não encontrada`)
  return l
}
/** Célula numérica pelo cabeçalho da coluna. */
function cel(a: AbaExportacao, rotuloLinha: string, rotuloColuna: string, ocorrencia = 0): Celula {
  const cab = cabecalho(a)
  const idxs = cab.map((c, i) => (c === rotuloColuna ? i : -1)).filter(i => i >= 0)
  if (idxs.length <= ocorrencia) throw new Error(`coluna "${rotuloColuna}"#${ocorrencia} não encontrada`)
  return linhaPor(a, rotuloLinha)[idxs[ocorrencia]]
}
function valor(c: Celula): number {
  if (c === null || typeof c === 'string') throw new Error(`esperava célula numérica, veio ${String(c)}`)
  return c.v
}

// ── Estrutura geral ────────────────────────────────────────────────────────────

describe('montarExportacaoDre — estrutura', () => {
  it('SEMPRE duas abas, Mensal e Consolidado, nessa ordem', () => {
    const ex = montarExportacaoDre(entrada())
    expect(ex.abas.map(a => a.nome)).toEqual([NOME_ABA_MENSAL, NOME_ABA_CONSOLIDADO])
  })

  it('o regime vem de semPrevisto (arquivo competencia × caixa)', () => {
    expect(montarExportacaoDre(entrada()).regime).toBe('caixa')
    expect(montarExportacaoDre(entrada({ semPrevisto: true, totalModo: 'realizado' })).regime).toBe('competencia')
  })

  it('nome do arquivo: sem acento, regime-ano-data', () => {
    expect(nomeArquivoExportacao('caixa', 2026, '2026-10-01')).toBe('dre-caixa-2026-2026-10-01.xlsx')
    expect(nomeArquivoExportacao('competencia', 2025, '2026-10-01')).toBe('dre-competencia-2025-2026-10-01.xlsx')
  })

  it('cada aba abre com título, recorte (ano/modo/data de geração) e linha em branco', () => {
    const m = aba(entrada(), NOME_ABA_MENSAL)
    expect(m.linhas[0]).toEqual(['Demonstrativo de Resultado por Fluxo de Caixa'])
    const recorteM = m.linhas[1][0] as string
    expect(recorteM).toContain('ano 2026')
    expect(recorteM).toContain('Realizado + Previsto')
    expect(recorteM).toContain('01/10/2026')
    expect(m.linhas[2]).toEqual([])

    const c = aba(entrada(), NOME_ABA_CONSOLIDADO)
    const recorteC = c.linhas[1][0] as string
    expect(recorteC).toContain('2025, 2026')
    expect(recorteC).toContain('jan a jul')
  })

  it('largura de colunas: uma por coluna do cabeçalho', () => {
    for (const a of montarExportacaoDre(entrada()).abas) {
      expect(a.larguras).toHaveLength(cabecalho(a).length)
    }
  })

  it('toda linha de dados tem tantas células quanto o cabeçalho (exceto o separador da bandeja)', () => {
    for (const a of montarExportacaoDre(entrada()).abas) {
      const n = cabecalho(a).length
      for (const l of corpo(a)) {
        if (typeof l[0] === 'string' && l[0].startsWith('Não classificadas')) {
          expect(l).toHaveLength(1)
          continue
        }
        expect(l).toHaveLength(n)
      }
    }
  })
})

// ── Linhas: tudo entra ──────────────────────────────────────────────────────────

describe('todas as linhas expandidas', () => {
  it.each([NOME_ABA_MENSAL, NOME_ABA_CONSOLIDADO])('%s: blocos, categorias e bandeja, na ordem da tela', nome => {
    const a = aba(entrada(), nome)
    // Nenhum estado de "recolhido" entra na assinatura: as categorias estão aqui por
    // construção. A ordem é a do payload, e a bandeja vem depois, com o separador.
    expect(contas(a).map(c => c.trim())).toEqual([
      '(+) ENTRADA DE CLIENTES',
      'RECEITA BRUTA DE VENDAS',
      'Vendas A',
      "'= Vendas B",
      'Zerada',
      'Subgrupo',
      '(=) LUCRO *',
      'Não classificadas (1)',
      'Órfã',
    ])
  })

  it('sem itens na bandeja, nada de separador "Não classificadas"', () => {
    const a = aba(entrada({ dados: dados({ bandeja: [] }) }), NOME_ABA_MENSAL)
    expect(contas(a).some(c => c.startsWith('Não classificadas'))).toBe(false)
    expect(contas(a)).toHaveLength(LINHAS.length)
  })

  it('hierarquia no rótulo por recuo textual: bloco/resultado sem recuo, sub 2, categoria 4', () => {
    const c = contas(aba(entrada(), NOME_ABA_MENSAL))
    expect(c[0]).toBe('(+) ENTRADA DE CLIENTES')
    expect(c[2].startsWith('    Vendas A')).toBe(true)
    expect(c[5].startsWith('  Subgrupo')).toBe(true)
    expect(c[5].startsWith('   ')).toBe(false)
    expect(c[6]).toBe('(=) LUCRO *')
  })
})

// ── Rótulos: guarda anti-fórmula ────────────────────────────────────────────────

describe('guarda anti-fórmula', () => {
  it.each(['=SOMA(A1)', '+1', '-1', '@x', '\tx'])('%j ganha apóstrofo', t => {
    expect(rotuloSeguro(t)).toBe(`'${t}`)
  })
  it.each(['Vendas', '(=) LUCRO', ' = com espaço', 'a=b'])('%j passa intacto', t => {
    expect(rotuloSeguro(t)).toBe(t)
  })
  it('é aplicada ao rótulo ANTES do recuo (o espaço do recuo não a anula)', () => {
    const c = contas(aba(entrada(), NOME_ABA_MENSAL))
    expect(c[3]).toBe("    '= Vendas B")
  })
  it('vale também para a bandeja', () => {
    const e = entrada({ dados: dados({ bandeja: [{ ...BANDEJA[0], rotulo: '=cmd' }] }) })
    expect(contas(aba(e, NOME_ABA_MENSAL)).at(-1)).toBe("  '=cmd")
  })
})

// ── Aba Mensal ───────────────────────────────────────────────────────────────────

describe('aba Mensal', () => {
  it('cabeçalho do modo "tudo" em ano corrente: mês híbrido REAL/PREV, total previsto, AV e ano seguinte com AV', () => {
    expect(cabecalho(aba(entrada(), NOME_ABA_MENSAL))).toEqual([
      'Conta',
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul·REAL', 'Jul·PREV', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
      'Total previsto', 'AV',
      '2027', 'AV',
    ])
  })

  it('modo "realizado": só os meses realizados, "Total do ano", AV, sem anos seguintes (mesma regra da tela)', () => {
    expect(cabecalho(aba(entrada({ totalModo: 'realizado' }), NOME_ABA_MENSAL))).toEqual([
      'Conta', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Total do ano', 'AV',
    ])
  })

  it('o toggle de previsto recolhido/anos seguintes fechado não existe como entrada: a planilha leva os dois', () => {
    const cab = cabecalho(aba(entrada(), NOME_ABA_MENSAL))
    expect(cab).toContain('Dez')
    expect(cab).toContain('2027')
  })

  it('ano fechado: 12 meses puros e "Total do ano" mesmo no modo "tudo"', () => {
    const e = entrada({ dados: dados({ relacao: 'fechado', mes_corrente: null }), anosSeguintes: [] })
    const cab = cabecalho(aba(e, NOME_ABA_MENSAL))
    expect(cab).toHaveLength(1 + 12 + 1 + 1)
    expect(cab.at(-2)).toBe('Total do ano')
  })

  it('valores saem como NÚMERO, com formato monetário, na coluna certa', () => {
    const a = aba(entrada(), NOME_ABA_MENSAL)
    const jan = cel(a, 'Vendas A', 'Jan')
    expect(jan).toEqual({ t: 'n', v: 60, z: FMT_MOEDA })
    expect(typeof valor(jan)).toBe('number')
    expect(valor(cel(a, 'Vendas A', 'Jul·REAL'))).toBe(60)
    expect(valor(cel(a, 'Vendas A', 'Jul·PREV'))).toBe(20) // prev_corrente
    expect(valor(cel(a, 'Vendas A', 'Ago'))).toBe(30)
    expect(valor(cel(a, 'Vendas A', 'Total previsto'))).toBe(590) // total do PAYLOAD
  })

  it('modo "realizado": o total é recomputado só com o realizado (jan..mês corrente)', () => {
    const a = aba(entrada({ totalModo: 'realizado' }), NOME_ABA_MENSAL)
    expect(valor(cel(a, 'Vendas A', 'Total do ano'))).toBe(7 * 60)
    expect(valor(cel(a, 'RECEITA BRUTA DE VENDAS', 'Total do ano'))).toBe(700)
  })

  it('ZERO é número 0 — não é ausência', () => {
    const a = aba(entrada(), NOME_ABA_MENSAL)
    const z = cel(a, 'Zerada', 'Jan')
    expect(z).not.toBeNull()
    expect(valor(z)).toBe(0)
    expect(valor(cel(a, 'Zerada', 'Total previsto'))).toBe(0)
  })

  it('AV: fração + formato 0.0%, só ABAIXO da base, base = 100%', () => {
    const a = aba(entrada(), NOME_ABA_MENSAL)
    // Acima da Receita Bruta: sem AV (célula vazia).
    expect(cel(a, '(+) ENTRADA DE CLIENTES', 'AV')).toBeNull()
    // A base mostra 100% = fração 1.
    expect(cel(a, 'RECEITA BRUTA DE VENDAS', 'AV')).toEqual({ t: 'n', v: 1, z: FMT_PCT })
    // Categoria: 590 / 980 como FRAÇÃO (a tela mostra "60,2%").
    const av = cel(a, 'Vendas A', 'AV') as { v: number; z: string }
    expect(av.z).toBe(FMT_PCT)
    expect(av.v).toBeCloseTo(590 / 980, 12)
  })

  it('AV do modo "realizado" usa numerador E base no mesmo recorte (realizado)', () => {
    const a = aba(entrada({ totalModo: 'realizado' }), NOME_ABA_MENSAL)
    const av = cel(a, 'Vendas A', 'AV') as { v: number }
    expect(av.v).toBeCloseTo(420 / 700, 12)
  })

  it('ano seguinte: valor + AV sobre a Receita Bruta DAQUELE ano; ausência = vazio', () => {
    const a = aba(entrada(), NOME_ABA_MENSAL)
    expect(valor(cel(a, 'Vendas A', '2027'))).toBe(600)
    const av = cel(a, 'Vendas A', 'AV', 1) as { v: number; z: string }
    expect(av.v).toBeCloseTo(600 / 1000, 12)
    expect(av.z).toBe(FMT_PCT)
    // 'c:3' não existe em totais do ano seguinte → AUSÊNCIA, não 0.
    expect(cel(a, 'Zerada', '2027')).toBeNull()
    expect(cel(a, 'Zerada', 'AV', 1)).toBeNull()
    // Acima da base: sem AV nem no ano seguinte.
    expect(cel(a, '(+) ENTRADA DE CLIENTES', 'AV', 1)).toBeNull()
  })

  it('bandeja: valores e total entram; AV sempre vazia; ano seguinte pela chave da órfã', () => {
    const a = aba(entrada(), NOME_ABA_MENSAL)
    expect(valor(cel(a, 'Órfã', 'Jan'))).toBe(1)
    expect(valor(cel(a, 'Órfã', 'Total previsto'))).toBe(12.5)
    expect(cel(a, 'Órfã', 'AV')).toBeNull()
    expect(valor(cel(a, 'Órfã', '2027'))).toBe(7)
    expect(cel(a, 'Órfã', 'AV', 1)).toBeNull()
  })

  it('competência: mês parcial sufixa só o rótulo da coluna do mês marcado', () => {
    const e = entrada({
      semPrevisto: true, totalModo: 'realizado', anosSeguintes: [],
      mesParcial: { ano: 2026, mes: 6 },
    })
    const cab = cabecalho(aba(e, NOME_ABA_MENSAL))
    expect(cab).toEqual(['Conta', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun · parcial', 'Jul', 'Total do ano', 'AV'])
  })

  it('mês parcial de OUTRO ano, ou no regime de caixa, não marca nada', () => {
    const outroAno = cabecalho(aba(entrada({
      semPrevisto: true, totalModo: 'realizado', anosSeguintes: [], mesParcial: { ano: 2025, mes: 6 },
    }), NOME_ABA_MENSAL))
    expect(outroAno.some(c => c.includes('parcial'))).toBe(false)
    const caixa = cabecalho(aba(entrada({ mesParcial: { ano: 2026, mes: 6 } }), NOME_ABA_MENSAL))
    expect(caixa.some(c => c.includes('parcial'))).toBe(false)
  })
})

// ── Aba Consolidado ─────────────────────────────────────────────────────────────

describe('aba Consolidado', () => {
  it('cabeçalho do modo "tudo": ano cheio+AV, YTD, Δ%, referência com AV, VENCIDOS, PREV, TOTAL e ano seguinte SEM AV', () => {
    expect(cabecalho(aba(entrada(), NOME_ABA_CONSOLIDADO))).toEqual([
      'Conta',
      '2025', 'AV', 'YTD 25', 'Δ% YTD 25·26',
      'YTD 26', 'AV', 'VENCIDOS', 'PREV 26', 'TOTAL PREVISTO',
      '2027',
    ])
  })

  it('modo "realizado": somem VENCIDOS, PREV, TOTAL e anos seguintes', () => {
    expect(cabecalho(aba(entrada({ totalModo: 'realizado' }), NOME_ABA_CONSOLIDADO))).toEqual([
      'Conta', '2025', 'AV', 'YTD 25', 'Δ% YTD 25·26', 'YTD 26', 'AV',
    ])
  })

  it('referência FECHADA no modo "tudo": sem PREV/VENCIDOS, TOTAL com o ano; sem ano seguinte', () => {
    const fechado: ConsolidadoAno = { ...CONS_2026, corrente: false }
    const cab = cabecalho(aba(entrada({ anosCons: [CONS_2025, fechado] }), NOME_ABA_CONSOLIDADO))
    expect(cab).toEqual([
      'Conta', '2025', 'AV', 'YTD 25', 'Δ% YTD 25·26', 'YTD 26', 'AV', 'TOTAL 2026',
    ])
  })

  it('valores: ano cheio, YTD, VENCIDOS, PREV (= total − YTD) e TOTAL, como números', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    const rb = 'RECEITA BRUTA DE VENDAS'
    expect(valor(cel(a, rb, '2025'))).toBe(1000)
    expect(valor(cel(a, rb, 'YTD 25'))).toBe(600)
    expect(valor(cel(a, rb, 'YTD 26'))).toBe(700)
    expect(valor(cel(a, rb, 'VENCIDOS'))).toBe(10)
    expect(valor(cel(a, rb, 'PREV 26'))).toBe(280)
    expect(valor(cel(a, rb, 'TOTAL PREVISTO'))).toBe(980)
    expect(cel(a, rb, 'YTD 26')).toEqual({ t: 'n', v: 700, z: FMT_MOEDA })
  })

  it('ausência (a categoria não existia no ano) = célula VAZIA, nunca 0; Δ% sobre ausência também vazio', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    expect(cel(a, "'= Vendas B", '2025')).toBeNull()
    expect(cel(a, "'= Vendas B", 'YTD 25')).toBeNull()
    expect(cel(a, "'= Vendas B", 'AV', 0)).toBeNull()
    expect(cel(a, "'= Vendas B", 'Δ% YTD 25·26')).toBeNull()
    // …enquanto o ano em que ela existe tem o valor.
    expect(valor(cel(a, "'= Vendas B", 'YTD 26'))).toBe(280)
  })

  it('zero existente é 0; Δ% sobre denominador zero é vazio (variação indefinida)', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    expect(valor(cel(a, 'Zerada', 'YTD 25'))).toBe(0)
    expect(valor(cel(a, 'Zerada', 'YTD 26'))).toBe(0)
    expect(cel(a, 'Zerada', 'Δ% YTD 25·26')).toBeNull()
  })

  it('Δ% e AV saem como FRAÇÃO com formato 0.0%', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    const delta = cel(a, 'Vendas A', 'Δ% YTD 25·26') as { v: number; z: string }
    expect(delta.z).toBe(FMT_PCT)
    expect(delta.v).toBeCloseTo((420 - 360) / 360, 12)
    const av25 = cel(a, 'Vendas A', 'AV', 0) as { v: number; z: string }
    expect(av25.z).toBe(FMT_PCT)
    expect(av25.v).toBeCloseTo(600 / 1000, 12)
    const av26 = cel(a, 'Vendas A', 'AV', 1) as { v: number }
    expect(av26.v).toBeCloseTo(420 / 700, 12)
    expect(cel(a, 'RECEITA BRUTA DE VENDAS', 'AV', 1)).toEqual({ t: 'n', v: 1, z: FMT_PCT })
  })

  it('linhas ACIMA da base não têm AV (vazio), mas têm os valores', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    expect(cel(a, '(+) ENTRADA DE CLIENTES', 'AV', 0)).toBeNull()
    expect(cel(a, '(+) ENTRADA DE CLIENTES', 'AV', 1)).toBeNull()
    expect(valor(cel(a, '(+) ENTRADA DE CLIENTES', 'YTD 26'))).toBe(70)
  })

  it('anos seguintes: valor pelo total da chave, SEM coluna de AV (assimetria com a Mensal)', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    expect(valor(cel(a, 'Vendas A', '2027'))).toBe(600)
    expect(cel(a, 'Zerada', '2027')).toBeNull()
    const cab = cabecalho(a)
    expect(cab.at(-1)).toBe('2027')
    expect(cab.at(-2)).not.toBe('AV')
  })

  it('anos seguintes só os POSTERIORES à referência (ano já marcado não repete)', () => {
    const e = entrada({
      anosSeguintes: [
        { ano: 2026, totais: {} },
        { ano: 2027, totais: { 'c:1': 1 } },
      ],
    })
    expect(cabecalho(aba(e, NOME_ABA_CONSOLIDADO)).filter(c => c === '2026')).toHaveLength(0)
    expect(cabecalho(aba(e, NOME_ABA_CONSOLIDADO)).at(-1)).toBe('2027')
  })

  it('bandeja: valores por ano marcado, Δ% quando calculável, AV sempre vazia', () => {
    const a = aba(entrada(), NOME_ABA_CONSOLIDADO)
    expect(valor(cel(a, 'Órfã', 'YTD 26'))).toBe(7)
    expect(cel(a, 'Órfã', 'YTD 25')).toBeNull() // não existia em 2025
    expect(cel(a, 'Órfã', 'Δ% YTD 25·26')).toBeNull()
    expect(cel(a, 'Órfã', 'AV', 0)).toBeNull()
    expect(cel(a, 'Órfã', 'AV', 1)).toBeNull()
  })

  it('sem nenhum ano carregado: a aba existe e diz por quê', () => {
    const a = aba(entrada({ consolidadoAnos: [], anosCons: [] }), NOME_ABA_CONSOLIDADO)
    expect(a.linhas[IDX_CABECALHO]).toEqual(['Comparativo indisponível — nenhum ano pôde ser carregado.'])
    expect(a.larguras.length).toBeGreaterThan(0)
  })

  it('independe do ano em tela e da visão ativa (a entrada nem tem "visão"): o corpo do Consolidado não muda', () => {
    const a1 = montarExportacaoDre(entrada()).abas[1]
    const a2 = montarExportacaoDre(entrada({ ano: 2025 })).abas[1]
    expect(a2.linhas.slice(IDX_CABECALHO)).toEqual(a1.linhas.slice(IDX_CABECALHO))
  })
})

// ── Ausência × zero, no conjunto ─────────────────────────────────────────────────

describe('tipos de célula na saída', () => {
  it('toda célula é texto, número {t:"n"} com v finito e z, ou null — nunca string numérica, NaN ou undefined', () => {
    for (const a of montarExportacaoDre(entrada()).abas) {
      for (const linha of corpo(a)) {
        for (const c of linha) {
          if (c === null || typeof c === 'string') continue
          expect(c.t).toBe('n')
          expect(typeof c.v).toBe('number')
          expect(Number.isFinite(c.v)).toBe(true)
          expect([FMT_MOEDA, FMT_PCT]).toContain(c.z)
        }
        // `undefined` quebraria `aoa_to_sheet` de forma silenciosa (a lib pula o índice).
        expect(linha.every(c => c !== undefined)).toBe(true)
      }
    }
  })

  it('nenhum valor monetário é string formatada ("1.234,56", "–")', () => {
    for (const a of montarExportacaoDre(entrada()).abas) {
      for (const linha of corpo(a)) {
        for (const c of linha.slice(1)) {
          if (typeof c === 'string') expect(c).toBe('') // só o separador da bandeja tem texto, na coluna Conta
        }
      }
    }
  })
})
