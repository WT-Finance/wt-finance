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
      <div className="mt-2 flex flex-col items-center gap-1">
        <p className="text-xs text-zinc-400">Você pode estar procurando:</p>
        <Link
          href="/performance/weddings"
          className="text-xs text-zinc-500 underline hover:text-zinc-700"
        >
          Weddings
        </Link>
      </div>
    </div>
  )
}
