/**
 * seed-lancamentos-financeiro.ts — Carrega "Lançamentos por categoria 2026.xlsx"
 * em raw.lancamentos e regenera financeiro.fato_lancamentos.
 *
 * Uso:
 *   npx tsx supabase/seed/seed-lancamentos-financeiro.ts
 *
 * Requisitos:
 *   .env.local com SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import * as XLSX from '@e965/xlsx'
import * as path from 'path'
import * as fs from 'fs'
import { getAdminClient } from '@/lib/supabase/admin'

const DATA_DIR   = path.join(process.cwd(), 'supabase', 'seed', 'data')
const ARQUIVO    = 'Lançamentos por categoria 2026.xlsx'
const BATCH_SIZE = 1000

// ──────────────────────────────────────────────────────────────────────────────
// Parsing (server-side, replicates parse-lancamentos-financeiro.ts logic)
// ──────────────────────────────────────────────────────────────────────────────

interface LancamentoRow {
  arquivo_origem:      string
  numero:              string | null
  venda_no:            number | null
  emissao:             string | null
  vencimento:          string | null
  liquidacao:          string | null
  pessoa:              string | null
  descricao:           string | null
  descricao_categoria: string | null
  valor:               number
  categoria:           string | null
  grupo_categoria:     string | null
  conta:               string | null
}

function toIsoDate(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = String(value.getUTCMonth() + 1).padStart(2, '0')
    const d = String(value.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(value).trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10)
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [day, month, year] = s.split('/')
    return `${year}-${month}-${day}`
  }
  return null
}

function toStr(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const s = String(value).trim()
  return s || null
}

function isDetalheNum(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  return /^\d+$/.test(String(value).trim())
}

function parseLancamentosXlsx(filePath: string): LancamentoRow[] {
  const nomeArquivo = path.basename(filePath)
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]

  // Use header:1 to get arrays; raw:true gives numbers/dates as native types
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true })

  if (rows.length < 2) throw new Error(`${nomeArquivo}: sem dados`)

  // Detect column positions from header row
  const hdrRow = rows[0] as (string | null)[]
  const hdrIdx: Record<string, number> = {}
  hdrRow.forEach((h, i) => { if (h) hdrIdx[h.trim()] = i })

  // Actual Número is at the last null-header column before first named column
  // In the standard ERP export: header row is ["Número", null, null, "Venda Nº", ...]
  // The real numero appears at index 2 (just before "Venda Nº")
  const vendaNoIdx = hdrIdx['Venda Nº'] ?? 3
  const numeroIdx  = vendaNoIdx - 1  // always one slot before "Venda Nº"

  const COL = {
    numero:              numeroIdx,
    venda_no:            hdrIdx['Venda Nº']            ?? 3,
    emissao:             hdrIdx['Emissão']              ?? 4,
    vencimento:          hdrIdx['Vencimento']           ?? 5,
    liquidacao:          hdrIdx['Liquidação']           ?? 6,
    pessoa:              hdrIdx['Pessoa']               ?? 7,
    descricao:           hdrIdx['Descrição']            ?? 8,
    descricao_categoria: hdrIdx['Descrição Categoria']  ?? 9,
    valor:               hdrIdx['Valor']                ?? 10,
    categoria:           hdrIdx['Categoria']            ?? 11,
    grupo_categoria:     hdrIdx['Grupo de Categoria']   ?? 12,
    conta:               hdrIdx['Conta']                ?? 13,
  }

  const result: LancamentoRow[] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] as unknown[]
    const numVal = row[COL.numero]
    if (!isDetalheNum(numVal)) continue

    const valorRaw = row[COL.valor]
    const valor = typeof valorRaw === 'number' ? valorRaw : null
    if (valor === null) continue

    result.push({
      arquivo_origem:      nomeArquivo,
      numero:              toStr(numVal),
      venda_no:            typeof row[COL.venda_no] === 'number' ? Math.round(row[COL.venda_no] as number) : null,
      emissao:             toIsoDate(row[COL.emissao]),
      vencimento:          toIsoDate(row[COL.vencimento]),
      liquidacao:          toIsoDate(row[COL.liquidacao]),
      pessoa:              toStr(row[COL.pessoa]),
      descricao:           toStr(row[COL.descricao]),
      descricao_categoria: toStr(row[COL.descricao_categoria]),
      valor,
      categoria:           toStr(row[COL.categoria]),
      grupo_categoria:     toStr(row[COL.grupo_categoria]),
      conta:               toStr(row[COL.conta]),
    })
  }

  return result
}

// ──────────────────────────────────────────────────────────────────────────────
// RPC helper
// ──────────────────────────────────────────────────────────────────────────────

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function rpc(fn: string, args?: Record<string, unknown>): Promise<unknown> {
  const client = getAdminClient()
  const bound = (client.rpc as unknown as BoundRpc).bind(client)
  const { data, error } = await bound(fn, args)
  if (error) throw new Error(`RPC ${fn} falhou: ${error.message}`)
  return data
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== seed-lancamentos-financeiro ===\n')

  const filePath = path.join(DATA_DIR, ARQUIVO)
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`)
    process.exit(1)
  }

  // 1. Parse
  console.log(`1. Lendo ${ARQUIVO}...`)
  const rows = parseLancamentosXlsx(filePath)
  console.log(`   ✓ ${rows.length} lançamentos parseados\n`)

  // 2. Truncate raw.lancamentos via public RPC
  console.log('2. Limpando raw.lancamentos...')
  await rpc('truncar_lancamentos_financeiro')
  console.log('   ✓ Tabela zerada\n')

  // 3. Insert in batches via public RPC
  console.log(`3. Inserindo ${rows.length} linhas em lotes de ${BATCH_SIZE}...`)
  let inseridas = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const lote = rows.slice(i, i + BATCH_SIZE)
    await rpc('inserir_lote_lancamentos_financeiro', { p_linhas: lote })
    inseridas += lote.length
    process.stdout.write(`\r   ${inseridas}/${rows.length}...`)
  }
  console.log(`\n   ✓ ${inseridas} linhas inseridas\n`)

  // 4. Regenerar fato
  console.log('4. Regenerando financeiro.fato_lancamentos...')
  await rpc('regenerar_financeiro_lancamentos')
  console.log('   ✓ Fato regenerado\n')

  // 5. CP-2: Reportar KPIs
  console.log('5. CP-2 — KPIs do Fluxo de Caixa (ano corrente)...')
  const hoje = new Date()
  const pFrom = `${hoje.getFullYear()}-01-01`
  const pTo   = hoje.toISOString().split('T')[0]

  const [fluxo, posicao] = await Promise.all([
    rpc('get_fluxo_caixa_mensal',  { p_from: pFrom, p_to: pTo }),
    rpc('get_posicao_por_conta'),
  ])

  const fluxoRows = fluxo as Array<{ tipo: string; valor_total: number }>
  const realizados = fluxoRows?.filter(r => r.tipo === 'realizado') ?? []
  const totalEntradas = realizados.filter(r => r.valor_total > 0).reduce((s, r) => s + r.valor_total, 0)
  const totalSaidas   = realizados.filter(r => r.valor_total < 0).reduce((s, r) => s + Math.abs(r.valor_total), 0)
  const saldoLiquido  = totalEntradas - totalSaidas

  const posicoes = posicao as Array<{ conta: string; saldo: number }>
  const saldoContas = posicoes?.reduce((s, p) => s + p.saldo, 0) ?? 0

  const fmt = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  console.log('\n   ┌─────────────────────────────────────────┐')
  console.log('   │  CP-2 — KPIs Fluxo de Caixa (YTD)      │')
  console.log(`   │  Período: ${pFrom} → ${pTo}  │`)
  console.log('   ├─────────────────────────────────────────┤')
  console.log(`   │  Entradas realizadas : ${fmt(totalEntradas).padStart(16)} │`)
  console.log(`   │  Saídas realizadas   : ${fmt(totalSaidas).padStart(16)} │`)
  console.log(`   │  Saldo líquido       : ${fmt(saldoLiquido).padStart(16)} │`)
  console.log(`   │  Saldo por contas    : ${fmt(saldoContas).padStart(16)} │`)
  console.log('   └─────────────────────────────────────────┘')

  console.log('\n=== Concluído ===')
}

main().catch(err => {
  console.error('\n✗ Erro:', err.message)
  process.exit(1)
})
