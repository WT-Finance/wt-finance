import type { ReactNode } from 'react'

/** Converte **texto** em <strong>texto</strong> sem biblioteca Markdown. */
function comNegrito(texto: string): ReactNode[] {
  return texto.split(/\*\*(.*?)\*\*/g).map((parte, i) =>
    i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte
  )
}

interface Props {
  texto: string
}

export default function SumarioExecutivo({ texto }: Props) {
  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 mb-6">
      <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide mb-2">
        Resumo do período
      </p>
      <p className="text-sm text-zinc-700 leading-relaxed">
        {comNegrito(texto)}
      </p>
    </div>
  )
}

export function SumarioExecutivoSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4 mb-6 animate-pulse">
      <div className="h-3 w-28 rounded bg-zinc-200 mb-3" />
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-zinc-100" />
        <div className="h-3 w-5/6 rounded bg-zinc-100" />
        <div className="h-3 w-4/6 rounded bg-zinc-100" />
      </div>
    </div>
  )
}
