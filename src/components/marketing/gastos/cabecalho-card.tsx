import type { ReactNode } from 'react'

// Cabeçalho de card da página "Gastos de Marketing": o MESMO título/subtítulo do primitivo
// `Card` (`text-base font-semibold text-text-primary` + `text-[13px] text-text-subtle`), com
// um slot de AÇÃO à direita que o `Card` não tem. O subtítulo é onde cada card DECLARA o seu
// recorte ("Jan–Set/2026 · pago · data de movimentação").
export default function CabecalhoCard({
  titulo, subtitulo, acao,
}: { titulo: string; subtitulo?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold leading-snug text-text-primary">{titulo}</h2>
        {subtitulo && <p className="mt-0.5 text-[13px] text-text-subtle">{subtitulo}</p>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  )
}
