import type { ReactNode } from 'react'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import { fmtBRL2 } from '@/lib/fmt'
import { fmtDeltaPct } from '@/lib/marketing/formatar'
import { rotuloAnos } from '@/lib/marketing/periodo'
import { fmtCustoPct, fmtPontos, type LinhaCustoAno } from '@/lib/financeiro-geral/antecipacoes'
import type { Sentido } from '@/lib/financeiro-geral/variacao'

// Cards "Custo efetivo no ano" e "Custo percentual no ano" (v6.5.0): UMA LINHA POR ANO SELECIONADO, do mais
// recente ao mais antigo, com o valor do ano e o Δ contra o MESMO PERÍODO do ano anterior (o Δ do custo %
// é em pontos percentuais, não em %). Mesmo molde visual do card "Total de despesas no período" de
// Marketing (`TilePorAno`), escrito aqui — sem importar componente de Marketing. Sem "Acumulado": somar
// custos de anos num % único exigiria ponderar, e o módulo puro não o calcula; a UI não inventa.
//
// As contas vêm prontas de `custoPorAno` (`antecipacoes.ts`) e a fórmula do custo é uma só
// (`custoDoRecorte`): aqui só se desenha. O custo % NUNCA lê o percentual pronto que a RPC ainda devolve em `total`.
//
// ANO CORRENTE EM DESTAQUE: a linha do ano em andamento ganha fundo suave (`--surface-soft`) e o rótulo em
// tom primário; as demais ficam sem fundo e com o rótulo em tom discreto. O valor tem o mesmo tamanho em
// todas — o destaque é de posição, não de escala.
//
// Ano sem nenhuma antecipação é AUSÊNCIA: "—" (nunca "R$ 0,00" / "0,00%") e sem Δ.
// Variação: a palavra ("favorável"/"desfavorável") vai escrita ao lado e a tinta é a `-deep` (passa AA em
// corpo pequeno — skill `ui-design-system` §1.3). Custo MENOR é melhor (a polaridade já vem no `sentido`).
// `TextoVariacao` de `comum.tsx` não serve: só formata Δ% (não p.p.) e alinha à esquerda.

const CLASSE_ROTULO = 'text-2xs font-semibold uppercase leading-[1.3] tracking-[0.5px] text-[var(--text-muted)]'

const PALAVRA: Record<Sentido, { texto: string; classe: string }> = {
  favoravel: { texto: 'favorável', classe: 'text-positive-deep' },
  desfavoravel: { texto: 'desfavorável', classe: 'text-negative-deep' },
  neutro: { texto: 'estável', classe: 'text-[var(--text-muted)]' },
}

/** "−4,2% favorável · vs 2025 (jan–out)" — o Δ já formatado, com a palavra, e a referência ao lado. */
function DeltaLinha({ texto, sentido, referencia }: { texto: string; sentido: Sentido | null; referencia: string }) {
  const palavra = sentido ? PALAVRA[sentido] : null
  return (
    <p className="mt-0.5 flex flex-wrap justify-end gap-x-1.5 text-2xs text-[var(--text-subtle)]">
      <span className={`font-semibold tabular-nums ${palavra?.classe ?? 'text-[var(--text-muted)]'}`}>
        {texto}{palavra ? ` ${palavra.texto}` : ''}
      </span>
      <span>{referencia}</span>
    </p>
  )
}

interface Props {
  rotulo: string
  /** O que o número é, em uma linha, sob o rótulo ("Antecipado − líquido, em R$"). */
  escopo?: string
  /** O "?" (`GatilhoAjuda`) ao lado do rótulo. */
  ajuda?: ReactNode
  /** `efetivo` = R$ + Δ%; `pct` = % + Δ em p.p. */
  modo: 'efetivo' | 'pct'
  /** Os anos que carregaram, do mais recente ao mais antigo (de `custoPorAno`). */
  linhas: readonly LinhaCustoAno[]
  /** Anos selecionados que não carregaram — o card avisa, nomeando o ano. */
  anosFalha: readonly number[]
}

export default function AntecipacoesCardCusto({ rotulo, escopo, ajuda, modo, linhas, anosFalha }: Props) {
  const todasVazias = linhas.length > 0 && linhas.every(l => l.semAntecipacao)

  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <p className={CLASSE_ROTULO}>{rotulo}</p>
        {ajuda}
      </div>
      {escopo && <p className="mt-0.5 text-2xs text-[var(--text-subtle)]">{escopo}</p>}

      {linhas.length === 0 ? (
        <ErroCarregamento
          className="mt-3"
          mensagem={`Não foi possível carregar ${rotuloAnos(anosFalha)} — recarregue a página.`}
        />
      ) : todasVazias ? (
        <p className="mt-3 text-[13px] text-[var(--text-muted)]">
          Sem antecipações em {rotuloAnos(linhas.map(l => l.ano))}.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {linhas.map(l => {
            const valor = l.semAntecipacao
              ? '—'
              : modo === 'efetivo' ? fmtBRL2(l.custo.efetivo) : fmtCustoPct(l.custo.pct)
            const delta = modo === 'efetivo'
              ? (l.deltaEfetivo.pct === null ? null : { texto: fmtDeltaPct(l.deltaEfetivo.pct), sentido: l.deltaEfetivo.sentido })
              : (l.deltaPct.pp === null ? null : { texto: fmtPontos(l.deltaPct.pp), sentido: l.deltaPct.sentido })
            return (
              <li
                key={l.ano}
                aria-current={l.corrente ? 'true' : undefined}
                className={`-mx-3 rounded-lg px-3 py-1.5 ${l.corrente ? 'bg-[var(--surface-soft)]' : ''}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span
                    className={`text-xs font-semibold ${l.corrente ? 'text-text-primary' : 'text-[var(--text-muted)]'}`}
                    title={l.rotulo !== String(l.ano) ? `${l.ano} em andamento` : undefined}
                  >
                    {l.rotulo}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-base font-extrabold leading-none tabular-nums text-text-primary">
                    {valor}
                  </span>
                </div>
                {!l.semAntecipacao && delta && (
                  <DeltaLinha texto={delta.texto} sentido={delta.sentido} referencia={l.referencia} />
                )}
              </li>
            )
          })}
        </ul>
      )}

      {linhas.length > 0 && anosFalha.length > 0 && (
        <ErroCarregamento
          className="mt-3"
          mensagem={`Não foi possível carregar ${rotuloAnos(anosFalha)}; fora do card.`}
        />
      )}
    </div>
  )
}
