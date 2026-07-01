// Parser da planilha de Clientes Corporativos ("Faturamento Clientes - Corporativo.xlsx",
// ~241 clientes) — Fase 3 (v4.33.0). Molde: parse-pessoas.ts. Client-side (@e965/xlsx por
// import dinâmico). Cadastro é REFERÊNCIA (Visão A) → tudo TEXT via toStr.
//
// Invariantes:
//  • Obrigatória apenas EMPRESA (a chave); as demais colunas podem faltar/estar vazias.
//  • "ENVIAR PARA" → destinatarios (string concatenada). IGNORA EMAIL 1-6 (decomposição da
//    planilha) — o split por ';' é da Fase 4 (envio); aqui só guardamos o texto.
//  • Situação normalizada p/ 'ativo'/'inativo' (o resto do cadastro é texto livre).
//  • Casamento de cabeçalho tolerante a acento/caixa/espaço (normalizeHeader).

import { toStr } from '@/lib/carga/coercao'
import { normalizeHeader } from '@/lib/carga/vendas-parser'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from '@/lib/carga/colunas-obrigatorias'

export interface ClienteCorpRaw {
  empresa:       string | null
  situacao:      string | null
  faturar_em:    string | null
  vencimento:    string | null
  obs:           string | null
  pct_juros:     string | null
  pct_multa:     string | null
  destinatarios: string | null
  forma_pgto:    string | null
  contato_whats: string | null
}

// Cabeçalho da planilha → campo. IGNORA EMAIL 1-6 (não mapeados de propósito). O "ENVIAR PARA"
// (com/sem acento, "enviar p/") é o destinatarios concatenado.
const COL_MAP: Record<string, keyof ClienteCorpRaw> = {
  'EMPRESA':        'empresa',
  'Situação':       'situacao',
  'FATURAR EM':     'faturar_em',
  'VENCIMENTO':     'vencimento',
  'OBS':            'obs',
  '% JUROS':        'pct_juros',
  '% MULTA':        'pct_multa',
  'ENVIAR PARA':    'destinatarios',
  'FORMA DE PGTO':  'forma_pgto',
  'CONTATO WHATS':  'contato_whats',
}

const COL_MAP_NORM: Record<string, keyof ClienteCorpRaw> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

/** Colunas reconhecidas (rótulos) — exibidas na UI. */
export const CLIENTES_COLUNAS: string[] = Object.keys(COL_MAP)

/** Só EMPRESA é obrigatória (a chave); as demais podem faltar. */
const CLIENTES_REQUISITOS: RequisitoColuna[] = [
  { label: 'EMPRESA', aceitos: [normalizeHeader('EMPRESA')] },
]

/** Situação → 'ativo' | 'inativo' | null (a planilha traz "Ativo"/"Inativo"). */
function normalizarSituacao(v: string | null): string | null {
  if (!v) return null
  const n = normalizeHeader(v) // lower + sem acento + trim
  if (n.includes('inativ')) return 'inativo'
  if (n.includes('ativ'))   return 'ativo'
  return null
}

const CHAVES_VAZIAS: ClienteCorpRaw = {
  empresa: null, situacao: null, faturar_em: null, vencimento: null, obs: null,
  pct_juros: null, pct_multa: null, destinatarios: null, forma_pgto: null, contato_whats: null,
}

export async function parseClientesCorpFile(
  file: File,
): Promise<ClienteCorpRaw[] | { error: string }> {
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

    // Obrigatória: EMPRESA (a chave). Header normalizado → tolerante a acento/caixa.
    const headers = Object.keys(rows[0]).map(h => h.trim())
    const faltando = validarColunasObrigatorias(headers.map(normalizeHeader), CLIENTES_REQUISITOS)
    if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

    const result: ClienteCorpRaw[] = []
    for (const row of rows) {
      const c: ClienteCorpRaw = { ...CHAVES_VAZIAS }
      for (const h of Object.keys(row)) {
        const campo = COL_MAP_NORM[normalizeHeader(h.trim())]
        if (!campo) continue // ignora colunas não mapeadas (inclui EMAIL 1-6)
        c[campo] = toStr(row[h])
      }
      c.situacao = normalizarSituacao(c.situacao)
      // sem EMPRESA não há chave → pula (linhas em branco / sobras de planilha)
      if (c.empresa) result.push(c)
    }

    if (result.length === 0) return { error: 'Nenhuma linha com EMPRESA encontrada.' }
    return result
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
