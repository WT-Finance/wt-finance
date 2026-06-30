// Parser da planilha crua de Faturamento (faturamento.xlsx) — Fase 1a (v4.30.0).
// Client-side, @e965/xlsx (padrão das outras bases). Coerção CANÔNICA: toNum no Valor
// Final, toIsoDate nas datas, toStr no resto — em especial o "Fatura Cliente Nº" fica
// TEXT (será o externalReference/idempotência da Fase 1b; preservar como string desde já).
//
// O enriquecimento (que o R fazia por left_join) agora vem de buscar_pessoas; aqui só
// as transformações de FORMATO necessárias (data/valor) — as mesmas da coerção canônica.
// (O script R legado não está no repo nesta fase; confirmar transformações extras se/quando
// docs/faturamento-legado/ for commitado — nenhuma além da coerção aparenta necessária.)

import { toNum, toIsoDate } from '@/lib/carga/coercao'
import { normalizeHeader } from '@/lib/carga/vendas-parser'
import { validarColunasObrigatorias, mensagemColunasFaltando, type RequisitoColuna } from '@/lib/carga/colunas-obrigatorias'
import type { FaturaRaw } from './tipos'

// Cabeçalho da crua → campo. Casamento tolerante a acento/caixa/espaço (normalizeHeader).
const COL_MAP: Record<string, keyof FaturaRaw> = {
  'Número':            'numero',
  'Numero':            'numero',
  'Emissão':           'emissao',
  'Emissao':           'emissao',
  'Pessoa':            'pessoa',
  'Vencimento':        'vencimento',
  'Valor Final':       'valor',
  'Valor_Final':       'valor',
  'Fatura Cliente Nº': 'fatura_cliente_no',
  'Fatura Cliente No': 'fatura_cliente_no',
}
const COL_MAP_NORM: Record<string, keyof FaturaRaw> = Object.fromEntries(
  Object.entries(COL_MAP).map(([k, v]) => [normalizeHeader(k), v]),
)

// Obrigatórias p/ a revisão: Pessoa (cruzamento), Valor Final, Vencimento, Fatura Cliente Nº.
// Número/Emissão são contexto. Reusa o helper compartilhado (v4.29.0), comparando normalizado.
const REQUISITOS: RequisitoColuna[] = [
  { label: 'Pessoa',            aceitos: ['pessoa'] },
  { label: 'Valor Final',       aceitos: [normalizeHeader('Valor Final')] },
  { label: 'Vencimento',        aceitos: ['vencimento'] },
  { label: 'Fatura Cliente Nº', aceitos: [normalizeHeader('Fatura Cliente Nº')] },
]

export async function parseFaturamentoFile(
  file: File,
): Promise<FaturaRaw[] | { error: string }> {
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

    const headers = Object.keys(rows[0]).map(h => h.trim())
    const faltando = validarColunasObrigatorias(headers.map(normalizeHeader), REQUISITOS)
    if (faltando.length > 0) return { error: mensagemColunasFaltando(faltando) }

    const linhas: FaturaRaw[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (Object.values(row).every(c => c === null || c === '')) continue // pula linha vazia

      const get = (campo: keyof FaturaRaw): unknown => {
        for (const h of Object.keys(row)) if (COL_MAP_NORM[normalizeHeader(h.trim())] === campo) return row[h]
        return null
      }
      const pessoaRaw = get('pessoa')
      const fcnRaw    = get('fatura_cliente_no')
      const numRaw    = get('numero')

      linhas.push({
        linha:             i + 2, // cabeçalho = linha 1
        numero:            numRaw == null || numRaw === '' ? null : String(numRaw).trim(),
        emissao:           toIsoDate(get('emissao')),
        pessoa:            pessoaRaw == null ? null : (String(pessoaRaw).trim() || null),
        vencimento:        toIsoDate(get('vencimento')),
        valor:             toNum(get('valor')),
        fatura_cliente_no: fcnRaw == null || fcnRaw === '' ? null : String(fcnRaw).trim(), // TEXT
      })
    }

    if (linhas.length === 0) return { error: 'Nenhuma linha com dados encontrada.' }
    return linhas
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao processar o arquivo.' }
  }
}
