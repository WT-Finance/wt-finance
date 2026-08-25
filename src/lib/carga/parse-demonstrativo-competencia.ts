// Parser client-safe do export Monde "Demonstrativo de Resultado" já tratado pelo
// script R (`tratamento_demonstrativo_v1.R`) — a base do REGIME DE COMPETÊNCIA
// (v5.8.0, M1). 8 colunas tidy: Tipo, Grupo, Descrição, Ano, Mês, Mês Nº,
// Competência, Valor. Um registro por (Tipo, Grupo, Descrição, Ano, Mês).
//
// Isomórfico (sem 'use client', sem imports de DB/Node) — mesmo molde de
// parse-titulos-em-aberto.ts. Cabeçalho por normalizeHeader (tolerante a
// acento/caixa/espaço; o 'º' de "Mês Nº" casa porque os DOIS lados passam pela mesma
// normalização). Coerção SEMPRE via ./coercao (lint wt/no-coercao-reimpl).
//
// ── Três decisões que valem explicação ──────────────────────────────────────
//
// 1. **`competencia` é DERIVADA de Ano + Mês Nº, e a coluna `Competência` do arquivo
//    é CONFERÊNCIA CRUZADA — não é a fonte.** Ano e Mês Nº são inteiros: imunes a
//    fuso. A coluna `Competência` chega como Date nativo com offset (o arquivo de
//    25/08/2026 traz `2026-02-01T03:00:00Z`), e data nativa lida em runtime de fuso
//    diferente é exatamente a armadilha da ADR-0099 / v4.22. Medido antes de escrever
//    este parser: as duas formas concordam em 3.244/3.244 linhas do arquivo real — a
//    redundância existe, então ela vira GUARDA em vez de ambiguidade. O briefing pedia
//    "aceitar Competência OU derivar"; derivar e conferir é estritamente melhor.
//
// 2. **Linha inutilizável NÃO é pulada em silêncio — derruba o parse com o número da
//    linha.** O invariante do briefing é "linhas classificadas + bandeja = total da
//    base; nada some em silêncio", e pular linha com conteúdo é justamente sumir com
//    ela. A fonte é máquina (o script R confere 556 checksums internos), então linha
//    quebrada significa que o export mudou de forma — e isso um humano tem de ver.
//    Linha VAZIA (toda célula nula/branca) continua sendo pulada: não há valor ali.
//
// 3. **A soma de conferência vive AQUI, em centavos inteiros** (`somaCentavos`), e é
//    a mesma função que o card usa e que o teste prova. Somar 3,2 mil floats e
//    comparar com o `sum(valor)` NUMERIC do Postgres divergiria por ponto flutuante;
//    e duas implementações da mesma soma em lugares diferentes é a receita do drift
//    silencioso que este projeto já pagou mais de uma vez.

import { toNum, toIsoDate, toStr } from './coercao'
import { normalizeHeader } from './vendas-parser'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from './colunas-obrigatorias'

export interface DemonstrativoCompetenciaRaw {
  tipo:        string | null
  grupo:       string
  descricao:   string
  ano:         number
  mes:         string | null
  mes_num:     number
  /** Sempre o dia 1 do mês, no formato ISO `AAAA-MM-01`. Derivada de ano + mes_num. */
  competencia: string
  valor:       number
}

/** Campos que o cabeçalho pode alimentar. `competencia_arquivo` não é campo gravado —
 *  existe só para a conferência cruzada da decisão 1. */
type CampoLido = keyof DemonstrativoCompetenciaRaw | 'competencia_arquivo'

// As 8 colunas do export tratado → campo.
const COL_MAP: Record<string, CampoLido> = {
  'Tipo':         'tipo',
  'Grupo':        'grupo',
  'Descrição':    'descricao',
  'Descricao':    'descricao',
  'Ano':          'ano',
  'Mês':          'mes',
  'Mes':          'mes',
  'Mês Nº':       'mes_num',
  'Mes Numero':   'mes_num',
  'Mês Numero':   'mes_num',
  'Mes_Num':      'mes_num',
  'Competência':  'competencia_arquivo',
  'Competencia':  'competencia_arquivo',
  'Valor':        'valor',
}

const COL_MAP_NORM: Record<string, CampoLido> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

// Obrigatórias por PRESENÇA de cabeçalho (briefing §2). `Competência` e `Mês` ficam
// fora: a primeira é conferência (decisão 1) e a segunda é só rótulo de apresentação.
// Aceitos DERIVADOS do COL_MAP — nunca lista literal paralela.
const COLUNAS_OBRIGATORIAS: CampoLido[] = ['tipo', 'grupo', 'descricao', 'ano', 'mes_num', 'valor']
const REQUISITOS: RequisitoColuna[] = COLUNAS_OBRIGATORIAS.map((campo) => {
  const variantes = Object.keys(COL_MAP).filter((k) => COL_MAP[k] === campo)
  return { label: variantes[0] ?? campo, aceitos: variantes.map(normalizeHeader) }
})
/** Colunas obrigatórias (rótulos amigáveis) — exibidas no card da UI. */
export const DEMONSTRATIVO_COMPETENCIA_COLUNAS: string[] = REQUISITOS.map((r) => r.label)

/** Soma em CENTAVOS inteiros — fonte única da conferência arquivo × base (decisão 3). */
export function somaCentavos(linhas: readonly DemonstrativoCompetenciaRaw[]): number {
  let c = 0
  for (const l of linhas) c += Math.round(l.valor * 100)
  return c
}

