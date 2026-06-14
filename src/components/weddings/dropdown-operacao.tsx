'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'
import type { OperacoesLista } from '@/types/api'

interface Props {
  operacoes: OperacoesLista
  selecionadas: string[]
}

export default function DropdownOperacao({ operacoes, selecionadas }: Props) {
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

  const total = selecionadas.length
  const todasAtiva = total === 0

  // Escreve a lista 'operacao' na URL a partir de um novo conjunto. Vazio = Todas (sem filtro).
  const aplicar = (novas: string[]) => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete('operacao')
    novas.forEach(op => params.append('operacao', op))
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }

  // "Todas" é mutuamente exclusiva: marcá-la limpa o resto (conjunto vazio).
  const selecionarTodas = () => aplicar([])

  // Toggle de uma operação: marcar adiciona (e descarta "Todas"); desmarcar remove.
  // Lê a lista VIVA da URL (não a prop, que pode defasar entre toggles rápidos).
  const toggleOperacao = (op: string) => {
    const atuais = searchParams.getAll('operacao')
    const novas = atuais.includes(op) ? atuais.filter(x => x !== op) : [...atuais, op]
    aplicar(novas)
  }

  const rotuloTrigger =
    total === 0 ? 'Todas as operações'
    : total === 1 ? (operacoes.find(o => o.operacao === selecionadas[0])?.label.split(' - ')[1] ?? '1 operação selecionada')
    : `${total} operações selecionadas`

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-[var(--border)] rounded-lg bg-white hover:bg-zinc-50 transition-colors text-[var(--text-primary)]"
      >
        <span className="max-w-[220px] truncate">{rotuloTrigger}</span>
        <ChevronDown size={14} className="text-zinc-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 z-30 w-96 bg-white border border-[var(--border)] rounded-lg shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100">
            <input
              type="text"
              placeholder="Buscar operação..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full text-sm outline-none text-[var(--text-primary)] placeholder:text-zinc-400"
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              onClick={selecionarTodas}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${todasAtiva ? 'text-[var(--brand)] font-medium bg-[var(--brand-soft)]' : 'text-[var(--text-muted)]'}`}
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${todasAtiva ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-zinc-300'}`}>
                {todasAtiva && <Check size={11} strokeWidth={3} />}
              </span>
              Todas as operações
            </button>
            {filtradas.map(o => {
              const ativa = selecionadas.includes(o.operacao)
              return (
                <button
                  key={o.operacao}
                  onClick={() => toggleOperacao(o.operacao)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 transition-colors ${ativa ? 'text-[var(--brand)] font-medium bg-[var(--brand-soft)]' : 'text-[var(--text-primary)]'}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${ativa ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-zinc-300'}`}>
                    {ativa && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="truncate text-left">{o.label}</span>
                </button>
              )
            })}
            {filtradas.length === 0 && (
              <p className="px-3 py-4 text-sm text-zinc-400 text-center">Nenhum resultado</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
