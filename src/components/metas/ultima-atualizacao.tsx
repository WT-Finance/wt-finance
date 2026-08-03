'use client'

import { useEffect, useState } from 'react'
import { Clock, TriangleAlert } from 'lucide-react'
import { fmtDataHoraLongoSP } from '@/lib/fmt'
import { sincronizacaoAtrasada } from '@/lib/metas/sync-atraso'

// Rótulo "Última atualização em <ts>" com sinal de saúde da sincronização (v5.1.11).
// Quando a última sincronização com o Monde passa de 3 ticks (45min) sem avançar, o rótulo
// fica VERMELHO e o relógio vira um triângulo de alerta — sinaliza que a integração pode ter
// parado, SEM depender de alguém reparar no horário. (Ver o diagnóstico em sync-atraso.ts.)
//
// O atraso é avaliado no CLIENTE contra "agora" e re-checado a cada 30s, então o rótulo cruza
// para vermelho SOZINHO ao passar do limite — não espera o próximo reload (o auto-refresh de
// /metas+TV, a cada 5min, traz um `iso` fresco quando a sincronização volta, devolvendo o neutro).
// Começa NEUTRO no 1º render (o servidor não conhece o "agora" do cliente → sem mismatch de
// hidratação) e reavalia no efeito.
//
// Usado em: Acompanhamento (/metas), Comparação (/metas/comparacao), Modo TV (/metas/tv)
// e — com a vigília DESLIGADA — o card da DRE (v5.4.1, ver `vigiarAtraso`).

interface Props {
  /** timestamptz da última sincronização (ISO). Nulo → não renderiza nada. */
  iso: string | null
  /** Texto antes da data. "Última atualização em" (default) | "Atualizado em" (TV). */
  prefixo?: string
  /** Classes de LAYOUT/tamanho do wrapper (ex.: `text-xs`, `text-lg`). NÃO passar cor —
   *  a cor é do componente (neutra quando ok, `text-danger` quando atrasada). */
  className?: string
  /** Cor no estado OK (default `text-[var(--text-muted)]`). Trocada por `text-danger` no atraso. */
  corNeutra?: string
  /** Tamanho do ícone (px). Default 13 (rótulos pequenos); TV usa ~18. */
  iconSize?: number
  /** Vigiar o atraso da sincronização (default `true` — o comportamento das telas de Metas).
   *  `false` = o rótulo é só a data, sempre neutra, sem timer.
   *
   *  O limite de 45min embutido em `sincronizacaoAtrasada` é a régua do CRON do Monde, que
   *  avança a cada ~15min. Para uma fonte de cadência HUMANA — o upload de Lançamentos por
   *  Movimentação, que a controladoria sobe de tempos em tempos — essa régua acusaria atraso
   *  quase sempre, e um alerta que fica vermelho o tempo todo não é alerta, é ruído. */
  vigiarAtraso?: boolean
}

export default function UltimaAtualizacao({
  iso,
  prefixo = 'Última atualização em',
  className = '',
  corNeutra = 'text-[var(--text-muted)]',
  iconSize = 13,
  vigiarAtraso = true,
}: Props) {
  const [atrasada, setAtrasada] = useState(false)

  useEffect(() => {
    if (!iso || !vigiarAtraso) return
    const avaliar = () => setAtrasada(sincronizacaoAtrasada(iso, Date.now()))
    avaliar()
    const id = setInterval(avaliar, 30_000)
    return () => clearInterval(id)
  }, [iso, vigiarAtraso])

  if (!iso) return null

  const Icone = atrasada ? TriangleAlert : Clock
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${atrasada ? 'text-danger' : corNeutra} ${className}`}
      title={
        atrasada
          ? 'A sincronização com o Monde não avança há mais de 45 min — a integração pode ter parado de transmitir.'
          : undefined
      }
    >
      <Icone size={iconSize} className={atrasada ? undefined : 'text-zinc-400'} aria-hidden />
      {prefixo} {fmtDataHoraLongoSP(iso)}
    </span>
  )
}