/** true = a linha inteira está vazia (nada a perder ao pular). Espaço em branco conta
 *  como vazio; qualquer outro conteúdo torna a linha significativa. */
function linhaVazia(row: readonly unknown[]): boolean {
  return row.every((c) => c === null || c === undefined || String(c).trim() === '')
}

/**
 * Transforma a matriz de células (array-of-arrays, linha 0 = cabeçalho) em
 * DemonstrativoCompetenciaRaw[]. Linha vazia é pulada; linha com conteúdo que não
 * fecha um registro completo DERRUBA o parse nomeando as linhas (decisão 2).
 */
export function parseDemonstrativoCompetenciaRows(
  rows: unknown[][],
  arquivo?: string,
): DemonstrativoCompetenciaRaw[] | { error: string } {
  if (rows.length < 2) return { error: 'Arquivo vazio ou sem dados.' }

  const headers = (rows[0] as unknown[]).map((h) => String(h ?? '').trim())
  const headersNorm = headers.map(normalizeHeader)
  const faltando = validarColunasObrigatorias(headersNorm, REQUISITOS)
  if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

  const naoMapeadas = headers.filter((h) => h && !COL_MAP_NORM[normalizeHeader(h)])
  if (naoMapeadas.length > 0) {
    console.warn(
      `[demonstrativo-competencia]${arquivo ? ` (${arquivo})` : ''} colunas não-mapeadas (ignoradas):`,
      naoMapeadas,
    )
  }

  const linhas: DemonstrativoCompetenciaRaw[] = []
  const problemas: string[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || linhaVazia(row)) continue

    let tipo: string | null = null
    let grupo: string | null = null
    let descricao: string | null = null
    let mes: string | null = null
    let ano: number | null = null
    let mesNum: number | null = null
    let valor: number | null = null
    let compArquivo: string | null = null

    for (let j = 0; j < headers.length; j++) {
      const campo = COL_MAP_NORM[normalizeHeader(headers[j])]
      if (!campo) continue
      const v = row[j]
      switch (campo) {
        case 'tipo':      tipo      = toStr(v); break
        case 'grupo':     grupo     = toStr(v); break
        case 'descricao': descricao = toStr(v); break
        case 'mes':       mes       = toStr(v); break
        case 'ano':     { const n = toNum(v); ano    = n === null ? null : Math.round(n); break }
        case 'mes_num': { const n = toNum(v); mesNum = n === null ? null : Math.round(n); break }
        case 'valor':     valor     = toNum(v); break
        case 'competencia_arquivo': compArquivo = toIsoDate(v); break
      }
    }

    // Excel/planilha conta o cabeçalho como linha 1 — `i` é o índice na matriz, então
    // a linha que o usuário vê é `i + 1`.
    const nLinha = i + 1
    if (!grupo || !descricao) { problemas.push(`${nLinha} (Grupo/Descrição em branco)`); continue }
    if (ano === null || ano < 1900) { problemas.push(`${nLinha} (Ano inválido)`); continue }
    if (mesNum === null || mesNum < 1 || mesNum > 12) { problemas.push(`${nLinha} (Mês Nº fora de 1–12)`); continue }
    if (valor === null) { problemas.push(`${nLinha} (Valor não numérico)`); continue }

    const competencia = `${ano}-${String(mesNum).padStart(2, '0')}-01`
    // Conferência cruzada (decisão 1): a coluna do arquivo, quando existe, tem de
    // concordar com Ano + Mês Nº. Divergir significa export inconsistente — para.
    if (compArquivo !== null && compArquivo !== competencia) {
      problemas.push(`${nLinha} (Competência ${compArquivo} ≠ Ano+Mês ${competencia})`)
      continue
    }

    linhas.push({ tipo, grupo, descricao, ano, mes, mes_num: mesNum, competencia, valor })
  }

  if (problemas.length > 0) {
    const amostra = problemas.slice(0, 5).join('; ')
    const resto = problemas.length > 5 ? ` e outras ${problemas.length - 5}` : ''
    return {
      error:
        `${problemas.length} linha(s) do arquivo não pôde(ram) ser lida(s) — nenhum dado foi ` +
        `carregado para não perder linha em silêncio. Linha(s): ${amostra}${resto}.`,
    }
  }

  return linhas
}

export async function parseDemonstrativoCompetenciaFile(
  file: File,
): Promise<DemonstrativoCompetenciaRaw[] | { error: string }> {
  try {
    const XLSX = await import('@e965/xlsx')
    const buffer = await file.arrayBuffer()
    // Sem passar `raw` ao `read`: a opção é ignorada ali (o resíduo `raw: false` dos
    // parsers da era pré-v5.5.2 só confunde). `cellDates` é o que faz a coluna
    // `Competência` chegar como Date nativo, para a conferência cruzada.
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    // raw: TRUE — valor NATIVO da célula (number/Date), nunca a string de exibição.
    // Reformatar para texto reintroduz a ambiguidade ponto-decimal × ponto-milhar que
    // o Excel já resolveu, e o toNum então lê "-40.933" (R$ 40,93) como -40933.
    // Ver skill `ingestao-planilhas` §3 e a investigação de 2026-08-10 (v5.5.2).
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })
    if (aoa.length === 0) return { error: 'Arquivo vazio ou sem dados.' }

    const resultado = parseDemonstrativoCompetenciaRows(aoa, file.name)
    if (!Array.isArray(resultado)) return resultado
    if (resultado.length === 0)
      return { error: 'Nenhuma linha válida encontrada (verifique se o arquivo tem as colunas obrigatórias preenchidas).' }
    return resultado
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
