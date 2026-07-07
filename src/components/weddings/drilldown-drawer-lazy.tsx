'use client'

// Wrapper lazy do DrilldownDrawer (P3a, v4.39.0/M5): o drawer real importa
// Recharts + @/components/charts, então vai num chunk separado carregado só no
// 1º clique (ssr:false — é conteúdo pós-interação, nunca precisa de SSR) em vez
// de entrar no bundle inicial da rota de Weddings. `FallbackDrawer` é um
// placeholder DISCRETO enquanto o chunk carrega (tipicamente < 1s) — mesma
// geometria do painel real (lateral direito, w-full md:w-[60vw] max-w-2xl) para
// não haver "salto" quando o conteúdo real assume o lugar.
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

function FallbackDrawer() {
  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }} />
      <div className="fixed inset-y-0 right-0 z-50 flex items-center justify-center w-full md:w-[60vw] max-w-2xl bg-white shadow-2xl">
        <Loader2 className="animate-spin text-zinc-300" size={28} />
      </div>
    </>
  )
}

const DrilldownDrawer = dynamic(() => import('./drilldown-drawer'), {
  ssr: false,
  loading: () => <FallbackDrawer />,
})

export default DrilldownDrawer
