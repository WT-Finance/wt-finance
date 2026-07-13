'use client'

import { useEffect, useState } from 'react'
import { Maximize, Minimize } from 'lucide-react'

// Botão de TELA CHEIA do Modo de Exibição (v5.1.0) — usa a Fullscreen API do navegador para
// levar a TV edge-to-edge (esconde a barra do navegador). A rota já ocupa o viewport por si
// (h-screen); isto é um EXTRA opt-in (o navegador da TV pode ficar em fullscreen permanente).
// Client mínimo e isolado. Fail-safe: se a API não existir, o clique simplesmente não faz nada.
export default function TvFullscreenButton() {
  const [cheio, setCheio] = useState(false)

  useEffect(() => {
    const onChange = () => setCheio(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  function alternar() {
    if (document.fullscreenElement) void document.exitFullscreen?.()
    else void document.documentElement.requestFullscreen?.()
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="foco-neutro inline-flex items-center gap-1.5 text-base text-[var(--text-muted)] transition-colors hover:text-[var(--text-secondary)]"
      title={cheio ? 'Sair da tela cheia' : 'Tela cheia'}
    >
      {cheio ? <Minimize size={18} /> : <Maximize size={18} />}
      Tela cheia
    </button>
  )
}
