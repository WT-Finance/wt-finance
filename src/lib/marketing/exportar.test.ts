import { describe, it, expect } from 'vitest'
import type { LancamentoMkt } from './tipos'
import { FMT_MOEDA, type Celula } from '@/lib/dre/exportar'
import { lancamentosDoRecorte, somar } from './agregacao'
import {
  CABECALHO_COLUNAS, FMT_DATA, NOME_ABA_LANCAMENTOS, montarExportacaoMarketing,
  nomeArquivoExportacaoMarketing, type EntradaExportacaoMkt,
} from './exportar'
import {
  FILTRO_VAZIO, filtrarLancamentos, haFiltro, ordenarLancamentos, type FiltroLancamentos, type Ordenacao,
} from './lancamentos'
import type { Recorte } from './periodo'

const L = (
  id: number, data: string, categoria: string, fornecedor: string | null, valor: number,
  descricao: string | null, documento: string | null,
): LancamentoMkt => ({ id, data, categoria, fornecedor, descricao, documento, valor })

const ANO = 2026
const LANC: LancamentoMkt[] = [
  L(1, '2026-01-10', 'TravelBack', null, -300.1, 'Bônus de indicação', 'FAT-9'),
  L(2, '2026-02-20', 'Licença de Software (MKT)', 'Adobe', -50.2, 'Assinatura mensal', null),
  L(3, '2026-03-05', 'Anúncios', 'Google Ads', -100.7, 'Campanha de Verão', 'NF 1'),
  L(4, '2026-03-05', 'Anúncios', 'Meta Ads', 25.05, 'Estorno de cobrança', null),
  L(5, '2026-03-06', 'Material gráfico MKT', '  ', -10.01, null, null),
  L(6, '2026-04-01', 'Anúncios', 'Google Ads', -0.1, 'Abril', 'NF 2'),
  L(7, '2025-12-31', 'Anúncios', 'Google Ads', -999, 'Fora do ano', null),
]

/** A MESMA cadeia que `lancamentos-tabela.tsx` usa para produzir `linhas`. */
function linhasDaTabela(recorte: Recorte, filtro: FiltroLancamentos, ordem: Ordenacao): LancamentoMkt[] {
  return ordenarLancamentos(filtrarLancamentos(lancamentosDoRecorte(LANC, recorte), filtro), ordem)
}

function exportar(recorte: Recorte, filtro: FiltroLancamentos, ordem: Ordenacao, extra: Partial<EntradaExportacaoMkt> = {}) {
  const linhas = linhasDaTabela(recorte, filtro, ordem)
  return {
    linhas,
    saida: montarExportacaoMarketing({
      ano: ANO, recorte, linhas, filtrado: haFiltro(filtro), geradoEm: '2026-10-08', ...extra,
    }),
  }
}

const POS_CABECALHO = 4 // título · recorte · em branco · colunas
const corpo = (aoa: Celula[][], n: number) => aoa.slice(POS_CABECALHO, POS_CABECALHO + n)
const valorDe = (c: Celula): number => (c as { v: number }).v
const DATA_DESC: Ordenacao = { coluna: 'data', direcao: 'desc' }

describe('montarExportacaoMarketing — estrutura', () => {
  it('uma aba, cabeçalho das colunas na ordem da tabela, sem id', () => {
    const { saida } = exportar({ mesIni: 1, mesFim: 4 }, FILTRO_VAZIO, DATA_DESC)
    expect(saida.nome).toBe(NOME_ABA_LANCAMENTOS)
    expect(saida.linhas[POS_CABECALHO - 1]).toEqual(['Data', 'Categoria', 'Fornecedor', 'Descrição', 'Nº do documento', 'Valor'])
    expect([...CABECALHO_COLUNAS]).toHaveLength(6)
    expect(saida.larguras).toHaveLength(6)
    for (const linha of corpo(saida.linhas, 6)) expect(linha).toHaveLength(6)
  })

  it('linha 2 declara o recorte; "com filtros" só quando há filtro', () => {
    const sem = exportar({ mesIni: 1, mesFim: 4 }, FILTRO_VAZIO, DATA_DESC).saida
    expect(sem.linhas[1]).toEqual(['Jan–Abr/2026 · pago · data de movimentação · valores em R$ · gerado em 08/10/2026'])
    const com = exportar({ mesIni: 1, mesFim: 4 }, { ...FILTRO_VAZIO, categoria: 'Anúncios' }, DATA_DESC).saida
    expect(com.linhas[1]![0]).toContain('com filtros da tabela')
  })
})

