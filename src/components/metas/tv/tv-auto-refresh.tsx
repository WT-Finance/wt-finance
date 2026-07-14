'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// [INTERIM DESCARTÁVEL — v5.1.0/ADR-0148] Auto-refresh do Modo TV. Os dados vêm de
// uploads (não há tempo-real hoje); a cada `intervaloMs` chamamos router.refresh() para
// re-buscar o Server Component. É PROVISÓRIO: quando a API trouxer o tempo-real (versão
// seguinte), este componente é REMOVIDO — está isolado de propósito (nenhum acoplamento;
// nada mais depende dele). Não renderiza nada.
export default function TvAutoRefresh({ intervaloMs = 600_000 }: { intervaloMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervaloMs)
    return () => clearInterval(id)
  }, [router, intervaloMs])
  return null
}
