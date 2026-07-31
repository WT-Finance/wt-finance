'use client'

import Checkbox from '@/components/ui/checkbox'
import type { TipoDisponivel } from './tipos'

// Checkboxes de whitelist (quais tipos de solicitação a chave pode abrir/consultar).
// Mesmo padrão visual do bloco de permissões de ModalRole (admin/acessos) — grid
// responsivo dentro de uma caixa com borda. Tipo ARQUIVADO aparece marcado
// "(arquivado)" mas continua selecionável: uma chave já registrada pode tê-lo
// na whitelist, e escondê-lo faria o admin removê-lo sem querer ao salvar.

export function WhitelistTipos({
  tipos,
  selecionados,
  onToggle,
}: {
  tipos: TipoDisponivel[]
  selecionados: number[]
  onToggle: (id: number) => void
}) {
  if (tipos.length === 0) {
    return (
      <p className="text-xs text-zinc-400">
        Nenhum tipo de solicitação cadastrado ainda — crie um em «Tipos de solicitação» antes de liberar a whitelist.
      </p>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2">
      {tipos.map(t => (
        <div key={t.id} className="flex items-center gap-2 text-sm text-zinc-700">
          <Checkbox
            id={`wl-tipo-${t.id}`}
            checked={selecionados.includes(t.id)}
            onChange={() => onToggle(t.id)}
            aria-label={t.nome}
          />
          <label htmlFor={`wl-tipo-${t.id}`} className="cursor-pointer truncate">
            {t.nome}
            {t.arquivado && <span className="ml-1 text-zinc-400">(arquivado)</span>}
          </label>
        </div>
      ))}
    </div>
  )
}
