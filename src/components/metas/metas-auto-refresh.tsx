'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// [INTERIM — v5.1.6/ADR-0152] Auto-refresh da tela de Metas (/metas e Modo TV /metas/tv).
// A ingestão do Monde atualiza o BANCO a cada ~15min (pg_cron), mas /metas e /metas/tv são
// Server Components (retrato do instante do render): sem isto a tela NUNCA reflete o dado
// fresco sozinha. (A v5.1.4 removeu o antecessor `TvAutoRefresh` na premissa ERRADA de que
// "o pull de 15min o substitui" — o pull atualiza o banco, não a tela; ADR-0152 corrige.)
// A cada `intervaloMs` chama router.refresh(): re-executa o Server Component (re-chama
// carregarAcompanhamento → monde_ingest_status/get_executiva_kpis) e re-hidrata SEM full
// reload — números E "Última atualização" avançam preservando scroll/seleção. PROVISÓRIO:
// quando houver tempo-real (Supabase Realtime/SSE), este componente é REMOVIDO. Isolado de
// propósito (nada depende dele). Não renderiza nada.
export default function MetasAutoRefresh({ intervaloMs }: { intervaloMs: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs)
    return () => clearInterval(id)
  }, [router, intervaloMs])
  return null
}
