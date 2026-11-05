// ── Export do Registro de Antecipações para Excel (v6.5.0) — módulo PURO ──
//
// Mesmo padrão de `src/lib/dre/exportar.ts`: devolve a aba como matriz de células (AOA), sem DOM e
// sem a lib de planilha; o componente só chama `aoa_to_sheet` e dispara o download.
//
//  · Número é número: valores saem como célula numérica `t:'n'` com formato `z` (nunca texto "R$ …").
//  · Data é data: serial de data do Excel (dias desde 1899-12-30) com formato dd/mm/aaaa — calculado de
//    'AAAA-MM-DD' por `Date.UTC` (sem fuso), nunca por `new Date(local)`.
//  · Total em centavos inteiros (`toCentavos`, arredondamento do Postgres) para não acumular erro de float.
//  · A ordem das linhas é a recebida (a da tela). A linha de Total fecha a aba.

import { toCentavos } from '@/lib/carga/coercao'
import type { RegistroAntecipacao } from './schemas'

export interface CelulaNumero {
  t: 'n'
  v: number
  /** Código de formato numérico do Excel. */
  z: string
}

/** `null` = célula vazia. Texto sai como `string`. */
export type Celula = string | CelulaNumero | null

export interface ExportacaoAntecipacoes {
  nome: string
  linhas: Celula[][]
  /** Largura de cada coluna em caracteres (`wch`). */
  larguras: number[]
  nomeArquivo: string
}

export const NOME_ABA_ANTECIPACOES = 'Antecipações'
export const CABECALHO_ANTECIPACOES = ['Data', 'Conta', 'Antecipado', 'Líquido', 'Taxa'] as const
export const FMT_MOEDA = '#,##0.00;(#,##0.00)'
export const FMT_DATA = 'dd/mm/yyyy'

const LARGURAS = [12, 34, 18, 18, 18]

/** 'AAAA-MM-DD' → serial de data do Excel (inteiro). Entrada inválida → null (célula vazia). */
export function serialExcel(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Math.round(ms / 86_400_000) + 25569
}

function moeda(centavos: number): CelulaNumero {
  return { t: 'n', v: centavos / 100, z: FMT_MOEDA }
}

function emCentavos(v: number): number {
  return toCentavos(v) ?? 0
}

/** Nome do arquivo: `antecipacoes-AAAA-MM-DD.xlsx` (a data é `hojeSP()`, injetada para o módulo seguir puro). */
export function nomeArquivoAntecipacoes(geradoEm: string): string {
  return `antecipacoes-${geradoEm}.xlsx`
}

export function montarExportacaoAntecipacoes(
  registros: readonly RegistroAntecipacao[],
  geradoEm: string,
): ExportacaoAntecipacoes {
  let somaAnt = 0
  let somaLiq = 0
  let somaTaxa = 0

  const corpo: Celula[][] = registros.map(r => {
    const ant = emCentavos(r.valor_antecipado)
    const liq = emCentavos(r.valor_liquido)
    const taxa = emCentavos(r.desconto)
    somaAnt += ant
    somaLiq += liq
    somaTaxa += taxa
    const serial = serialExcel(r.data)
    return [
      serial === null ? null : { t: 'n', v: serial, z: FMT_DATA },
      r.conta,
      moeda(ant),
      moeda(liq),
      moeda(taxa),
    ]
  })

  const total: Celula[] = ['Total', null, moeda(somaAnt), moeda(somaLiq), moeda(somaTaxa)]

  return {
    nome: NOME_ABA_ANTECIPACOES,
    linhas: [[...CABECALHO_ANTECIPACOES], ...corpo, total],
    larguras: LARGURAS,
    nomeArquivo: nomeArquivoAntecipacoes(geradoEm),
  }
}
