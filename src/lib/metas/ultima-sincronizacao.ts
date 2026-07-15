import { getAdminClient } from '@/lib/supabase/admin'

// "Última atualização/sincronização" das telas de Metas = frescor do espelho Monde:
// `monde_ingest_status.ultima_sincronizacao` (max(atualizado_em) de monde.ingest_control) —
// avança a cada pull do cron (~15min), MESMO sem venda nova. Fallback a `ultima_sync`
// (último DADO mudado) se a coluna nova vier vazia. (v5.1.8 escolheu a sincronização, não o
// último dado — este congelava em janelas quietas.) Leitura server-side (admin client,
// service-role) de agregado NÃO-sensível; FAIL-SAFE: qualquer erro → null (o consumidor omite
// a linha). `monde_ingest_status` não está no database.ts congelado → tipagem frouxa (padrão
// rpcMetas/acervo/faturamento). Compartilhado por /metas, /metas/tv e /metas/comparacao (v5.1.9).
export async function buscarUltimaSincronizacaoMonde(): Promise<string | null> {
  try {
    const admin = getAdminClient()
    const chamarStatus = admin.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
    const stRes = await chamarStatus.call(admin, 'monde_ingest_status')
    if (stRes.error) return null
    const st = stRes.data as { ultima_sincronizacao?: string | null; ultima_sync?: string | null } | null
    return st?.ultima_sincronizacao ?? st?.ultima_sync ?? null
  } catch {
    return null
  }
}
