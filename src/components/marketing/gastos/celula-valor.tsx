import { ValorContabil } from '@/components/shared/valor-contabil'

/** Valor de uma célula das tabelas da página: `<ValorContabil>` no sinal da DRE; `null` = "—"
 *  (ausência — distinta de "R$ 0,00", que é lançamento que somou zero). */
export default function CelulaValor({ v }: { v: number | null }) {
  return v === null
    ? <span className="block text-right text-[var(--text-subtle)]">—</span>
    : <ValorContabil valor={v} />
}
