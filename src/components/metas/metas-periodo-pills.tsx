'use client'

import type { CSSProperties } from 'react'
import { useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { PILL_FILTRO, PILL_FILTRO_INATIVO } from '@/components/shared/botoes'
import { PRESETS_METAS, isPresetMetas, type PresetMetas } from '@/lib/metas/periodo-metas'

// Pills de período do Acompanhamento de Metas (v5.0.0): Mensal (default) /
// Trimestral / Semestral / Anual — cortes CALENDÁRIO-FIXOS (ver periodo-metas.ts),
// distintas das pills de janela móvel da Performance. Sincronizadas por URL
// (?periodo=). Tela de PLATAFORMA (tema group): pill ativa em bege --action-soft
// (nunca var(--brand) — CLAUDE.md/ADR-0103 ext.). startTransition p/ o clique
// não "morrer" (padrão v4.39).

const ATIVO_STYLE: CSSProperties = {
  background:  'var(--action-soft)',
  borderColor: 'var(--action-soft-border)',
  color:       'var(--action-soft-fg)',
}

export default function MetasPeriodoPills() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const bruto = searchParams.get('periodo')
  const ativo: PresetMetas = isPresetMetas(bruto) ? bruto : 'mensal'

  function trocar(p: PresetMetas) {
    if (p === ativo) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('periodo', p)
    // `scroll: false`: filtro no LUGAR — o App Router rola ao topo em toda navegação
    // por default, e aqui só o recorte muda, não a página (fix v5.4.2).
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <div
      className={`flex flex-wrap gap-2 ${isPending ? 'opacity-60' : ''}`}
      role="group"
      aria-label="Período do acompanhamento"
      aria-busy={isPending}
    >
      {PRESETS_METAS.map(p => {
        const sel = p.id === ativo
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={sel}
            onClick={() => trocar(p.id)}
            className={`foco-neutro ${PILL_FILTRO} ${sel ? '' : PILL_FILTRO_INATIVO}`}
            style={sel ? ATIVO_STYLE : undefined}
          >
            {p.label}
          </button>
        )
      })}
    </div>
  )
}
