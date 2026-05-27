import type { ReactNode } from 'react'
import { HardHat } from 'lucide-react'
import Link from 'next/link'
import { Suspense } from 'react'
import PreviewButton from './preview-button'

export default function EmConstrucao({
  children,
  preview,
}: {
  children: ReactNode
  preview: boolean
}) {
  if (preview) return <>{children}</>

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-3 text-center px-4">
      <HardHat size={48} className="text-zinc-300" />
      <p className="text-lg font-medium text-zinc-500">Esta seção está em construção</p>
      <p className="text-sm text-zinc-400">Estamos finalizando esta área.</p>
      <Suspense fallback={null}>
        <PreviewButton />
      </Suspense>
      <div className="mt-2 flex flex-col items-start gap-1">
        <p className="text-xs text-zinc-400">Você pode estar procurando:</p>
        <Link
          href="/performance/weddings"
          className="flex items-center gap-1.5 text-xs text-[#BD965C] underline hover:opacity-80"
        >
          <span className="w-1 h-1 rounded-full bg-zinc-400 shrink-0" />
          Weddings
        </Link>
        <Link
          href="/financeiro/fluxo-caixa"
          className="flex items-center gap-1.5 text-xs text-[#BD965C] underline hover:opacity-80"
        >
          <span className="w-1 h-1 rounded-full bg-zinc-400 shrink-0" />
          Financeiro
        </Link>
      </div>
    </div>
  )
}
