'use client'

import { useState } from 'react'
import Image from 'next/image'
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

export default function VersionHistory() {
  const [open, setOpen] = useState(false)

  const poweredBy = (
    <span className="inline-flex items-center gap-1.5 text-[11px] italic text-zinc-400">
      powered by
      <Image
        src="/logos/claude-seeklogo.svg"
        alt="Claude"
        width={58}
        height={12}
        className="inline-block translate-y-px"
      />
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
