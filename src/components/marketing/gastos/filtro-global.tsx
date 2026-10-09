'use client'

import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { MAX_ANOS, anoBloqueado } from '@/lib/marketing/anos'

// Filtro GLOBAL da página: só as pills de ano, de SELEÇÃO MÚLTIPLA (1 a `MAX_ANOS`). Não há seleção
// de meses — o recorte é derivado de cada ano (`recortePadrao`: jan–dez em ano fechado, jan até o
// mês corrente no ano em curso) e o período é a união dos anos selecionados, declarada no subtítulo
// de cada card.
//
// Comportamento (regras em `@/lib/marketing/anos`): sempre ao menos um ano — clicar no único
// selecionado não faz nada; com o teto atingido, as pills não selecionadas ficam bloqueadas
// (`aria-disabled`, não `disabled`: assim continuam no tab-order e o `title` que diz por quê é
// alcançável por teclado — receita da skill `react-padroes`).
//
// Pills de ano montadas aqui com `PILL_FILTRO*` — NÃO se importa `AnoPills` da DRE (a DRE não
// pode ser acoplada a esta página). O ativo usa o trio neutro `--action-soft*`
// (`PILL_PRIMARIA_STYLE`), o mesmo visual de `PILL_FILTRO_ATIVO_STYLE` no tema "group", sem
// tocar em `var(--brand)` num controle de plataforma.

interface Props {
  /** Anos selecionados (1 a `MAX_ANOS`). */
  selecionados: readonly number[]
  anos: readonly number[]
  onAlternar: (ano: number) => void
}

export default function FiltroGlobal({ selecionados, anos, onAlternar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div role="group" aria-label="Anos" className="flex flex-wrap items-center gap-2">
        {anos.map(a => {
          const ativo = selecionados.includes(a)
          const bloqueado = anoBloqueado(selecionados, a)
          const unico = ativo && selecionados.length === 1
          const titulo = bloqueado
            ? `Máximo de ${MAX_ANOS} anos — desmarque um para escolher o ${a}`
            : unico
              ? `${a} é o único ano selecionado`
              : ativo
                ? `Tirar o ano ${a}`
                : `Somar o ano ${a}`
          return (
            <button
              key={a}
              type="button"
              aria-pressed={ativo}
              aria-disabled={bloqueado}
              onClick={() => { if (!bloqueado) onAlternar(a) }}
              title={titulo}
              className={['foco-neutro', PILL_FILTRO, ativo ? '' : PILL_FILTRO_INATIVO, bloqueado ? 'cursor-not-allowed opacity-50' : ''].join(' ')}
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
