'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

const SETORES = [
  { value: 'todos',       label: 'Todos os setores' },
  { value: 'Lazer',       label: 'Trips'            },
  { value: 'Weddings',    label: 'Weddings'         },
  { value: 'Corporativo', label: 'Corporativo'      },
]

export default function SetorFilter() {
  const router      = useRouter()
  const pathname    = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const setor = searchParams.get('setor') ?? 'todos'

  const handleChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('setor', value)
    // `scroll: false`: filtro no LUGAR — o App Router rola ao topo em toda navegação
    // por default, e aqui só o recorte muda, não a página (fix v5.4.2).
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }, [router, pathname, searchParams])

  return (
    <select
      value={setor}
      onChange={e => handleChange(e.target.value)}
      disabled={isPending}
      aria-busy={isPending}
      className={[
        'rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-opacity',
        isPending ? 'opacity-60 pointer-events-none' : '',
      ].join(' ')}
    >
      {SETORES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}
