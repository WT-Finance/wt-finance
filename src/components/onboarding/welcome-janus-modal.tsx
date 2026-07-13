'use client'

// Modal de boas-vindas "Welcome to Janus" (v4.40.0, ADR-0145) — exibido UMA vez por usuário,
// controlado no BANCO (onboarding_visto_em, migration 0174). O layout transmite a PROMISE da
// consulta (fora do caminho bloqueante, mesma técnica do badge da v4.39) — consumida aqui com
// `use()` dentro do Suspense do caller; consulta que falhou já virou `true` no servidor
// (fail-safe: não exibe; o onboarding jamais trava o app).
//
// TEXTO VERBATIM do Yan (inegociável): título "Welcome to Janus"; corpo exato; botão "Começar".
// SEM "by WELCOME", SEM microcopy de rever, SEM lar permanente.
//
// Tela de PLATAFORMA (aparece em qualquer rota): tokens NEUTROS dedicados (--action-primary),
// nunca var(--brand) (ADR-0103 ext. v4.14.1). Título na fonte da IDENTIDADE (Avenir Heavy,
// caixa alta + tracking — v4.40.1, mockup B aprovado; a serifa Georgia da v4.40.0 saiu).

import { use, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import Image from 'next/image'
import { marcarOnboardingVisto } from '@/lib/onboarding'

export default function WelcomeJanusModal({ vistoPromise }: { vistoPromise: Promise<boolean> }) {
  const visto = use(vistoPromise)
  const pathname = usePathname()
  const [fechado, setFechado] = useState(false)
  const [, startTransition] = useTransition()

  // Modo TV (v5.1.0): a pele /metas/tv é sem chrome — o modal de onboarding não aparece lá.
  if (visto || fechado || pathname === '/metas/tv') return null

  function comecar() {
    // Fecha IMEDIATO (percepção) e grava em transition; falha da gravação é silenciosa
    // (fail-safe — na próxima carga o modal volta, o que é preferível a travar o clique).
    setFechado(true)
    startTransition(() => { void marcarOnboardingVisto() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Welcome to Janus">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl text-center">
        {/* Lockup duplo horizontal (empilha no mobile): [JANUS] | [WELCOME GROUP] */}
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-5">
          <div className="relative h-10 w-40">
            <Image src="/logos/logo-janus.svg" alt="Janus" fill priority className="object-contain" />
          </div>
          <div className="hidden h-10 w-px bg-zinc-200 sm:block" aria-hidden />
          <div className="relative h-9 w-44">
            <Image src="/logos/welcome-group.svg" alt="Welcome Group" fill className="object-contain" />
          </div>
        </div>

        {/* Título na FONTE DA IDENTIDADE (v4.40.1 — mockup B aprovado): Avenir LT Std 85 Heavy
            (a fonte global do app, peso 800 — o mesmo estilo do antigo wordmark "WT FINANCE":
            caixa alta + tracking) no CINZA DA MARCA (--text-muted = #75777B, token de plataforma).
            O texto verbatim permanece "Welcome to Janus" no JSX (a caixa alta é CSS). A serifa
            Georgia saiu; a nota "Trajan = 1 linha" do ADR-0145 fica obsoleta para este título. */}
        <h1
          className="mt-7 text-xl font-[800] uppercase tracking-[2px]"
          style={{ color: 'var(--text-muted)' }}
        >
          Welcome to Janus
        </h1>

        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-zinc-600">
          A plataforma de gestão administrativa e análise de dados criada pelo time Financeiro
          do Welcome Group. Performance, faturamento, fluxo de caixa e mais, tudo num só lugar.
        </p>

        <button
          type="button"
          onClick={comecar}
          className="foco-neutro mt-8 inline-flex items-center justify-center rounded-lg bg-action-primary px-8 py-2.5 text-sm font-medium text-action-primary-fg transition-opacity hover:opacity-90"
        >
          Começar
        </button>
      </div>
    </div>
  )
}
