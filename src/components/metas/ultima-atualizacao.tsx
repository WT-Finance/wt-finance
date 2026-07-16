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
// Usado em: Acompanhamento (/metas), Comparação (/metas/comparacao) e Modo TV (/metas/tv).

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
}

export default function UltimaAtualizacao({
  iso,
  prefixo = 'Última atualização em',
  className = '',
  corNeutra = 'text-[var(--text-muted)]',
  iconSize = 13,
}: Props) {
  const [atrasada, setAtrasada] = useState(false)

  useEffect(() => {
    if (!iso) return
    const avaliar = () => setAtrasada(sincronizacaoAtrasada(iso, Date.now()))
    avaliar()
    const id = setInterval(avaliar, 30_000)
    return () => clearInterval(id)
  }, [iso])

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
