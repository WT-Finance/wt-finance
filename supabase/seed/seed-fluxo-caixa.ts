/**
 * seed-fluxo-caixa.ts — Carrega os exports Monde do Fluxo de Caixa (Onda 1, v5.2.0)
 * em raw.lancamentos_movimentacao / raw.titulos_em_aberto e regenera
 * financeiro.fato_fluxo (regenerar_fluxo_caixa, lê as duas bases).
 *
 * Substitui o script legado de carga do Fluxo de Caixa v1 (seed-lancamentos-
 * -financeiro.ts) — as bases/fato antigos que ele populava foram aposentados
 * (dropados) na migration 0192, M6 da v5.2.0.
 *
 * Fontes (supabase/seed/data/):
 *   - "Lancamentos_por_Movimentacao_tratada.xlsx" — o REALIZADO (eixo data_movimentacao).
 *   - "Lancamentos_por_Vencimento_em_Aberto_tratada.xlsx" — o PREVISTO por vencimento.
 *
 * A coerção de célula (data/número/string) é 100% dos parsers puros
 * (parseLancamentosMovimentacaoRows/parseTitulosEmAbertoRows,
 * @/lib/carga/parse-lancamentos-movimentacao|parse-titulos-em-aberto) — mesmos
 * usados pelo upload em /admin/uploads; nada reimplementado aqui (wt/no-coercao-reimpl).
 *
 * Uso:
 *   npx tsx supabase/seed/seed-fluxo-caixa.ts
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
import { parseLancamentosMovimentacaoRows, type LancamentoMovimentacaoRaw } from '@/lib/carga/parse-lancamentos-movimentacao'
import { parseTitulosEmAbertoRows, type TituloEmAbertoRaw } from '@/lib/carga/parse-titulos-em-aberto'

const DATA_DIR = path.join(process.cwd(), 'supabase', 'seed', 'data')
const ARQUIVO_MOVIMENTACAO = 'Lancamentos_por_Movimentacao_tratada.xlsx'
const ARQUIVO_EM_ABERTO    = 'Lancamentos_por_Vencimento_em_Aberto_tratada.xlsx'
const BATCH_SIZE = 1000

// ──────────────────────────────────────────────────────────────────────────────
// Leitura do .xlsx → matriz de linhas (mesma leitura do parser client-side:
// cellDates:true + raw:false, header:1) — a coerção fica só nos parsers puros.
// ──────────────────────────────────────────────────────────────────────────────

function lerLinhas(filePath: string): unknown[][] {
  const wb = XLSX.readFile(filePath, { cellDates: true, raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false })
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
// Carga full-swap de uma base (truncar → inserir em lotes). `arquivo_origem` é
// anexado por linha no lote (mesmo contrato das Server Actions de upload).
// ──────────────────────────────────────────────────────────────────────────────

async function carregarBase<T extends object>(
  label: string,
  arquivo: string,
  parse: (rows: unknown[][], nomeArquivo: string) => T[] | { error: string },
  rpcTruncar: string,
  rpcInserirLote: string,
): Promise<number> {
  const filePath = path.join(DATA_DIR, arquivo)
  if (!fs.existsSync(filePath)) {
    console.error(`Arquivo não encontrado: ${filePath}`)
    process.exit(1)
  }

  console.log(`   Lendo ${arquivo}...`)
  const linhas = lerLinhas(filePath)
  const resultado = parse(linhas, arquivo)
  if (!Array.isArray(resultado)) {
    console.error(`   ✗ ${resultado.error}`)
    process.exit(1)
  }
  console.log(`   ✓ ${resultado.length} linhas parseadas\n`)

  console.log(`   Limpando ${label}...`)
  await rpc(rpcTruncar)
  console.log('   ✓ Tabela zerada\n')

  console.log(`   Inserindo ${resultado.length} linhas em lotes de ${BATCH_SIZE}...`)
  let inseridas = 0
  for (let i = 0; i < resultado.length; i += BATCH_SIZE) {
    const lote = resultado.slice(i, i + BATCH_SIZE).map(r => ({ ...r, arquivo_origem: arquivo }))
    await rpc(rpcInserirLote, { p_linhas: lote })
    inseridas += lote.length
    process.stdout.write(`\r   ${inseridas}/${resultado.length}...`)
  }
  console.log(`\n   ✓ ${inseridas} linhas inseridas em ${label}\n`)
  return inseridas
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

interface ResultadoRegenerar {
  data_base: string
  realizado_n: number
  previsto_n: number
  futuras_n: number
  pos_corte_n: number
  excluidos_data_nula: number
  contas_novas: string[]
  contas_novas_n: number
}

async function main() {
  console.log('=== seed-fluxo-caixa ===\n')

  // 1. Realizado — Lançamentos por movimentação
  console.log('1. Lançamentos por movimentação (realizado)...')
  await carregarBase<LancamentoMovimentacaoRaw>(
    'raw.lancamentos_movimentacao',
    ARQUIVO_MOVIMENTACAO,
    parseLancamentosMovimentacaoRows,
    'truncar_lancamentos_movimentacao',
    'inserir_lote_lancamentos_movimentacao',
  )

  // 2. Previsto — Lançamentos por vencimento em aberto
  console.log('2. Lançamentos por vencimento em aberto (previsto)...')
  await carregarBase<TituloEmAbertoRaw>(
    'raw.titulos_em_aberto',
    ARQUIVO_EM_ABERTO,
    parseTitulosEmAbertoRows,
    'truncar_titulos_em_aberto',
    'inserir_lote_titulos_em_aberto',
  )

  // 3. Regenerar financeiro.fato_fluxo — uma vez, lê as duas bases.
  console.log('3. Regenerando financeiro.fato_fluxo...')
  const resultado = await rpc('regenerar_fluxo_caixa') as ResultadoRegenerar
  console.log(`   ✓ Fato regenerado — data-base ${resultado.data_base}\n`)

  console.log('   ┌─────────────────────────────────────────────────────┐')
  console.log('   │  Fluxo de Caixa — financeiro.fato_fluxo             │')
  console.log('   ├─────────────────────────────────────────────────────┤')
  console.log(`   │  Realizado                : ${String(resultado.realizado_n).padStart(8)} linhas   │`)
  console.log(`   │  Previsto                 : ${String(resultado.previsto_n).padStart(8)} linhas   │`)
  console.log(`   │    (movimentação futura)  : ${String(resultado.futuras_n).padStart(8)} linhas   │`)
  console.log(`   │  Pós-corte (> 2028-12-31) : ${String(resultado.pos_corte_n).padStart(8)} linhas   │`)
  console.log('   └─────────────────────────────────────────────────────┘')

  if (resultado.excluidos_data_nula > 0) {
    console.warn(`\n   ⚠ ${resultado.excluidos_data_nula} linha(s) sem data-eixo (excluída(s) do fato).`)
  }
  if (resultado.contas_novas_n > 0) {
    console.warn(
      `   ⚠ ${resultado.contas_novas_n} conta(s) nova(s) não classificada(s) automaticamente: ` +
        `${resultado.contas_novas.join(', ')}. Confira em financeiro.dim_conta_bancaria.`,
    )
  }

  console.log('\n=== Concluído ===')
}

main().catch(err => {
  console.error('\n✗ Erro:', err.message)
  process.exit(1)
})
