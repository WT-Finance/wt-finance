'use client'

import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// Filtro GLOBAL da página: só as pills de ano, de SELEÇÃO MÚLTIPLA e SEM teto — uma pill por ano
// presente na base (`anosDisponiveis`), todas podem estar ligadas ao mesmo tempo. Não há seleção de
// meses — o recorte é derivado de cada ano (`recortePadrao`: jan–dez em ano fechado, jan até o mês
// corrente no ano em curso) e o período é a união dos anos selecionados.
//
// Comportamento (regras em `@/lib/marketing/anos`): sempre ao menos um ano — clicar no único
// selecionado não faz nada.
//
// Pills de ano montadas aqui com `PILL_FILTRO*` — NÃO se importa `AnoPills` da DRE (a DRE não
// pode ser acoplada a esta página). O ativo usa o trio neutro `--action-soft*`
// (`PILL_PRIMARIA_STYLE`), o mesmo visual de `PILL_FILTRO_ATIVO_STYLE` no tema "group", sem
// tocar em `var(--brand)` num controle de plataforma.

interface Props {
  /** Anos selecionados (ao menos um). */
  selecionados: readonly number[]
  anos: readonly number[]
  onAlternar: (ano: number) => void
}

export default function FiltroGlobal({ selecionados, anos, onAlternar }: Props) {
  return (
    <div role="group" aria-label="Anos" className="flex flex-wrap items-center gap-2">
      {anos.map(a => {
        const ativo = selecionados.includes(a)
        const unico = ativo && selecionados.length === 1
        const titulo = unico
          ? `${a} é o único ano selecionado`
          : ativo
            ? `Tirar o ano ${a}`
            : `Somar o ano ${a}`
        return (
          <button
            key={a}
            type="button"
            aria-pressed={ativo}
            onClick={() => onAlternar(a)}
            title={titulo}
            className={`foco-neutro ${PILL_FILTRO} ${ativo ? '' : PILL_FILTRO_INATIVO}`}
            style={ativo ? PILL_PRIMARIA_STYLE : undefined}
          >
            {a}
          </button>
        )
      })}
    </div>
  )
}
