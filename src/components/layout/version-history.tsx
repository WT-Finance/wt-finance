'use client'

import { useState } from 'react'
import { Sparkles, Wrench, TrendingUp, ChevronRight, type LucideIcon } from 'lucide-react'
import { APP_VERSION } from '@/lib/version'
import { fmtDataHora } from '@/lib/fmt'
import ModalCentral from '@/components/shared/modal-central'
import { CHANGELOG_DIRETORIA, type ChangelogTipo, type ChangelogEntrada } from '@/data/changelog-diretoria'

// Metadados visuais por tipo. Cores FIXAS (paleta dessaturada global), não
// theme-scoped: o modal é global (sidebar) e não deve herdar a cor da aba atual.
const TIPO_META: Record<ChangelogTipo, { label: string; Icon: LucideIcon; bg: string; color: string }> = {
  novidade: { label: 'Novidade', Icon: Sparkles,   bg: 'var(--positive-soft)', color: 'var(--positive-deep)' },
  correcao: { label: 'Correção', Icon: Wrench,      bg: 'var(--negative-soft)', color: 'var(--negative-deep)' },
  melhoria: { label: 'Melhoria', Icon: TrendingUp,  bg: 'var(--neutral-soft)',  color: 'var(--text-secondary)' },
}

// Major da versão atual do app (ex.: "4" para "4.39.0"). Deriva de APP_VERSION —
// nenhuma versão fica hardcoded. Quando APP_VERSION virar 5.x, todo o grupo 4.x
// automaticamente deixa de ser o "major atual" e passa a colapsar sozinho.
const MAJOR_ATUAL = APP_VERSION.split('.')[0]

// Quantas entradas do major ATUAL aparecem sem precisar expandir.
const QTD_RECENTES_MAJOR_ATUAL = 5

interface Grupo {
  major:    string
  entradas: ChangelogEntrada[]
}

// Agrupa por major (primeiro segmento de `versao`), preservando a ordem de
// aparição (o array já vem mais-recente-primeiro, então os grupos saem na
// mesma ordem — o major atual primeiro, majors antigos depois).
function agruparPorMajor(entradas: ChangelogEntrada[]): Grupo[] {
  const porMajor = new Map<string, ChangelogEntrada[]>()
  for (const entrada of entradas) {
    const major = entrada.versao.split('.')[0]
    const lista = porMajor.get(major)
    if (lista) lista.push(entrada)
    else porMajor.set(major, [entrada])
  }
  return Array.from(porMajor.entries()).map(([major, itens]) => ({ major, entradas: itens }))
}

// Componente hasteado para o módulo (não definido dentro do render) — exigência
// do ruleset react-hooks/static-components para não remontar a subárvore a cada render.
function EntradaChangelog({ entrada }: { entrada: ChangelogEntrada }) {
  return (
    <div>
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
                className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-3xs font-medium mt-0.5 self-start"
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
  )
}

interface GrupoChangelogProps {
  grupo:               Grupo
  isMajorAtual:        boolean
  expandido:           boolean
  mostrarTodasAtual:   boolean
  onToggleMajor:       () => void
  onMostrarTodasAtual: () => void
}

// Major ATUAL: mostra as ~5 entradas mais recentes; o resto do MESMO major fica
// atrás de um "Mostrar mais N versões" discreto. Major ANTERIOR: fica inteiro
// colapsado atrás de um cabeçalho expansível "Versões N.x — N versões". Nada é
// removido — só a exibição inicial muda.
function GrupoChangelog({ grupo, isMajorAtual, expandido, mostrarTodasAtual, onToggleMajor, onMostrarTodasAtual }: GrupoChangelogProps) {
  if (isMajorAtual) {
    const visiveis = mostrarTodasAtual ? grupo.entradas : grupo.entradas.slice(0, QTD_RECENTES_MAJOR_ATUAL)
    const restantes = grupo.entradas.length - visiveis.length
    return (
      <div className="space-y-6">
        {visiveis.map(entrada => <EntradaChangelog key={entrada.versao} entrada={entrada} />)}
        {restantes > 0 && (
          <button
            onClick={onMostrarTodasAtual}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-600 hover:underline cursor-pointer"
          >
            Mostrar mais {restantes} {restantes === 1 ? 'versão' : 'versões'}
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={onToggleMajor}
        className="w-full flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-600 cursor-pointer"
        aria-expanded={expandido}
      >
        <ChevronRight size={13} className={`transition-transform ${expandido ? 'rotate-90' : ''}`} />
        Versões {grupo.major}.x — {grupo.entradas.length} {grupo.entradas.length === 1 ? 'versão' : 'versões'}
      </button>
      {expandido && (
        <div className="space-y-6 mt-4">
          {grupo.entradas.map(entrada => <EntradaChangelog key={entrada.versao} entrada={entrada} />)}
        </div>
      )}
    </div>
  )
}

export default function VersionHistory() {
  const [open, setOpen] = useState(false)
  const [mostrarTodasAtual, setMostrarTodasAtual] = useState(false)
  const [majorsExpandidos, setMajorsExpandidos] = useState<Set<string>>(() => new Set())

  const grupos = agruparPorMajor(CHANGELOG_DIRETORIA)

  function alternarMajor(major: string) {
    setMajorsExpandidos(prev => {
      const novo = new Set(prev)
      if (novo.has(major)) novo.delete(major)
      else novo.add(major)
      return novo
    })
  }

  // Logo do Claude recolorido para o mesmo cinza do "powered by": o SVG é usado
  // como máscara CSS e a cor vem de backgroundColor: currentColor (herda text-zinc-400).
  const poweredBy = (
    <span className="inline-flex items-center gap-1.5 text-2xs italic text-zinc-400">
      powered by
      <span
        role="img"
        aria-label="Claude"
        className="inline-block not-italic shrink-0"
        style={{
          width: 44,
          height: 9.5,
          backgroundColor: 'currentColor',
          WebkitMaskImage: 'url(/logos/claude-seeklogo.svg)',
          maskImage: 'url(/logos/claude-seeklogo.svg)',
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
        }}
      />
    </span>
  )

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-3xs font-medium tracking-[0.5px] hover:underline cursor-pointer"
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
            {grupos.map(grupo => (
              <GrupoChangelog
                key={grupo.major}
                grupo={grupo}
                isMajorAtual={grupo.major === MAJOR_ATUAL}
                expandido={majorsExpandidos.has(grupo.major)}
                mostrarTodasAtual={mostrarTodasAtual}
                onToggleMajor={() => alternarMajor(grupo.major)}
                onMostrarTodasAtual={() => setMostrarTodasAtual(true)}
              />
            ))}
          </div>
        </ModalCentral>
      )}
    </>
  )
}
