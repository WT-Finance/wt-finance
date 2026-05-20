'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

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
