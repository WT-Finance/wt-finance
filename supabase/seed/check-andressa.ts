import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAdminClient } from '@/lib/supabase/admin'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

async function main() {
  const db = getAdminClient()
  const rpc = (db.rpc as unknown as BoundRpc).bind(db)

  // Primeiro descobre o nome exato da operação
  const { data: lista } = await rpc('get_operacoes_weddings', {
    p_busca: 'Andressa',
    p_status: 'todos',
    p_por_pagina: 10,
  }) as { data: { operacoes?: { operacao: string; nome_casal: string }[] } }

  const ops = (lista as unknown as { operacoes: { operacao: string; nome_casal: string }[] })?.operacoes ?? []
  console.log('Operações Andressa encontradas:')
  for (const op of ops) console.log(' -', JSON.stringify(op.operacao))

  if (ops.length === 0) return

  // Pega detalhes da primeira
  const { data: detalhe, error } = await rpc('get_operacao_weddings', { p_operacao: ops[0].operacao })
  if (error) { console.error('Erro:', error.message); return }

  const d = detalhe as Record<string, unknown>
  const vf = d['visao_financeira'] as Record<string, unknown>
  const lancamentos = d['lancamentos_recentes'] as Record<string, unknown>[]

  console.log('\nVisão Financeira:')
  console.log('  Faturamento:    ', vf['faturamento'])
  console.log('  Receita Bruta:  ', vf['receita_bruta'])
  console.log('  Entradas total: ', vf['entradas_total'])
  console.log('  Saídas total:   ', vf['saidas_total'])
  console.log('  Resultado Caixa:', vf['resultado_caixa'])

  console.log('\nÚltimos lançamentos:')
  for (const l of (lancamentos ?? []).slice(0, 5)) {
    console.log(`  ${l['tipo']} | ${l['valor']} | ${l['descricao']} | ${l['status']}`)
  }
}
main().catch(e => { console.error(e.message); process.exit(1) })
