'use client'

import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { CENTROS, ROTULO_SELETOR, type SeletorCentro } from '@/lib/dre-centro/centros'

// ── Seletor de centro de custo da DRE de caixa (v6.5.1) ──────────────────────
// Fica ACIMA do card da DRE, fora dele: a visão Empresa continua sendo o mesmo componente de
// hoje, chamado com as mesmas props (a tabela não ganha nada). A escolha vive na URL
// (`?centro=`) — dá para mandar o link de um centro —, e Empresa é o parâmetro AUSENTE: a URL
// de hoje continua abrindo exatamente a DRE de hoje.

const AJUDA =
  'Empresa é a DRE de caixa de sempre. Por centro, a mesma árvore calculada para cada operação, com ' +
  'os recebíveis antecipados devolvidos ao mês do vencimento e ao centro dono, e as antecipações ' +
  '(dinheiro, devolução e taxa) atribuídas a quem precisou do caixa. Lado a lado mostra os centros ' +
  'em colunas. Só 2026: antes disso o Monde não tem o centro preenchido.'

export default function SeletorCentro({ atual }: { atual: SeletorCentro }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function escolher(s: SeletorCentro) {
    if (s === atual) return
    const params = new URLSearchParams(searchParams.toString())
    if (s === 'empresa') params.delete('centro')
    else params.set('centro', s)
    const q = params.toString()
    startTransition(() => router.push(q ? `${pathname}?${q}` : pathname, { scroll: false }))
  }

  const pill = (s: SeletorCentro) => (
    <button
      key={s}
      type="button"
      onClick={() => escolher(s)}
      aria-pressed={atual === s}
      className={['foco-neutro', PILL_FILTRO, atual === s ? '' : PILL_FILTRO_INATIVO].join(' ')}
      style={atual === s ? PILL_FILTRO_ATIVO_STYLE : undefined}
    >
      {ROTULO_SELETOR[s]}
    </button>
  )

  return (
    <div
      role="group"
      aria-label="Centro de custo"
      aria-busy={isPending}
      className={`flex flex-wrap items-center gap-1.5 ${isPending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-text-muted">
        Centro de custo
        <GatilhoAjuda
          rotulo="Centro de custo"
          texto={AJUDA}
          classNameBalao="z-30 w-80 !whitespace-normal font-normal normal-case tracking-normal leading-snug"
        />
      </span>
      {pill('empresa')}
      <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
      {CENTROS.map(pill)}
      <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
      {pill('lado')}
    </div>
  )
}
