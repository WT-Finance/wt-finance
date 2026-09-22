// Bytes → `Matriz` de células. O ÚNICO lugar do caminho de ingestão que chama `XLSX.read`/
// `sheet_to_json` — a rota `/api/ingestao/{base}` (M4) e `fixtures-oraculo.ts` (GATE 1) delegam
// os dois para cá, para que o oráculo prove exatamente a leitura que a rota executa.
//
// Isomórfico de propósito: sem `node:fs`, sem `server-only`, sem DOM. A rota roda em Node; os
// testes rodam em `vitest` — os dois entram por aqui com bytes, nunca com um caminho de disco.
//
// As opções abaixo NÃO são escolha de estilo — são a defesa contra dois bugs caros e ambos
// silenciosos (skill `ingestao-planilhas` §3):
//
//  • `cellDates: true` (xlsx) devolve `Date` nativo para célula de data. Pedir a string de
//    exibição reintroduz a ambiguidade `DD/MM` × `MM/DD` que o Excel já resolveu — a importação
//    da base Gerencial inverteu dia/mês por causa disso (ADR-0099, v4.9).
//  • `raw: true` nos dois ramos preserva o valor NATIVO da célula em vez de reformatá-la para a
//    string de exibição. Sem isso, a célula numérica `-40.933` (R$ 40,93) vira a string
//    `"-40.933"`, que casa o padrão de milhar BR do `toNum` e é lida como −40933 — o bug ×1000 da
//    v5.5.2. No ramo CSV o estrago é maior: `raw: false` faz o SheetJS rodar um heurístico
//    AMERICANO sobre o texto ANTES de qualquer coerção nossa, e destrói todo valor BR com vírgula
//    decimal (`"40,93"` → `4093`). O modo seguro é sempre passar `raw: true` explicitamente.
//  • `defval: null` faz célula ausente virar `null` em vez de sumir do array — sem isso, uma
//    linha mais curta que o cabeçalho desalinha os índices de coluna de todo parser posicional.
//  • O BOM (`﻿`) de um CSV exportado pelo Excel sai ANTES de decodificar como string, senão
//    contamina a primeira célula do cabeçalho.

import * as XLSX from '@e965/xlsx'
import type { Matriz } from './parsers/comum'

export type FormatoArquivo = 'xlsx' | 'csv'

/** Extensão do nome do arquivo → formato. Insensível a caixa; nome sem extensão (ou extensão
 *  que não é planilha suportada) devolve `null` — quem chama decide o erro. */
export function formatoPeloNome(nome: string): FormatoArquivo | null {
  const m = /\.([^./\\]+)$/.exec(nome)
  if (!m) return null
  const ext = m[1].toLowerCase()
  if (ext === 'xlsx') return 'xlsx'
  if (ext === 'csv') return 'csv'
  return null
}

/** Decodifica bytes como texto UTF-8 e remove o BOM inicial, se houver. */
function bytesParaTexto(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes).replace(/^﻿/, '')
}

/**
 * Lê os bytes de um arquivo xlsx ou csv como `Matriz`: linha 0 = primeira linha física da
 * planilha, célula ausente = `null`, valor de cada célula = o valor NATIVO (`Date` para data,
 * número para número — nunca a string de exibição).
 *
 * `aba` pede uma aba específica pelo nome; por default lê a primeira (`wb.SheetNames[0]`).
 */
export function lerMatriz(bytes: Uint8Array, formato: FormatoArquivo, aba?: string): Matriz {
  const wb =
    formato === 'xlsx'
      ? XLSX.read(bytes, { cellDates: true })
      : XLSX.read(bytesParaTexto(bytes), { type: 'string', raw: true, cellDates: false })
  const sheet = wb.Sheets[aba ?? wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null })
}
