'use client'

import { Card } from '@/components/ui/card'
import { useCortina, Cortina, BotaoCortina } from '@/components/shared/cortina'
import { fmtMi } from '@/lib/fmt'
import type { NaoClassificado } from '@/components/metas/tipos'

// 6º card "Não Classificados" (v5.4.4) — o balde de produtos de Weddings que estão FORA
// do mapa `analytics.dim_produto_subsetor`, logo abaixo dos 5 cards de subsetor, dentro
// da expansão do card de Weddings.
//
// É um CARD, irmão dos outros cinco (mesmo `<Card>`, mesmo ritmo de rótulo → valor →
// linhas de baixo), e não uma faixa colorida: ele participa da mesma leitura, porque é
// literalmente a parcela que falta para os 5 fecharem com o card de Weddings. Ganha o
// tom de warning apenas no RÓTULO e nos VALORES (`text-warning-deep`, que passa AA em
// corpo pequeno sobre superfície clara — ui-design-system §1.2); nunca vermelho, porque
// não é erro: é produto ainda sem classificação.
//
// **Não tem meta, e o card diz isso.** Não se cadastra meta para "não classificado", então
// aqui não há "% da meta", "% esperado" nem barra — inventar um denominador seria pior que
// a ausência. O que ele mostra é o tamanho do resíduo e, na cortina, de onde ele vem.
//
// Cortina PRÓPRIA, aninhada dentro da de Weddings — cada nível com seu `useCortina`.

interface Props {
  data: NaoClassificado
}

export default function NaoClassificados({ data }: Props) {
  const { aberta, idConteudo, alternar } = useCortina(false)
  const n = data.produtos.length

  const AJUDA =
    'Produtos de Weddings que não estão no mapa de subsetor. Entram no total do setor, ' +
    'mas não pertencem a nenhum dos 5 baldes — por isso a soma dos cards acima não fecha ' +
    'com o card de Weddings. Não se cadastra meta para eles.'

  return (
    <Card className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <p
            className="text-sm font-semibold text-warning-deep"
            title={AJUDA}
          >
            Não Classificados
          </p>
          <BotaoCortina
            aberta={aberta}
            onAlternar={alternar}
            controla={idConteudo}
            rotulo={aberta ? 'Recolher a lista de produtos não classificados' : 'Ver a lista de produtos não classificados'}
            tamanho={14}
            className="text-warning-deep hover:text-warning-deep"
          />
        </div>
        <span className="whitespace-nowrap text-2xs text-[var(--text-muted)]">
          {n > 0 ? `${n} produto${n === 1 ? '' : 's'}` : 'sem detalhe por produto'}
        </span>
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tabular-nums text-warning-deep">
          {fmtMi(data.faturamento)}
        </span>
        <span className="text-2xs text-[var(--text-muted)]">sem meta</span>
      </div>

      <div className="mt-2 space-y-1 border-t border-zinc-100 pt-2 text-[13px]">
        <div className="flex items-baseline justify-between">
          <span className="text-[var(--text-muted)]">Receita</span>
          <span className="font-medium tabular-nums text-warning-deep">{fmtMi(data.receita)}</span>
        </div>
      </div>

      {/* Conteúdo MONTADO nos dois estados (inert quando fechado) — nunca {aberta && ...}. */}
      <Cortina aberta={aberta} id={idConteudo} className="pt-2">
        <div className="border-t border-zinc-100 pt-2">
          {n > 0 ? (
            <>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-2xs text-[var(--text-muted)]">
                <span>Produto</span>
                <span className="shrink-0">Faturamento · Receita</span>
              </div>
              <ul className="space-y-1.5">
                {data.produtos.map(p => (
                  <li key={p.produto} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-[var(--text-primary)]" title={p.produto}>{p.produto}</span>
                    <span className="shrink-0 tabular-nums text-warning-deep">
                      {fmtMi(p.faturamento)} · {fmtMi(p.receita)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              O detalhe por produto não está disponível para este período.
            </p>
          )}
        </div>
      </Cortina>
    </Card>
  )
}
