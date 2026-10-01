import { getServerClient } from '@/lib/supabase/server'
import { parseRpc, ingestaoPainelSchema } from '@/lib/schemas-rpc'
import { IngestaoContent } from '@/components/admin/ingestao/ingestao-content'
import { getMondeSincronizacaoStatusAction } from '@/app/admin/ingestao/actions'

// Admin · Log de Ingestão (v6.0.0/M6, anexo `docs/briefings/anexo-v6-0-0-m6-desenho-log-e-alarmes.md`
// §7) — cargas/execuções recentes, alarmes (abertos + histórico), estado do vigia e liga/desliga
// de expectativas, tudo lido de `ingestao_painel()` (migration 0280, APLICADA e `database.ts`
// já regenerado pela sessão principal — RPC chamada TIPADA direto, sem cast frouxo).
// Guard de área em layout.tsx (área 'admin/uploads').

export const dynamic = 'force-dynamic'

export default async function IngestaoPage() {
  const supabase = await getServerClient()
  // v6.1.1: o cartão "Sincronização Monde" veio do Upload para cá. As duas leituras são
  // independentes e correm em paralelo; o Monde é fail-safe (qualquer falha vira `null` e o
  // cartão diz "indisponível" — nunca derruba o Log). allSettled, não `.catch()` na RPC (é
  // thenable, sem `.catch` — skill contrato-rpc-front §2); índices POSICIONAIS: [0] painel, [1] Monde.
  const [painelRes, mondeRes] = await Promise.allSettled([
    supabase.rpc('ingestao_painel'),
    getMondeSincronizacaoStatusAction(),
  ])
  // Rejeição do painel mantém o comportamento de antes (a falha propaga para o error boundary).
  if (painelRes.status === 'rejected') throw painelRes.reason
  const painel = parseRpc(ingestaoPainelSchema, painelRes.value, 'ingestao_painel')
  const statusMonde =
    mondeRes.status === 'fulfilled' && !('error' in mondeRes.value) ? mondeRes.value : null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text-primary">Log de Ingestão</h1>
        <p className="mt-0.5 text-sm text-text-subtle">
          Cargas, execuções agendadas e alarmes da ingestão — o que aconteceu e se o vigia está de pé
        </p>
      </div>

      <IngestaoContent painelInicial={painel} statusMondeInicial={statusMonde} />
    </div>
  )
}
