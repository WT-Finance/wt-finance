'use client'

import { useState } from 'react'
import { Sparkles, Wrench, TrendingUp, type LucideIcon } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { fmtDataHora } from '@/lib/fmt'
import ModalCentral from '@/components/shared/modal-central'
import { CHANGELOG_DIRETORIA, type ChangelogTipo } from '@/data/changelog-diretoria'

// Metadados visuais por tipo. Cores FIXAS (paleta dessaturada global), não
// theme-scoped: o modal é global (sidebar) e não deve herdar a cor da aba atual.
const TIPO_META: Record<ChangelogTipo, { label: string; Icon: LucideIcon; bg: string; color: string }> = {
  novidade: { label: 'Novidade', Icon: Sparkles,   bg: 'var(--positive-soft)', color: 'var(--positive-deep)' },
  correcao: { label: 'Correção', Icon: Wrench,      bg: 'var(--negative-soft)', color: 'var(--negative-deep)' },
  melhoria: { label: 'Melhoria', Icon: TrendingUp,  bg: 'var(--neutral-soft)',  color: 'var(--text-secondary)' },
}

// Marca "sunburst" do Claude (aproximação), monocromática em currentColor.
function ClaudeLogo({ size = 13 }: { size?: number }) {
  const rays = 12
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
      {Array.from({ length: rays }).map((_, i) => {
        const a = (i / rays) * Math.PI * 2
        const inner = 2.2
        const outer = i % 2 === 0 ? 10 : 7.4
        return (
          <line
            key={i}
            x1={12 + Math.cos(a) * inner}
            y1={12 + Math.sin(a) * inner}
            x2={12 + Math.cos(a) * outer}
            y2={12 + Math.sin(a) * outer}
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export default function VersionHistory() {
  const [open, setOpen] = useState(false)

  const poweredBy = (
    <span className="inline-flex items-center gap-1 text-[11px] italic text-zinc-400">
      <ClaudeLogo />
      powered by Claude Code
    </span>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] font-medium tracking-[0.5px] hover:underline cursor-pointer"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Abrir histórico de versões"
      >
        version {APP_VERSION}
      </button>

      {open && (
        <ModalCentral
          titulo="Histórico de versões"
          tituloAcessorio={poweredBy}
          subtitulo="Registro histórico de implementações das versões"
          onClose={() => setOpen(false)}
        >
          <div className="space-y-6">
            {CHANGELOG_DIRETORIA.map(entrada => (
              <div key={entrada.versao}>
                <div className="flex items-baseline justify-between gap-2 mb-2.5">
                  <span className="text-sm font-semibold text-zinc-900 tabular-nums">v{entrada.versao}</span>
                  <span className="text-xs text-zinc-400 tabular-nums whitespace-nowrap shrink-0">{fmtDataHora(entrada.data)}</span>
                </div>
                <ul className="space-y-2.5">
                  {entrada.itens.map((item, i) => {
                    const meta = TIPO_META[item.tipo]
                    const Icon = meta.Icon
                    return (
                      <li key={i} className="flex gap-2.5">
                        <span
                          className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium mt-0.5 self-start"
                          style={{ background: meta.bg, color: meta.color }}
                        >
                          <Icon size={11} />
                          {meta.label}
                        </span>
                        <span className="text-[13px] text-zinc-600 leading-snug">{item.texto}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </ModalCentral>
      )}
    </>
  )
}
