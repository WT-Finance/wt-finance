import { getServerClient } from '@/lib/supabase/server'
import { parseRpc, ingestaoPainelSchema } from '@/lib/schemas-rpc'
import { IngestaoContent } from '@/components/admin/ingestao/ingestao-content'

// Admin · Log de Ingestão (v6.0.0/M6, anexo `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md`
// §7) — cargas/execuções recentes, alarmes (abertos + histórico), estado do vigia e liga/desliga
// de expectativas, tudo lido de `ingestao_painel()` (migration 0280, APLICADA e `database.ts`
// já regenerado pela sessão principal — RPC chamada TIPADA direto, sem cast frouxo).
// Guard de área em layout.tsx (área 'admin/uploads').

export const dynamic = 'force-dynamic'

export default async function IngestaoPage() {
  const supabase = await getServerClient()
  const res = await supabase.rpc('ingestao_painel')
  const painel = parseRpc(ingestaoPainelSchema, res, 'ingestao_painel')

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Log de Ingestão</h1>
        <p className="mt-0.5 text-sm text-text-subtle">
          Cargas, execuções agendadas e alarmes da ingestão — o que aconteceu e se o vigia está de pé
        </p>
      </div>

      <IngestaoContent painelInicial={painel} />
    </div>
  )
}
