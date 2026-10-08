// ── Export dos lançamentos de Marketing para Excel (v6.3.0) — módulo PURO ──
//
// Recebe as linhas EXATAMENTE como a tabela de lançamentos as mostra (`linhas` de
// `lancamentos-tabela.tsx`: recorte → filtros → ordenação, já aplicados) e devolve a folha
// como matriz de células (AOA), sem DOM e sem a lib de planilha. O componente só chama
// `aoa_to_sheet` sobre o resultado. Este módulo NÃO filtra nem ordena: refiltrar por outro
// caminho abriria a divergência "a planilha não é o que eu vi". Molde: `src/lib/dre/exportar.ts`.
//
// ── Contrato (decisão do Yan, v6.3.0) ────────────────────────────────────────────
//  · Colunas = lista FECHADA, na ordem da tabela: Data, Categoria, Fornecedor, Descrição,
//    Nº do documento, Valor. Nada de `id` (ele renumera a cada carga — ver `tipos.ts`).
//  · Valor com o SINAL DA DRE (gasto negativo, estorno positivo), como NÚMERO com formato
//    contábil de 2 casas — a planilha precisa somar e ordenar.
//  · Fornecedor ausente sai "(sem fornecedor)", igual à tela.
//
// ── Decisões dentro do contrato (declaradas, não óbvias) ─────────────────────────
//  1. DATA = DATA REAL DO EXCEL: célula numérica (serial) com formato `dd/mm/yyyy`, para a
//     planilha ordenar e filtrar por data. O serial sai de `Date.UTC` sobre o 'YYYY-MM-DD'
//     (date puro, sem fuso). Data que não case 'YYYY-MM-DD' sai como TEXTO cru, nunca some.
//  2. AUSENTE ≠ ZERO ≠ TRAVESSÃO. Descrição/documento nulos viram célula VAZIA (a tela mostra
//     "—", que é enfeite de tela; na planilha o "—" seria um texto a filtrar). Valor é sempre
//     número (zero sai `0`).
//  3. GUARDA ANTI-FÓRMULA, a mesma do DRE (`rotuloSeguro`, reusada): texto que começa com
//     `= + - @` (ou tab/CR) ganha um apóstrofo na frente. Vale para TODA célula de texto vinda
//     do dado (categoria, fornecedor, descrição, documento) — descrição é texto livre digitado
//     no Monde. ⚠️ Em `.xlsx` a célula `t:'s'` nunca vira fórmula e o apóstrofo aparece
//     LITERALMENTE; a guarda protege quem reexporta a planilha para CSV (mesmo custo do DRE).
//  4. CABEÇALHO DA FOLHA: título · recorte ("Jan–Out/2026 · pago · data de movimentação ·
//     valores em R$ · gerado em DD/MM/AAAA", com "· com filtros da tabela" quando há filtro) ·
//     linha em branco · cabeçalho das colunas · linhas · TOTAL. O total é a Σ (em centavos
//     inteiros, `somar`) das linhas EXPORTADAS — com filtro vira "Total filtrado", como o
//     rodapé da tela. Sem linhas, a folha sai só com o cabeçalho (sem linha de total).

import { FMT_MOEDA, rotuloSeguro, type Celula } from '@/lib/dre/exportar'
import { chaveFornecedor, rotuloFornecedor, somar } from './agregacao'
import { MESES_ABREV, rotuloRecorteAno, type Recorte } from './periodo'
import type { LancamentoMkt } from './tipos'

export const NOME_ABA_LANCAMENTOS = 'Lançamentos'
const TITULO_EXPORTACAO = 'Gastos de Marketing — Lançamentos'
/** Formato de data do Excel; o Excel pt-BR o exibe como dd/mm/aaaa. */
export const FMT_DATA = 'dd/mm/yyyy'

export const CABECALHO_COLUNAS = ['Data', 'Categoria', 'Fornecedor', 'Descrição', 'Nº do documento', 'Valor'] as const

/** Largura de cada coluna em caracteres (`wch`), na ordem de `CABECALHO_COLUNAS`. */
const LARGURAS = [12, 28, 28, 52, 20, 16]

