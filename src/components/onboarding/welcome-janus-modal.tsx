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
// nunca var(--brand) (ADR-0103 ext. v4.14.1). Título em SERIFA — stack Georgia; quando a
// Trajan Pro entrar no repo, a troca é SÓ a linha `fontFamily` abaixo (registrado no ADR).

import { use, useState, useTransition } from 'react'
import Image from 'next/image'
import { marcarOnboardingVisto } from '@/lib/onboarding'

export default function WelcomeJanusModal({ vistoPromise }: { vistoPromise: Promise<boolean> }) {
  const visto = use(vistoPromise)
  const [fechado, setFechado] = useState(false)
  const [, startTransition] = useTransition()

  if (visto || fechado) return null

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

        <h1
          className="mt-7 text-2xl text-zinc-900"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
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
