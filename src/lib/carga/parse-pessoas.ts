// Parser da Base de Pessoas (cadastro fiscal do Monde, v4.29.0). Isomórfico (sem DOM;
// `@e965/xlsx` por import dinâmico) — roda no Web Worker (parse.worker.ts) com fallback
// na main thread. ~64k linhas.
//
// Invariantes (briefing v4.29.0):
//  • Valida as 17 COLUNAS presentes no cabeçalho (não a célula preenchida) — falta uma
//    → erro claro listando as faltantes, NÃO processa. A maioria das células vem vazia
//    (esperado, vira null).
//  • TODOS os campos via `toStr` (documentos cnpj/cpf/cep/inscrições como TEXTO — zero
//    à esquerda preservado; nunca `toNum`). `toStr` também TRIMA (nome vem com espaço à
//    esquerda na origem; a SQL re-trima por garantia).
//  • Casamento de cabeçalho tolerante a acento/caixa/espaço (normalizeHeader) — robusto
//    a variações de exportação do Monde.

import { toStr } from './coercao'
import { normalizeHeader } from './vendas-parser'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from './colunas-obrigatorias'

export interface PessoaRaw {
  nome:                string | null
  razao_social:        string | null
  cnpj:                string | null
  cpf:                 string | null
  cep:                 string | null
  inscricao_estadual:  string | null
  inscricao_municipal: string | null
  email:               string | null
  endereco:            string | null
  numero:              string | null
  complemento:         string | null
  bairro:              string | null
  cidade:              string | null
  uf:                  string | null
  pais:                string | null
  telefone:            string | null
  celular:             string | null
}

// As 17 colunas da pessoas.xlsx (Monde) → campo. A ORDEM aqui é a exibida ao usuário.
const COL_MAP: Record<string, keyof PessoaRaw> = {
  'Nome':                 'nome',
  'E-mail':               'email',
  'Telefone':             'telefone',
  'Celular':              'celular',
  'Cidade':               'cidade',
  'UF':                   'uf',
  'Razão Social':         'razao_social',
  'Endereço':             'endereco',
  'Número':               'numero',
  'Complemento':          'complemento',
  'Bairro':               'bairro',
  'CEP':                  'cep',
  'CPF':                  'cpf',
  'CNPJ':                 'cnpj',
  'Inscrição Estadual':   'inscricao_estadual',
  'Inscrição Municipal':  'inscricao_municipal',
  'País':                 'pais',
}

// Lookup por cabeçalho NORMALIZADO (acento/caixa/espaço-insensível).
const COL_MAP_NORM: Record<string, keyof PessoaRaw> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

/** As 17 colunas obrigatórias (rótulos amigáveis) — exibidas no card da UI. */
export const PESSOAS_COLUNAS: string[] = Object.keys(COL_MAP)

/** Requisitos p/ o helper compartilhado — comparação por header NORMALIZADO (tolerante). */
const PESSOAS_REQUISITOS: RequisitoColuna[] = Object.keys(COL_MAP).map(label => ({
  label,
  aceitos: [normalizeHeader(label)],
}))

const CHAVES_VAZIAS: PessoaRaw = {
  nome: null, razao_social: null, cnpj: null, cpf: null, cep: null,
  inscricao_estadual: null, inscricao_municipal: null, email: null, endereco: null,
  numero: null, complemento: null, bairro: null, cidade: null, uf: null, pais: null,
  telefone: null, celular: null,
}

export async function parsePessoasFile(
  file: File,
): Promise<PessoaRaw[] | { error: string }> {
  try {
    const XLSX = await import('@e965/xlsx')
    const ext = file.name.split('.').pop()?.toLowerCase()

    let workbook: ReturnType<typeof XLSX.read>
    if (ext === 'csv') {
      const text = await file.text()
      workbook = XLSX.read(text, { type: 'string', cellDates: true, raw: false })
    } else {
      const buffer = await file.arrayBuffer()
      workbook = XLSX.read(buffer, { type: 'array', cellDates: true, raw: false })
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    if (rows.length === 0) return { error: 'Arquivo vazio ou sem dados.' }

    // Valida as 17 COLUNAS presentes (não as células). Header normalizado → tolerante a acento.
    const headers = Object.keys(rows[0]).map(h => h.trim())
    const faltando = validarColunasObrigatorias(headers.map(normalizeHeader), PESSOAS_REQUISITOS)
    if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

    const result: PessoaRaw[] = []
    for (const row of rows) {
      const p: PessoaRaw = { ...CHAVES_VAZIAS }
      let temAlgo = false
      for (const h of Object.keys(row)) {
        const campo = COL_MAP_NORM[normalizeHeader(h.trim())]
        if (!campo) continue
        const v = toStr(row[h])  // trima + null se vazio; documentos ficam TEXT (nunca número)
        p[campo] = v
        if (v !== null) temAlgo = true
      }
      if (temAlgo) result.push(p)  // pula linha 100% vazia (sobras de planilha)
    }

    if (result.length === 0) return { error: 'Nenhuma linha com dados encontrada.' }
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
