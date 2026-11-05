import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'

/** Cabeçalho ORDENÁVEL — idioma do DS (`ranking-caixa.tsx`/`lista-operacoes.tsx`): ativo =
 *  ArrowUp/ArrowDown; ordenável inativo = ArrowUpDown esmaecido. O gatilho é um
 *  `<button type="button">` DENTRO da `<th>` (focável, entra no tab-order) — a `<th>` em
 *  si NUNCA leva `onClick` (skill `ui-design-system`, receita do "?" de ajuda).
 *  Extraído de `base-dados-tab.tsx` (v6.5.0) para a Base de dados do Gerencial e o registro de
 *  antecipações usarem o MESMO cabeçalho; genérico na chave da coluna. */
export function ThOrdenavel<C extends string>({ rotulo, col, colAtiva, dir, onOrdenar, className = '' }: {
  rotulo:     string
  col:        C
  colAtiva:   C | null
  dir:        'asc' | 'desc'
  onOrdenar:  (col: C) => void
  className?: string
}) {
  const ativo = colAtiva === col
  const ariaSort: 'ascending' | 'descending' | 'none' = ativo ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th aria-sort={ariaSort} className={`py-2 px-2 text-xs font-medium text-zinc-400 ${className}`}>
      <button
        type="button"
        onClick={() => onOrdenar(col)}
        aria-label={`Ordenar por ${rotulo}`}
        className={`foco-neutro inline-flex items-center gap-0.5 hover:text-zinc-600 transition-colors ${ativo ? 'text-zinc-600' : ''}`}
      >
        {rotulo}
        {ativo
          ? (dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
          : <ArrowUpDown size={12} className="text-zinc-300" />}
      </button>
    </th>
  )
}
