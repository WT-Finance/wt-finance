'use client'

import { useRef, useState } from 'react'
import Tabs from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import TopSection from '@/components/shared/top-section'
import { SkeletonGrafico } from '@/components/shared/skeletons'
import { PILL_FILTRO_SM, PILL_FILTRO_INATIVO } from '@/components/shared/botoes'
import { AnelKpi } from '@/components/charts'
import { fmtMi } from '@/lib/fmt'
import { PAINEIS } from '@/lib/metas/paineis'
import { useComparativo } from '@/lib/metas/use-comparativo'
import type { PresetComparativo, MesRef } from '@/lib/metas/comparativo'
import ComparativoColunas from './comparativo-colunas'
import ComparativoBarras from './comparativo-barras'
import SeletorMeses from './seletor-meses'

// Seção "Comparativo" do Acompanhamento de Metas (v5.6.1) — meta × realizado entre
// meses e anos: pills de setor (cor do painel, molde de ritmo-chart.tsx) + pills de
// período (presets + grade aditiva de meses via popover). O dado busca CLIENT-SIDE
// (useComparativo) — a troca de recorte não dá round-trip no RSC da página; a Visão
// geral acima continua vindo pronta do servidor.

/** Título de sub-seção dentro do card (molde `CardTitle` já usado em fluxo-caixa/page.tsx —
 *  não é primitivo compartilhado, é convenção local repetida por design). */
function CardTitle({ titulo }: { titulo: string }) {
  return (
    <h3 className="mb-4 text-base font-semibold leading-snug text-[var(--text-primary)]">
      {titulo}
    </h3>
  )
}

const PERIODOS: { id: PresetComparativo; label: string }[] = [
  { id: 'este-mes',      label: 'Este mês' },
  { id: 'ultimo-mes',    label: 'Último mês' },
  { id: 'personalizado', label: 'Personalizado' },
]

/** Largura/altura aproximadas do popover, só para o clamp no viewport (molde de
 *  FiltroVencimento em base-dados-tab.tsx) — não precisa ser pixel-perfect. */
const POPOVER_W = 360
const POPOVER_H = 420
const POPOVER_MARGEM = 8

export default function ComparativoContent() {
  const [setorKey, setSetorKey]             = useState('todos')
  const [preset, setPreset]                 = useState<PresetComparativo>('este-mes')
  const [personalizados, setPersonalizados] = useState<MesRef[]>([])
  const [popoverAberto, setPopoverAberto]   = useState(false)
  const [popoverPos, setPopoverPos]         = useState<{ top: number; left: number } | null>(null)
  const periodoRowRef = useRef<HTMLDivElement>(null)

  const painelAtivo = PAINEIS.find(p => p.key === setorKey) ?? PAINEIS[0]
  const cor = painelAtivo.cor

  const { data, carregando } = useComparativo(setorKey, preset, personalizados)

  function abrirSeletor() {
    const r = periodoRowRef.current?.getBoundingClientRect()
    if (r) {
      const left = Math.min(Math.max(POPOVER_MARGEM, r.left), window.innerWidth - POPOVER_W - POPOVER_MARGEM)
      const top  = r.bottom + 6 + POPOVER_H > window.innerHeight
        ? Math.max(POPOVER_MARGEM, r.top - 6 - POPOVER_H)
        : r.bottom + 6
      setPopoverPos({ top, left })
    }
    setPopoverAberto(true)
  }

  function onChangePeriodo(id: string) {
    const novoPreset = id as PresetComparativo
    setPreset(novoPreset)
    if (novoPreset === 'personalizado') abrirSeletor()
  }

  const semDados = data != null && data.meses.every(m => m.realizado === null)

  return (
    <TopSection titulo="Comparativo" subtitulo="Meta × realizado entre meses e anos">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <Tabs
          items={PAINEIS.map(p => ({ id: p.key, label: p.display }))}
          ativo={painelAtivo.key}
          onChange={setSetorKey}
          corAtiva={cor}
          ariaLabel="Selecionar setor do comparativo"
        />

        <div ref={periodoRowRef} className="flex items-center gap-2">
          <Tabs
            items={PERIODOS}
            ativo={preset}
            onChange={onChangePeriodo}
            ariaLabel="Selecionar período do comparativo"
          />
          {preset === 'personalizado' && personalizados.length > 0 && (
            <button
              type="button"
              onClick={abrirSeletor}
              className={`${PILL_FILTRO_SM} ${PILL_FILTRO_INATIVO}`}
            >
              {personalizados.length} {personalizados.length === 1 ? 'mês' : 'meses'}
            </button>
          )}
        </div>

        <SeletorMeses
          aberto={popoverAberto}
          pos={popoverPos}
          selecionados={personalizados}
          onAplicar={meses => { setPersonalizados(meses); setPopoverAberto(false) }}
          onFechar={() => setPopoverAberto(false)}
        />
      </div>

      <div aria-busy={carregando}>
        {carregando ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr_1fr]" aria-hidden="true">
            <SkeletonGrafico altura="h-64" />
            <SkeletonGrafico altura="h-64" />
            <SkeletonGrafico altura="h-40" />
          </div>
        ) : !data || semDados ? (
          <p className="rounded-xl bg-white px-5 py-8 text-center text-sm shadow-sm text-[var(--text-muted)]">
            Sem dados para a seleção.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_2fr_1fr]">
            <Card>
              <CardTitle titulo={`Meta de ${data.foco.rotulo}`} />
              <ComparativoColunas item={data.foco} cor={cor} />
            </Card>

            <Card>
              <CardTitle titulo="Realizado por mês" />
              <ComparativoBarras meses={data.meses} cor={cor} />
            </Card>

            {data.anel && (
              <Card>
                <AnelKpi valor={fmtMi(data.anel.meta)} rotulo={`Meta ${data.anel.rotulo}`} cor={cor} />
              </Card>
            )}
          </div>
        )}
      </div>
    </TopSection>
  )
}
