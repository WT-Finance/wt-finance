import { fmtMi } from '@/lib/fmt'
import { decomporFaturamentoWeddings } from '@/lib/metas/metas-derivadas'
import type { NaoClassificado, PainelSubsetor } from '@/components/metas/tipos'

// Reconciliação da expansão de Weddings (v5.4.4) — a última linha da expansão, que
// FECHA a conta entre os cards de subsetor e o card do setor.
//
// POR QUE ELA EXISTE. Os subsetores são eixo de PRODUTO e por isso vêm do upload
// (`analytics.fato_venda_item`); o card do setor vem do MONDE (`get_executiva_kpis`).
// As duas fontes não medem o mesmo universo enquanto o Scope B não repontar o produto,
// e a diferença NÃO é estável: medida em 04/08 de manhã ela era 0,00 no mês corrente e,
// no mesmo dia à tarde, 40% — porque entraram vendas no Monde que o upload ainda não
// tinha. Deixar isso só no "?" do cabeçalho foi insuficiente: quem olha vê cinco cards
// somando 48,1 k embaixo de um card de 80,7 k e conclui, com razão, que a tela está
// errada. Aqui a diferença é NOMEADA.
//
// Some quando fecha: sem diferença material, nenhuma linha é renderizada — a ausência
// já significa "os cards somam o setor". Ela reaparece sozinha quando o upload atrasa.
//
// Quando o Scope B concluir, a parcela "defasagem entre as fontes" vai a zero por
// consequência e esta linha simplesmente para de aparecer, sem código a remover.

/** Abaixo disto é arredondamento de centavo, não divergência. */
const LIMIAR = 1

interface Props {
  /** Faturamento do card de Weddings (fonte: Monde). `null` = KPI indisponível. */
  faturamentoSetor: number | null
  /** Os 5 subsetores (fonte: upload). */
  subsetores: PainelSubsetor[]
  /** O balde fora do mapa, quando existe (também upload). */
  naoClassificado: NaoClassificado | null
}

export default function ReconciliacaoSubsetores({
  faturamentoSetor, subsetores, naoClassificado,
}: Props) {
  if (faturamentoSetor == null) return null

  // A conta vive em `metas-derivadas.ts` (módulo puro, com caso de contrato): uma
  // reconciliação que não reconcilia é pior que nenhuma.
  const { soma5, naoClassificado: nc, defasagem } = decomporFaturamentoWeddings(
    faturamentoSetor,
    subsetores.map(s => s.faturamento),
    naoClassificado?.faturamento ?? 0,
  )

  if (Math.abs(defasagem) < LIMIAR) return null

  const AJUDA =
    'Os subsetores são um recorte por PRODUTO e vêm do upload de vendas; o total de Weddings ' +
    'vem do Monde. Enquanto as duas fontes não forem a mesma, a diferença aparece aqui — em ' +
    'geral é upload pendente de atualização, não erro de cálculo. O selo "Última atualização" ' +
    'no topo da tela é do Monde, não do upload.'

  const linhas: { rotulo: string; valor: number }[] = [
    { rotulo: 'Soma dos subsetores', valor: soma5 },
    ...(nc !== 0 ? [{ rotulo: 'Não classificados', valor: nc }] : []),
    { rotulo: 'Defasagem entre as fontes', valor: defasagem },
  ]

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 px-4 py-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <h4 className="text-2xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Como isto soma
        </h4>
        <button
          type="button"
          title={AJUDA}
          aria-label={`Como isto soma: ${AJUDA}`}
          className="foco-neutro inline-flex h-4 w-4 min-h-4 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400"
        >
          ?
        </button>
      </div>

      <dl className="space-y-0.5 text-xs">
        {linhas.map(l => (
          <div key={l.rotulo} className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--text-muted)]">{l.rotulo}</dt>
            <dd className="shrink-0 tabular-nums text-[var(--text-primary)]">{fmtMi(l.valor)}</dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-3 border-t border-zinc-100 pt-1 font-medium">
          <dt className="text-[var(--text-secondary)]">Weddings</dt>
          <dd className="shrink-0 tabular-nums text-[var(--text-primary)]">{fmtMi(faturamentoSetor)}</dd>
        </div>
      </dl>
    </div>
  )
}