export interface EntradaExportacaoMkt {
  ano: number
  recorte: Recorte
  /** As linhas que a tabela mostra, NA ORDEM em que mostra (recorte + filtros + ordenação). */
  linhas: readonly LancamentoMkt[]
  /** `haFiltro(filtro)` da tabela — só muda o texto do subtítulo e o rótulo do total. */
  filtrado: boolean
  /** 'AAAA-MM-DD' — `hojeSP()` no call-site (injetado para o módulo seguir puro). */
  geradoEm: string
}

export interface ExportacaoMarketing {
  nome: string
  linhas: Celula[][]
  larguras: number[]
}

// ── Células ──────────────────────────────────────────────────────────────────────

/** Dias entre 1899-12-30 (origem do serial do Excel) e 1970-01-01. */
const SERIAL_EPOCH_UNIX = 25569
const MS_DIA = 86_400_000

/** 'AAAA-MM-DD' → serial de data do Excel (inteiro); `null` se não for uma data de calendário. */
function serialExcel(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const [a, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const ms = Date.UTC(a, mes - 1, d)
  const conferido = new Date(ms)
  // Rejeita 2026-02-31 (o Date.UTC "rola" para março): o dia tem de voltar igual.
  if (conferido.getUTCFullYear() !== a || conferido.getUTCMonth() !== mes - 1 || conferido.getUTCDate() !== d) return null
  return ms / MS_DIA + SERIAL_EPOCH_UNIX
}

function celulaData(iso: string): Celula {
  const serial = serialExcel(iso)
  return serial === null ? iso : { t: 'n', v: serial, z: FMT_DATA }
}

function celulaValor(v: number): Celula {
  return { t: 'n', v, z: FMT_MOEDA }
}

/** Texto do dado → célula: vazio/nulo = célula VAZIA; senão com a guarda anti-fórmula. */
function celulaTexto(s: string | null | undefined): Celula {
  return s == null || s === '' ? null : rotuloSeguro(s)
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' — date PURO (sem fuso): split é seguro aqui. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

// ── API ──────────────────────────────────────────────────────────────────────────

/** Uma linha da planilha — os mesmos seis campos e a mesma ordem da tabela. */
function linhaDeLancamento(l: LancamentoMkt): Celula[] {
  return [
    celulaData(l.data),
    celulaTexto(l.categoria),
    celulaTexto(rotuloFornecedor(chaveFornecedor(l.fornecedor))),
    celulaTexto(l.descricao),
    celulaTexto(l.documento),
    celulaValor(l.valor),
  ]
}

/** Monta a folha: cabeçalho da exportação, colunas, uma linha por lançamento e o total. */
export function montarExportacaoMarketing(e: EntradaExportacaoMkt): ExportacaoMarketing {
  const periodo = rotuloRecorteAno(e.recorte, e.ano)
  const filtros = e.filtrado ? ' · com filtros da tabela' : ''
  const linhas: Celula[][] = [
    [TITULO_EXPORTACAO],
    [`${periodo} · pago · data de movimentação${filtros} · valores em R$ · gerado em ${dataBR(e.geradoEm)}`],
    [],
    [...CABECALHO_COLUNAS],
    ...e.linhas.map(linhaDeLancamento),
  ]
  if (e.linhas.length > 0) {
    linhas.push([e.filtrado ? 'Total filtrado' : 'Total', null, null, null, null, celulaValor(somar(e.linhas.map(l => l.valor)))])
  }
  return { nome: NOME_ABA_LANCAMENTOS, linhas, larguras: [...LARGURAS] }
}

/** Nome do arquivo, sem acento: `gastos-marketing-2026-jan-out.xlsx`; um mês só:
 *  `gastos-marketing-2026-mar.xlsx`. */
export function nomeArquivoExportacaoMarketing(ano: number, r: Recorte): string {
  const ini = `${MESES_ABREV[r.mesIni - 1]}`.toLowerCase()
  const fim = `${MESES_ABREV[r.mesFim - 1]}`.toLowerCase()
  return `gastos-marketing-${ano}-${r.mesIni === r.mesFim ? ini : `${ini}-${fim}`}.xlsx`
}
