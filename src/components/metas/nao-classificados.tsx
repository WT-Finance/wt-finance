'use client'

import { useCortina, Cortina, BotaoCortina } from '@/components/shared/cortina'
import { fmtMi } from '@/lib/fmt'
import type { NaoClassificado } from '@/components/metas/tipos'

// Faixa "Não Classificados" (v5.4.4) — o balde de produtos de Weddings fora do mapa
// `analytics.dim_produto_subsetor`, dentro da expansão do card de Weddings do
// Acompanhamento de Metas. Tratamento visual HERDADO de `weddings/sumario-subsetor.tsx`
// (linha NÃO_CLASSIFICADO da tabela — tom de warning, nunca vermelho: não é erro, é
// produto ainda sem classificação; texto em `text-warning-deep`/AA sobre `bg-warning-bg`
// por corpo pequeno, ver ui-design-system §1.2), só que em formato de FAIXA recolhível
// (não linha de tabela). Cortina PRÓPRIA, aninhada dentro da cortina de Weddings — cada
// nível com seu `useCortina` (v5.4.4).

interface Props {
  data: NaoClassificado
}

export default function NaoClassificados({ data }: Props) {
  const { aberta, idConteudo, alternar } = useCortina(false)
  const n = data.produtos.length

  return (
    <div className="rounded-lg bg-warning-bg px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <BotaoCortina
            aberta={aberta}
            onAlternar={alternar}
            controla={idConteudo}
            rotulo={aberta ? 'Recolher Não Classificados' : 'Ver produtos Não Classificados'}
            tamanho={13}
            className="text-warning-deep hover:text-warning-deep"
          />
          <span
            className="text-sm font-medium text-warning-deep"
            title="Produto de Weddings que não está no mapa de subsetor (analytics.dim_produto_subsetor)."
          >
            Não Classificados
          </span>
        </div>
        <span className="whitespace-nowrap text-sm tabular-nums text-warning-deep">
          {fmtMi(data.faturamento)}{n > 0 ? ` · ${n} produto${n === 1 ? '' : 's'}` : ''}
        </span>
      </div>

      {/* Conteúdo MONTADO nos dois estados (inert quando fechado) — nunca {aberta && ...}. */}
      <Cortina aberta={aberta} id={idConteudo}>
        <div className="mt-3">
          {n > 0 ? (
            <ul className="space-y-1.5">
              {data.produtos.map(p => (
                <li key={p.produto} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--text-primary)]">{p.produto}</span>
                  <span className="shrink-0 tabular-nums text-warning-deep">
                    {fmtMi(p.faturamento)} · {fmtMi(p.receita)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-warning-deep">
              Detalhe por produto indisponível para este período — total de {fmtMi(data.faturamento)} em
              faturamento e {fmtMi(data.receita)} em receita.
            </p>
          )}
        </div>
      </Cortina>
    </div>
  )
}
