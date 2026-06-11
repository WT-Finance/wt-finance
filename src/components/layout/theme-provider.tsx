'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Cada setor usa sua cor de destaque dentro das suas abas (ADR-0103). TODAS as
// demais rotas — incluindo as telas de plataforma (/login, /trocar-senha,
// /solicitar-acesso, /sem-acesso, /auth/*, /admin/*) — resolvem para o tema
// neutro do Group. Essas telas, além disso, usam tokens neutros DEDICADOS
// (--action-primary/--focus-ring), e não var(--brand), para não depender da
// hidratação deste provider nem herdar o dourado default do :root. (v4.14.1)
function resolveTheme(pathname: string): string {
  if (pathname.startsWith('/performance/weddings')) return 'weddings'
  if (pathname.startsWith('/performance/trips'))    return 'trips'
  if (pathname.startsWith('/performance/corporativo')) return 'corporativo'
  return 'group'
}

export default function ThemeProvider() {
  const pathname = usePathname()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolveTheme(pathname))
  }, [pathname])

  return null
}
