'use client'

import { useId } from 'react'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { MAX_ANOS, anoBloqueado } from '@/lib/marketing/anos'

// Filtro GLOBAL da página: só as pills de ano, de SELEÇÃO MÚLTIPLA (1 a `MAX_ANOS`). Não há seleção
// de meses — o recorte é derivado de cada ano (`recortePadrao`: jan–dez em ano fechado, jan até o
// mês corrente no ano em curso) e o período é a união dos anos selecionados, declarada no subtítulo
// de cada card.
//
// Comportamento (regras em `@/lib/marketing/anos`): sempre ao menos um ano — clicar no único
// selecionado não faz nada; com o teto atingido, as pills não selecionadas ficam bloqueadas.
//
// Bloqueio ACESSÍVEL (receita da skill `web-design-guidelines`): `aria-disabled`, não `disabled` —
// a pill continua no tab-order. O MOTIVO não pode depender de hover (`title` só é percebido com
// mouse e NÃO é alcançável por teclado): vai num `<span class="sr-only">` irmão da pill, ligado por
// `aria-describedby` (fora do botão, para não virar parte do nome acessível), e há um hint VISÍVEL
// curto ("máx. 3 anos") ao lado do grupo enquanto o teto estiver atingido. A pill bloqueada não
// recebe o estilo de hover de clicável (`PILL_FILTRO_INATIVO` traz `hover:`), só `cursor-not-allowed`.
// O `title` fica como reforço para mouse nas demais pills.
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

/** Pill bloqueada: o inativo SEM o hover de clicável. */
const PILL_BLOQUEADA = 'border-zinc-200 text-zinc-500 cursor-not-allowed opacity-50'

export default function FiltroGlobal({ selecionados, anos, onAlternar }: Props) {
  const idBase = useId()
  const tetoAtingido = selecionados.length >= MAX_ANOS

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div role="group" aria-label="Anos" className="flex flex-wrap items-center gap-2">
        {anos.map(a => {
          const ativo = selecionados.includes(a)
          const bloqueado = anoBloqueado(selecionados, a)
          const unico = ativo && selecionados.length === 1
          const idMotivo = `${idBase}-motivo-${a}`
          const motivoBloqueio = `Máximo de ${MAX_ANOS} anos — desmarque um para escolher o ${a}`
          const titulo = bloqueado
            ? motivoBloqueio
            : unico
              ? `${a} é o único ano selecionado`
              : ativo
                ? `Tirar o ano ${a}`
                : `Somar o ano ${a}`
          const classe = bloqueado ? PILL_BLOQUEADA : ativo ? '' : PILL_FILTRO_INATIVO
          return (
            <span key={a} className="inline-flex">
              <button
                type="button"
                aria-pressed={ativo}
                aria-disabled={bloqueado}
                aria-describedby={bloqueado ? idMotivo : undefined}
                onClick={() => { if (!bloqueado) onAlternar(a) }}
                title={titulo}
                className={`foco-neutro ${PILL_FILTRO} ${classe}`}
                style={ativo ? PILL_PRIMARIA_STYLE : undefined}
              >
                {a}
              </button>
              {bloqueado && <span id={idMotivo} className="sr-only">{motivoBloqueio}</span>}
            </span>
          )
        })}
      </div>

      {tetoAtingido && (
        <span className="text-xs text-[var(--text-muted)]">máx. {MAX_ANOS} anos</span>
      )}
    </div>
  )
}
