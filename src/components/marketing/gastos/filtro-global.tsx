'use client'

import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { Select } from '@/components/ui/field'
import { MESES_ABREV, ajustarRecorte, type Recorte } from '@/lib/marketing/periodo'

// Filtro GLOBAL da página: pills de ano + intervalo de meses ("de … até …"). O recorte vale
// para TODOS os cards (A–F) e cada card o declara no próprio subtítulo.
//
// Pills de ano montadas aqui com `PILL_FILTRO*` — NÃO se importa `AnoPills` da DRE (a DRE não
// pode ser acoplada a esta página). O ativo usa o trio neutro `--action-soft*`
// (`PILL_PRIMARIA_STYLE`), o mesmo visual de `PILL_FILTRO_ATIVO_STYLE` no tema "group", sem
// tocar em `var(--brand)` num controle de plataforma.
//
// O intervalo é um par de selects, não o `SeletorMeses` de Metas: aquele é um range ENTRE anos
// (piso de 2024, teto de 12 meses, rótulos de "comparação") e exige popover em portal com
// posição calculada pelo chamador. Aqui o ano já vem das pills, então o intervalo é só jan–dez
// DENTRO dele — dois selects nativos bastam, funcionam por teclado e em tela estreita.

interface Props {
  ano: number
  anos: readonly number[]
  recorte: Recorte
  /** Último mês alcançado do ano (meses futuros não são oferecidos). */
  limiteMes: number
  onAno: (ano: number) => void
  onRecorte: (r: Recorte) => void
}

export default function FiltroGlobal({ ano, anos, recorte, limiteMes, onAno, onRecorte }: Props) {
  const meses = MESES_ABREV.slice(0, limiteMes)
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

      <div role="group" aria-label="Intervalo de meses" className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
        <label htmlFor="gastos-mes-ini">De</label>
        <Select
          id="gastos-mes-ini"
          variant="compacto"
          value={recorte.mesIni}
          onChange={e => onRecorte(ajustarRecorte(recorte, { mesIni: Number(e.target.value) }, limiteMes))}
        >
          {meses.map((nome, i) => <option key={nome} value={i + 1}>{nome}</option>)}
        </Select>
        <label htmlFor="gastos-mes-fim">até</label>
        <Select
          id="gastos-mes-fim"
          variant="compacto"
          value={recorte.mesFim}
          onChange={e => onRecorte(ajustarRecorte(recorte, { mesFim: Number(e.target.value) }, limiteMes))}
        >
          {meses.map((nome, i) => <option key={nome} value={i + 1}>{nome}</option>)}
        </Select>
      </div>
    </div>
  )
}
