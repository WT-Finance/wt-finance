import type { ReactNode } from 'react'

// Cabeçalho de card da página "Despesas de Marketing": o MESMO título/subtítulo do primitivo
// `Card` (`text-base font-semibold text-text-primary` + `text-[13px] text-text-subtle`), com um
// slot `ajuda` que o `Card` não tem: o "?" (`GatilhoAjuda`) colado ao fim do TÍTULO, na mesma linha
// — como no cabeçalho da grade de proporção da DRE. O subtítulo é onde cada card DECLARA o seu
// período ("2025 + 2026 (até out) · …").
export default function CabecalhoCard({
  titulo, subtitulo, ajuda,
}: { titulo: string; subtitulo?: ReactNode; ajuda?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-base font-semibold leading-snug text-text-primary">{titulo}</h2>
        {ajuda}
      </div>
      {subtitulo && <p className="mt-0.5 text-[13px] text-text-subtle">{subtitulo}</p>}
    </div>
  )
}
