'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

// Trava de SESSÃO do preview de páginas "em construção" (v5.2.0, checkpoint). O gate de
// servidor continua sendo o `?preview=1` na URL (é ele que faz a página buscar/renderizar
// o conteúdo pesado). O problema: a URL persiste (refresh, bookmark, restauração de aba),
// então o preview ficava visível "para sempre". Este guard exige que o preview tenha sido
// ACIONADO NESTA sessão (token em sessionStorage, gravado pelo botão "Ver preview"):
// se o token não existe, o `?preview=1` veio de fora da sessão → derruba o param e o
// servidor re-renderiza o aviso. sessionStorage zera a cada nova sessão do navegador →
// o aviso volta, como pedido. (Compartilha a chave com preview-button.tsx.)
export const PREVIEW_TOKEN = 'wt-preview'

export default function PreviewSessionGuard() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (sessionStorage.getItem(PREVIEW_TOKEN) === '1') return
    const params = new URLSearchParams(searchParams.toString())
    params.delete('preview')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname)
  }, [router, pathname, searchParams])

  return null
}
