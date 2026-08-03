import { getAdminClient } from '@/lib/supabase/admin'

// "Última atualização" do card da DRE (v5.4.1) = frescor da BASE que alimenta o
// demonstrativo: `status_lancamentos_movimentacao` (0185) devolve
// `max(carregado_em)` de `raw.lancamentos_movimentacao`, a planilha de Lançamentos
// por Movimentação que `financeiro.fato_fluxo` consome. É o upload que move os
// números da tela — não o cron do Monde, que não toca esta base.
//
// POR QUE ADMIN CLIENT: a RPC tem `REVOKE ... FROM authenticated` e `GRANT` só para
// `service_role` (é ela que serve a tela de /admin/uploads). Abrir um
// `GRANT TO authenticated` só para exibir uma data exporia a contagem da raw a todo
// usuário logado — mais superfície do que o selo pede. A leitura acontece no
// SERVIDOR, dentro da página que já executou `requireArea('financeiro/dre')`, e o
// que atravessa para o cliente é um timestamp, não a contagem. Mesmo padrão de
// `@/lib/metas/ultima-sincronizacao` (que lê `monde_ingest_status` assim desde a
// v5.1.8).
//
// FAIL-SAFE: qualquer erro → `null`, e o consumidor OMITE a linha. Um selo que
// dissesse "sem data" seria pior que selo nenhum (lição da v5.2.1).
export async function buscarUltimaCargaMovimentacao(): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const chamarStatus = admin.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
    const res = await chamarStatus.call(admin, 'status_lancamentos_movimentacao')
    if (res.error) return null
    const st = res.data as { ultima_atualizacao?: string | null } | null
    return st?.ultima_atualizacao ?? null
  } catch {
    return null
  }
}
