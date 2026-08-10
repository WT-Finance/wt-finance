// Export CSV do Inventário de Ativos (v5.6.0/M5) — dialeto do EXCEL pt-BR.
//
// Três decisões que separam "abre no Excel" de "abre certo no Excel pt-BR":
//
// 1. **BOM UTF-8.** Sem os três bytes iniciais, o Excel do Windows lê o arquivo como ANSI e
//    "Informática" chega como "InformÃ¡tica". O BOM é o que faz o acento sobreviver.
// 2. **Separador `;` e decimal com VÍRGULA.** No Excel pt-BR o separador de listas é o ponto e
//    vírgula; e `4321.99` com ponto entraria como texto (ou como 432199, dependendo da
//    configuração) em vez de número.
// 3. **CRLF** no fim da linha — o que o Excel espera.
//
// E uma de segurança: célula de TEXTO que começa com `=`, `+`, `@` ou tab é tratada pelo Excel
// como FÓRMULA. Como a descrição e as observações são digitadas pelo usuário, o texto vai
// prefixado com apóstrofo nesses casos (CSV injection). O prefixo não é aplicado a número nem
// a data, que a gente mesmo formata.

/** Fim de linha do Excel. */
const EOL = '\r\n'

/** Byte order mark UTF-8 — sem ele o acento quebra no Excel do Windows. */
export const BOM = '﻿'

const PERIGOSOS = /^[=+@\t\r]/

/** Escapa uma célula já serializada: aspas dobradas e envolvidas quando há `;`, `"` ou quebra. */
function escapar(texto: string): string {
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** Célula de TEXTO. `null`/vazio → vazio (nunca a palavra "null"). */
export function celulaTexto(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  if (s === '') return ''
  // Neutraliza fórmula sem alterar o que a pessoa lê na célula.
  return escapar(PERIGOSOS.test(s) ? `'${s}` : s)
}

/**
 * Célula de NÚMERO com 2 casas e vírgula decimal.
 * `null` → VAZIO, nunca `0`: ativo sem valor informado não é ativo que custou zero, e a
 * diferença precisa sobreviver à planilha (invariante 9). `NaN`/infinito também saem vazios.
 */
export function celulaNumero(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return ''
  return v.toFixed(2).replace('.', ',')
}

/** Célula de DATA: 'YYYY-MM-DD' → 'DD/MM/AAAA'. Sem fuso: a data do banco é dia puro. */
export function celulaData(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : ''
}

/** Célula de DATA E HORA (timestamptz) no fuso de São Paulo. */
const FMT_SP = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})
export function celulaDataHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : FMT_SP.format(d).replace(', ', ' ')
}

/**
 * Monta o arquivo. As células chegam PRONTAS (já passaram por `celula*`) — a montagem não
 * adivinha tipo, para não haver dois lugares decidindo como um número é escrito.
 */
export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  return BOM + [cabecalho.map(escapar), ...linhas].map(l => l.join(';')).join(EOL) + EOL
}

/** Nome de arquivo com a data do dia — `inventario-ativos-2026-08-10.csv`. */
export function nomeArquivo(prefixo: string, hoje: string): string {
  return `${prefixo}-${hoje}.csv`
}
