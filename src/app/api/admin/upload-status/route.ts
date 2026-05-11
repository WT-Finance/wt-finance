import { getAdminClient } from '@/lib/supabase/admin'

export async function GET(): Promise<Response> {
  const supabase = getAdminClient()

  const [
    { count: totalVendas },
    { count: totalLancamentos },
    { data: ultimaVenda },
    { data: ultimoLancamento },
  ] = await Promise.all([
    supabase.schema('analytics').from('fato_venda').select('*', { count: 'exact', head: true }),
    supabase.schema('analytics').from('fato_lancamento_operacao').select('*', { count: 'exact', head: true }),
    supabase.schema('analytics').from('fato_venda').select('criado_em').order('criado_em', { ascending: false }).limit(1),
    supabase.schema('analytics').from('fato_lancamento_operacao').select('importado_em').order('importado_em', { ascending: false }).limit(1),
  ])

  return Response.json({
    vendas: {
      total: totalVendas ?? 0,
      ultima_atualizacao: ultimaVenda?.[0]?.criado_em ?? null,
    },
    lancamentos: {
      total: totalLancamentos ?? 0,
      ultima_atualizacao: ultimoLancamento?.[0]?.importado_em ?? null,
    },
  })
}
