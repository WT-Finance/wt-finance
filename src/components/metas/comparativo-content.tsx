'use client'

import { useRef, useState } from 'react'
import Tabs from '@/components/ui/tabs'
import { Card } from '@/components/ui/card'
import TopSection from '@/components/shared/top-section'
import { SkeletonGrafico } from '@/components/shared/skeletons'
import { AnelKpi } from '@/components/charts'
import { fmtMi } from '@/lib/fmt'
import { PAINEIS } from '@/lib/metas/paineis'
import { useComparativo } from '@/lib/metas/use-comparativo'
import { chaveMes, nomeMes, META_ASSESSORIAS_MENSAL, type PresetComparativo, type MesRef } from '@/lib/metas/comparativo'
import ComparativoColunas from './comparativo-colunas'
import ComparativoBarras, { alturaMinimaBarras } from './comparativo-barras'
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

/** Barra "Meta de Assessorias" (v5.6.2, só Weddings): contratos de casamento vendidos
 *  no mês em foco × meta fixa. Barra própria mínima — o MetaProgressBar do DS é acoplado
 *  à semântica do ritmo (esperado/decorrido), que não existe numa contagem simples. */
function BarraAssessorias({ realizado, meta, cor }: { realizado: number; meta: number; cor: string }) {
  const pct = Math.min(100, (realizado / meta) * 100)
  return (
    <div className="w-full px-3">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-muted)]">Meta de Assessorias</span>
        <span className="text-xs font-bold tabular-nums text-[var(--text-primary)]">
          {realizado.toLocaleString('pt-BR')} de {meta}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={meta}
        aria-valuenow={Math.min(realizado, meta)}
        aria-label={`Meta de Assessorias: ${realizado} de ${meta} contratos`}
      >
        <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: cor }} />
      </div>
    </div>
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
const POPOVER_H = 440 // header + lista (max-h 300) + rodapé — manter em sincronia com seletor-meses
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

  const { data, carregando, assessorias } = useComparativo(setorKey, preset, personalizados)

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
    <TopSection titulo="Comparativo">
      {/* Pills de período ABAIXO das de setor (ajuste 11/08 — pedido explícito). */}
      <div className="mb-4 space-y-2">
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
          {/* Sem chip do mês escolhido (ajuste 11/08): reabrir o popover é clicar de
              novo na própria pill "Personalizado" (o Tabs dispara onChange na ativa). */}
        </div>

        <SeletorMeses
          aberto={popoverAberto}
          pos={popoverPos}
          selecionados={personalizados}
          onAplicar={meses => {
            setPopoverAberto(false)
            // Reaplicar a MESMA seleção mantém a referência — evita refetch redundante
            // (a dep `personalizados` do hook mudaria só de identidade, não de valor).
            setPersonalizados(prev =>
              prev.length === meses.length && prev.map(chaveMes).join() === meses.map(chaveMes).join()
                ? prev
                : meses,
            )
          }}
          onFechar={() => setPopoverAberto(false)}
        />
      </div>

      {/* Durante um REFETCH os dados anteriores ficam visíveis com opacidade reduzida
          (react-padroes §1a — evita o flicker de skeleton a cada pill e o CLS da altura
          dinâmica das barras); skeleton só no PRIMEIRO carregamento (sem dado algum). */}
      <div aria-busy={carregando}>
        {!data ? (
          carregando ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1.5fr_1fr]" aria-hidden="true">
              <SkeletonGrafico altura="h-64" />
              <SkeletonGrafico altura="h-64" />
              <SkeletonGrafico altura="h-40" />
            </div>
          ) : (
            <p className="rounded-xl bg-white px-5 py-8 text-center text-sm shadow-sm text-[var(--text-muted)]">
              Sem dados para a seleção.
            </p>
          )
        ) : semDados && !carregando ? (
          <p className="rounded-xl bg-white px-5 py-8 text-center text-sm shadow-sm text-[var(--text-muted)]">
            Sem dados para a seleção.
          </p>
        ) : (
          <div
            className={`grid grid-cols-1 gap-4 transition-opacity lg:grid-cols-[1.5fr_1.5fr_1fr] ${
              carregando ? 'opacity-60' : ''
            }`}
          >
            <Card className="flex flex-col">
              {/* Sem sufixo "(parcial)" no mês vigente — pedido do Yan (11/08). */}
              <CardTitle titulo={`Meta de ${nomeMes(data.foco.mes)}`} />
              <ComparativoColunas item={data.foco} cor={cor} />
            </Card>

            <Card className="flex flex-col">
              <CardTitle titulo="Ano sobre Ano" />
              {/* O gráfico PREENCHE o card até o limite de baixo (ajuste 11/08). */}
              <div className="min-h-0 flex-1" style={{ minHeight: alturaMinimaBarras(data.meses.length) }}>
                <ComparativoBarras meses={data.meses} cor={cor} />
              </div>
            </Card>

            {data.anel && (
              <Card className="flex flex-col">
                <CardTitle titulo={painelAtivo.display} />
                {/* Weddings: anel um pouco menor para caber a "Meta de Assessorias"
                    embaixo SEM crescer o card (v5.6.2). */}
                <div className="flex flex-1 flex-col items-center justify-center gap-5 pb-2">
                  <AnelKpi
                    valor={fmtMi(data.anel.meta)}
                    rotulo={`Meta ${nomeMes(data.anel.mes)}`}
                    cor={cor}
                    tamanho={setorKey === 'Weddings' ? 132 : 168}
                  />
                  {setorKey === 'Weddings' && assessorias != null && (
                    <BarraAssessorias realizado={assessorias} meta={META_ASSESSORIAS_MENSAL} cor={cor} />
                  )}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </TopSection>
  )
}
