'use client'

import { useEffect, useState } from 'react'

// "há N minutos" (anexo v6.0.0/M6 §4: "a tela mostra 'última verificação: há N minutos'").
// Mesmo padrão de `metas/ultima-atualizacao.tsx`: começa NEUTRO (sem calcular no 1º render —
// o servidor não conhece o "agora" do cliente, então calcular de cara arriscaria mismatch de
// hidratação) e reavalia num efeito, com um intervalo para o texto não "congelar" na tela.

/** Pura — testável sem DOM. `agoraMs`/`iso` em epoch ms e ISO 8601 respectivamente. */
export function formatarRelativo(iso: string, agoraMs: number): string {
  const alvo = new Date(iso).getTime()
  if (Number.isNaN(alvo)) return '—'
  const diffMin = Math.floor((agoraMs - alvo) / 60_000)
  if (diffMin < 1) return 'agora mesmo'
  if (diffMin < 60) return `há ${diffMin} min`
  const horas = Math.floor(diffMin / 60)
  const minutosRestantes = diffMin % 60
  if (horas < 24) return `há ${horas}h${minutosRestantes > 0 ? ` ${minutosRestantes}min` : ''}`
  const dias = Math.floor(horas / 24)
  return `há ${dias} dia${dias > 1 ? 's' : ''}`
}

export function Relativo({ iso }: { iso: string }) {
  const [agora, setAgora] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setAgora(Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [])

  if (agora === null) return null
  return <>{formatarRelativo(iso, agora)}</>
}
