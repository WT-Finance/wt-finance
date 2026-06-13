import { AlertCircle } from 'lucide-react'

// Estado de erro DISCRETO (F5, v4.12) — distingue "não foi possível carregar"
// (falha de RPC) do vazio legítimo ("Sem dados no período"). Sóbrio, sem alarme
// (nada de telas vermelhas); segue o design system (tokens de texto neutros).
export default function ErroCarregamento({
  mensagem = 'Não foi possível carregar — recarregue a página.',
  className = '',
}: {
  mensagem?: string
  className?: string
}) {
  return (
    <div
      role="status"
      className={`flex items-center gap-2 text-[13px] text-[var(--text-muted)] ${className}`}
    >
      <AlertCircle size={15} className="shrink-0 text-[var(--text-subtle)]" />
      <span>{mensagem}</span>
    </div>
  )
}
