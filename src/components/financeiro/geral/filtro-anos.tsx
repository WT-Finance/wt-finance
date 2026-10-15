'use client'

import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'

// Pills de ano da página "Financeiro · Geral": SELEÇÃO MÚLTIPLA e SEM teto — uma pill por ano da janela
// (`anosDasPillsGeral`), todas podem estar ligadas ao mesmo tempo. Regras da seleção (sempre ao menos um
// ano; clicar no único selecionado não faz nada) em `@/lib/marketing/anos`, reaproveitado SEM mover.
//
// Componente PRÓPRIO desta página: a DRE e o Marketing têm os seus e nenhum é compartilhado — acoplar
// qualquer um deles aqui exigiria mexer fora da página (inv. 9). O ativo usa o trio neutro `--action-soft*`
// (`PILL_PRIMARIA_STYLE`): é um controle de plataforma, sem `var(--brand)`.

interface Props {
  selecionados: readonly number[]
  anos: readonly number[]
  onAlternar: (ano: number) => void
}

export default function FiltroAnos({ selecionados, anos, onAlternar }: Props) {
  return (
    <div role="group" aria-label="Anos" className="flex flex-wrap items-center gap-2">
      {anos.map(a => {
        const ativo = selecionados.includes(a)
        const unico = ativo && selecionados.length === 1
        const titulo = unico ? `${a} é o único ano selecionado` : ativo ? `Tirar o ano ${a}` : `Somar o ano ${a}`
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
