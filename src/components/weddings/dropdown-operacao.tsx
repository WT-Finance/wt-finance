'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown, X } from 'lucide-react'
import type { OperacoesLista } from '@/types/api'

interface Props {
  operacoes: OperacoesLista
  operacaoAtiva: string | null
}

export default function DropdownOperacao({ operacoes, operacaoAtiva }: Props) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const nomeExibido = (label: string) => label.split(' - ')[1] ?? label

  const filtradas = [...(busca
    ? operacoes.filter(o => o.label.toLowerCase().includes(busca.toLowerCase()))
    : operacoes
  )].sort((a, b) => nomeExibido(a.label).localeCompare(nomeExibido(b.label), 'pt-BR'))

  const labelAtiva = operacoes.find(o => o.operacao === operacaoAtiva)?.label

  const handleSelect = (operacao: string | null) => {
    setOpen(false)
    setBusca('')
    const params = new URLSearchParams(searchParams.toString())
    if (operacao) params.set('operacao', operacao)
    else params.delete('operacao')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-[--border] rounded-lg bg-white hover:bg-zinc-50 transition-colors text-[--text-primary]"
      >
        <span className="max-w-[220px] truncate">
          {labelAtiva ? labelAtiva.split(' - ')[1] ?? labelAtiva : 'Todas as operações'}
        </span>
        <ChevronDown size={14} className="text-zinc-400 shrink-0" />
      </button>

      {operacaoAtiva && (
        <button
          onClick={() => handleSelect(null)}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white flex items-center justify-center"
          title="Limpar filtro"
        >
          <X size={10} />
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 right-0 z-30 w-72 bg-white border border-[--border] rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100">
            <input
              type="text"
              placeholder="Buscar operação..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full text-sm outline-none text-[--text-primary] placeholder:text-zinc-400"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${!operacaoAtiva ? 'text-[--brand] font-medium' : 'text-[--text-muted]'}`}
            >
              Todas as operações
            </button>
            {filtradas.map(o => (
              <button
                key={o.operacao}
                onClick={() => handleSelect(o.operacao)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${operacaoAtiva === o.operacao ? 'text-[--brand] font-medium bg-[--brand-soft]' : 'text-[--text-primary]'}`}
              >
                {nomeExibido(o.label)}
              </button>
            ))}
            {filtradas.length === 0 && (
              <p className="px-3 py-4 text-sm text-zinc-400 text-center">Nenhum resultado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