describe('(a) linhas exportadas ≡ linhas da tabela', () => {
  const casos: { nome: string; recorte: Recorte; filtro: FiltroLancamentos; ordem: Ordenacao }[] = [
    { nome: 'sem filtro, data desc', recorte: { mesIni: 1, mesFim: 4 }, filtro: FILTRO_VAZIO, ordem: DATA_DESC },
    { nome: 'recorte Mar', recorte: { mesIni: 3, mesFim: 3 }, filtro: FILTRO_VAZIO, ordem: { coluna: 'data', direcao: 'asc' } },
    { nome: 'categoria + valor asc', recorte: { mesIni: 1, mesFim: 4 }, filtro: { ...FILTRO_VAZIO, categoria: 'Anúncios' }, ordem: { coluna: 'valor', direcao: 'asc' } },
    { nome: 'fornecedor sem fornecedor', recorte: { mesIni: 1, mesFim: 4 }, filtro: { ...FILTRO_VAZIO, fornecedor: '' }, ordem: { coluna: 'fornecedor', direcao: 'asc' } },
    { nome: 'busca + descrição desc', recorte: { mesIni: 1, mesFim: 4 }, filtro: { ...FILTRO_VAZIO, busca: 'ca' }, ordem: { coluna: 'descricao', direcao: 'desc' } },
  ]

  for (const c of casos) {
    it(c.nome, () => {
      const { linhas, saida } = exportar(c.recorte, c.filtro, c.ordem)
      const exportadas = corpo(saida.linhas, linhas.length)
      expect(exportadas).toHaveLength(linhas.length)
      // Mesma ordem, mesmos valores ao centavo, linha a linha.
      exportadas.forEach((cels, i) => {
        const l = linhas[i]!
        expect(valorDe(cels[5]!)).toBe(l.valor)
        expect(cels[1]).toBe(l.categoria)
      })
      expect(exportadas.map(c2 => valorDe(c2[5]!))).toEqual(linhas.map(l => l.valor))
      // O total é a Σ das linhas exportadas — nem mais, nem menos.
      const total = saida.linhas[POS_CABECALHO + linhas.length]!
      expect(total[0]).toBe(haFiltro(c.filtro) ? 'Total filtrado' : 'Total')
      expect(valorDe(total[5]!)).toBe(somar(exportadas.map(c2 => valorDe(c2[5]!))))
      expect(saida.linhas).toHaveLength(POS_CABECALHO + linhas.length + 1)
    })
  }

  it('lançamento fora do recorte de meses não entra na planilha', () => {
    const { saida, linhas } = exportar({ mesIni: 1, mesFim: 4 }, FILTRO_VAZIO, DATA_DESC)
    expect(linhas.map(l => l.id)).not.toContain(7) // dezembro
    expect(saida.linhas.flat().some(c => c !== null && typeof c === 'object' && c.v === -999)).toBe(false)
  })
})

describe('(b) valor sai como número com o sinal da DRE', () => {
  it('gasto negativo, estorno positivo, formato contábil — nunca texto', () => {
    const { saida } = exportar({ mesIni: 3, mesFim: 3 }, FILTRO_VAZIO, { coluna: 'valor', direcao: 'asc' })
    const [gasto, , estorno] = corpo(saida.linhas, 3).map(c => c[5]!)
    expect(gasto).toEqual({ t: 'n', v: -100.7, z: FMT_MOEDA })
    expect(estorno).toEqual({ t: 'n', v: 25.05, z: FMT_MOEDA })
    for (const c of corpo(saida.linhas, 3)) expect(typeof c[5]).toBe('object')
  })

  it('total em centavos exatos (sem resíduo de float)', () => {
    const { saida, linhas } = exportar({ mesIni: 1, mesFim: 4 }, FILTRO_VAZIO, DATA_DESC)
    const total = saida.linhas[POS_CABECALHO + linhas.length]![5]
    // -300,10 -50,20 -100,70 +25,05 -10,01 -0,10 = -436,06
    expect(total).toEqual({ t: 'n', v: -436.06, z: FMT_MOEDA })
  })
})

