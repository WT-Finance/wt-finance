'use client'

import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// Filtro GLOBAL da página: só as pills de ano. Não há seleção de meses — o recorte é derivado do
// ano (`recortePadrao`: jan–dez em ano fechado, jan até o mês corrente no ano em curso) e vale
// para TODOS os cards, que o declaram no próprio subtítulo.
//
// Pills de ano montadas aqui com `PILL_FILTRO*` — NÃO se importa `AnoPills` da DRE (a DRE não
// pode ser acoplada a esta página). O ativo usa o trio neutro `--action-soft*`
// (`PILL_PRIMARIA_STYLE`), o mesmo visual de `PILL_FILTRO_ATIVO_STYLE` no tema "group", sem
// tocar em `var(--brand)` num controle de plataforma.

interface Props {
  ano: number
  anos: readonly number[]
  onAno: (ano: number) => void
}

export default function FiltroGlobal({ ano, anos, onAno }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div role="group" aria-label="Ano" className="flex flex-wrap items-center gap-2">
        {anos.map(a => {
          const ativo = a === ano
          return (
            <button
              key={a}
              type="button"
              aria-pressed={ativo}
              onClick={() => { if (!ativo) onAno(a) }}
              title={`Ver o ano ${a}`}
              className={['foco-neutro', PILL_FILTRO, ativo ? '' : PILL_FILTRO_INATIVO].join(' ')}
              style={ativo ? PILL_PRIMARIA_STYLE : undefined}
            >
              {a}
            </button>
          )
        })}
      </div>
    </div>
  )
}
