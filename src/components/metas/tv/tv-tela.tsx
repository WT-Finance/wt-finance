'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { X } from 'lucide-react'
import TvCarrossel from '@/components/metas/tv/tv-carrossel'
import { pctEsperado } from '@/components/metas/tv/tv-slide-conteudo'
import TvFullscreenButton from '@/components/metas/tv/tv-fullscreen-button'
import MetasAutoRefresh from '@/components/metas/metas-auto-refresh'
import UltimaAtualizacao from '@/components/metas/ultima-atualizacao'
import { corComparacaoValor } from '@/lib/metas/cor-comparacao'
import type { AcompanhamentoData } from '@/components/metas/tipos'

// ── Modo TV (v5.1.0) — pele de exibição do Acompanhamento para a parede do comercial ──
// 16:9, tema claro, ZERO interação: sem pills/tooltip/hover. A leitura de ritmo vem da
// SETA + da legenda fixa no rodapé (o balão do app some). Paridade visual: barra na cor do
// setor + seta + "% da meta" colorido pela MESMA régua (corComparacao). Group = neutro.
// Escalado para a parede.
//
// v5.6.4: virou CLIENT component — o carrossel mês → trimestre → ano precisa de estado
// local (índice ativo) que SOBREVIVE ao `router.refresh()` do MetasAutoRefresh (60s): os 3
// recortes chegam PRONTOS do RSC (`page.tsx`, ×3 em paralelo — mesma `carregarAcompanhamento`
// da /metas, fonte única preservada), e como `TvTela` não é remontado a cada refresh (mesmo
// componente, mesma posição na árvore), o `useState` do índice não reseta. O avanço
// automático (12s) mora aqui (molde de `metas-auto-refresh.tsx`: setInterval em useEffect
// com cleanup; o índice avança por setState FUNCIONAL dentro do callback do timer — não é o
// padrão que o lint `set-state-in-effect` reprova). Cabeçalho ("Metas · {período}") e rodapé
// (cor da seta da legenda) refletem o slide ATIVO; a composição visual de cada slide (faixa
// Group + grid de setores) é a MESMA de sempre, extraída para `<TvSlideConteudo>` e
// reaproveitada 1× por recorte dentro de `<TvCarrossel>`.

const INTERVALO_CARROSSEL_MS = 12_000

interface Props {
  /** [mensal, trimestral, anual] — nesta ordem (índice = posição no carrossel). */
  slides: AcompanhamentoData[]
  /** Slide em que o carrossel COMEÇA (herdado do preset que a /metas estava exibindo, via
   *  `?periodo=`); a rotação automática segue normalmente dali. Default 0 (mensal). */
  indiceInicial?: number
}

export default function TvTela({ slides, indiceInicial = 0 }: Props) {
  const [indiceAtivo, setIndiceAtivo] = useState(indiceInicial)

  useEffect(() => {
    const id = setInterval(() => {
      setIndiceAtivo(i => (i + 1) % slides.length)
    }, INTERVALO_CARROSSEL_MS)
    return () => clearInterval(id)
  }, [slides.length])

  const ativo = slides[indiceAtivo]
  const [group] = ativo?.setores ?? []
  if (!ativo || !group) return null

  const corGroupSeta = corComparacaoValor(group.ritmo.pctMeta, pctEsperado(group))

  // [TESTE v5.1.0] Fundo com blooms suaves das 3 cores de setor (Trips/Weddings/Corp) sobre o
  // off-white da casa — cartões brancos "flutuam" sobre o gradiente. Inline (color-mix + var()).
  // Se não agradar, reverter para `bg-[var(--surface-soft)]`.
  const fundo =
    'radial-gradient(60% 75% at 6% 0%, color-mix(in srgb, var(--marca-lazer) 15%, transparent), transparent 68%),' +
    'radial-gradient(55% 70% at 94% 4%, color-mix(in srgb, var(--marca-weddings) 15%, transparent), transparent 68%),' +
    'radial-gradient(75% 75% at 50% 100%, color-mix(in srgb, var(--marca-corporativo) 12%, transparent), transparent 70%),' +
    'var(--surface-soft)'

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden px-12 py-8 text-[var(--text-primary)]" style={{ background: fundo }}>
      {/* Auto-refresh (v5.1.6): a parede converge ao dado do banco (cron ~15min) sem reload — 60s. */}
      <MetasAutoRefresh intervaloMs={60_000} />
      {/* Cabeçalho — logo Janus (não o wordmark escrito) + período à esquerda; à direita a
          data da última atualização + tela cheia + sair. O período reflete o slide ATIVO. */}
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Lockup duplo [JANUS] | [WELCOME GROUP] — mesma composição dos e-mails internos. */}
          <span className="relative block h-16 w-64">
            <Image src="/logos/logo-janus.svg" alt="Janus" fill priority className="object-contain object-left" />
          </span>
          <span className="h-12 w-px shrink-0 bg-[var(--border-strong)]" aria-hidden />
          {/* Welcome LEVEMENTE menor que o Janus (harmonia óptica — mesma régua dos e-mails). */}
          <span className="relative block h-12 w-60">
            <Image src="/logos/welcome-group.svg" alt="Welcome Group" fill className="object-contain object-left" />
          </span>
          <span className="ml-4 text-2xl text-[var(--text-secondary)]">Metas · {ativo.periodoLabel}</span>
        </div>
        <div className="flex items-center gap-6">
          <UltimaAtualizacao
            iso={ativo.ultimaAtualizacao}
            prefixo="Atualizado em"
            className="text-lg"
            iconSize={18}
          />
          {/* Ações só-ícone (v5.1.0/checkpoint): tela cheia + X para sair. */}
          <TvFullscreenButton />
          <Link
            href="/metas"
            aria-label="Sair do modo de exibição"
            title="Sair do modo de exibição"
            className="foco-neutro text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
          >
            <X size={22} />
          </Link>
        </div>
      </header>

      {/* Carrossel — mês → trimestre → ano (v5.6.4). Substitui as duas seções fixas
          (faixa Group + grid de setores) de antes da versão. */}
      <TvCarrossel slides={slides} indiceAtivo={indiceAtivo} />

      {/* Legenda fixa no rodapé */}
      <footer className="mt-6 flex items-center justify-center gap-2.5 text-base text-[var(--text-muted)]">
        <span
          aria-hidden
          className="inline-block h-0 w-0"
          style={{ borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8, borderColor: 'transparent', borderTopColor: corGroupSeta }}
        />
        A seta indica o valor esperado para hoje, considerando o período já decorrido.
      </footer>
    </div>
  )
}