describe('data real do Excel', () => {
  it('serial inteiro com formato de data (2026-01-01 = 46023)', () => {
    const l = L(1, '2026-01-01', 'X', 'Y', -1, 'd', null)
    const { saida } = exportar({ mesIni: 1, mesFim: 1 }, FILTRO_VAZIO, DATA_DESC, { linhas: [l] })
    expect(saida.linhas[POS_CABECALHO]![0]).toEqual({ t: 'n', v: 46023, z: FMT_DATA })
  })

  it('data inválida sai como texto cru, não some nem vira número errado', () => {
    const l = L(1, '2026-02-31', 'X', 'Y', -1, 'd', null)
    const { saida } = exportar({ mesIni: 1, mesFim: 1 }, FILTRO_VAZIO, DATA_DESC, { linhas: [l] })
    expect(saida.linhas[POS_CABECALHO]![0]).toBe('2026-02-31')
  })
})

describe('(c) fornecedor ausente e campos vazios', () => {
  it('nulo e em branco → "(sem fornecedor)", como na tela', () => {
    const { saida, linhas } = exportar({ mesIni: 1, mesFim: 4 }, { ...FILTRO_VAZIO, fornecedor: '' }, { coluna: 'data', direcao: 'asc' })
    expect(linhas.map(l => l.id)).toEqual([1, 5])
    expect(corpo(saida.linhas, 2).map(c => c[2])).toEqual(['(sem fornecedor)', '(sem fornecedor)'])
  })

  it('descrição/documento ausentes = célula vazia (null), não "—" nem zero', () => {
    const { saida } = exportar({ mesIni: 3, mesFim: 3 }, { ...FILTRO_VAZIO, fornecedor: '' }, DATA_DESC)
    const [cels] = corpo(saida.linhas, 1)
    expect(cels![3]).toBeNull()
    expect(cels![4]).toBeNull()
  })
})

describe('(d) guarda anti-fórmula', () => {
  it.each(['=1+1', '+55 11', '-cmd', '@SOMA(A1)', '\tx', '\rx'])('texto "%s" não vira fórmula', texto => {
    const l = L(1, '2026-03-05', texto, texto, -1, texto, texto)
    const { saida } = exportar({ mesIni: 3, mesFim: 3 }, FILTRO_VAZIO, DATA_DESC, { linhas: [l] })
    const cels = saida.linhas[POS_CABECALHO]!
    for (const i of [1, 3, 4]) expect(cels[i]).toBe(`'${texto}`)
    // O fornecedor passa por `chaveFornecedor` (trim) como na tela: tab/CR iniciais caem antes
    // da guarda — e então o texto já não começa por caractere perigoso.
    expect(cels[2]).toBe(/^[=+\-@]/.test(texto) ? `'${texto}` : texto.trim())
  })

  it('texto comum passa intacto', () => {
    const l = L(1, '2026-03-05', 'Anúncios', 'Google Ads', -1, 'Campanha = verão', 'NF-1')
    const { saida } = exportar({ mesIni: 3, mesFim: 3 }, FILTRO_VAZIO, DATA_DESC, { linhas: [l] })
    expect(saida.linhas[POS_CABECALHO]!.slice(1, 5)).toEqual(['Anúncios', 'Google Ads', 'Campanha = verão', 'NF-1'])
  })

  it('o valor numérico nunca é tocado pela guarda (negativo continua número)', () => {
    const l = L(1, '2026-03-05', 'A', 'B', -5, 'd', null)
    const { saida } = exportar({ mesIni: 3, mesFim: 3 }, FILTRO_VAZIO, DATA_DESC, { linhas: [l] })
    expect(saida.linhas[POS_CABECALHO]![5]).toEqual({ t: 'n', v: -5, z: FMT_MOEDA })
  })
})

describe('(e) recorte/filtro vazio', () => {
  it('sem linhas: só o cabeçalho, sem linha de total', () => {
    const { saida } = exportar({ mesIni: 1, mesFim: 4 }, { ...FILTRO_VAZIO, busca: 'nada-disso' }, DATA_DESC)
    expect(saida.linhas).toHaveLength(POS_CABECALHO)
    expect(saida.linhas[POS_CABECALHO - 1]).toEqual([...CABECALHO_COLUNAS])
  })
})

describe('nomeArquivoExportacaoMarketing', () => {
  it('intervalo, mês único e ano inteiro — minúsculo e sem acento', () => {
    expect(nomeArquivoExportacaoMarketing(2026, { mesIni: 1, mesFim: 10 })).toBe('gastos-marketing-2026-jan-out.xlsx')
    expect(nomeArquivoExportacaoMarketing(2026, { mesIni: 3, mesFim: 3 })).toBe('gastos-marketing-2026-mar.xlsx')
    expect(nomeArquivoExportacaoMarketing(2025, { mesIni: 1, mesFim: 12 })).toBe('gastos-marketing-2025-jan-dez.xlsx')
  })
})
