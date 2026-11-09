import type { CSSProperties } from 'react'
import { PILL_FILTRO, PILL_FILTRO_INATIVO, PILL_FILTRO_ATIVO_STYLE } from '@/components/shared/botoes'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { CENTROS_SELECIONAVEIS, ROTULO_CENTRO, ROTULO_SELETOR, type CentroSelecionavel } from '@/lib/dre-centro/centros'

// ── Seletor de centro de custo do card da DRE por centro (v6.5.1) ────────────
// Vive DENTRO do card por centro, que é separado da tabela da Empresa (decisão do Yan no
// GATE 1). Estado do card, sem ida ao servidor: todos os centros já vêm no mesmo payload.
//
// Seleção CUMULATIVA (pedido do Yan no PR #311): as pills dos centros marcam/desmarcam; com as
// quatro marcadas acende "Todos" (e clicar em "Todos" marca as quatro). Nesse estado as quatro
// ficam num cinza MAIS ESCURO que o da seleção normal — "estão todas marcadas", sem se
// confundir com "escolhi estas".

const AJUDA =
  'A mesma árvore da DRE de caixa, calculada para cada operação: os recebíveis antecipados voltam ao ' +
  'mês do vencimento e ao centro dono, e as antecipações (dinheiro, devolução e taxa) ficam com quem ' +
  'precisou do caixa. Marque um centro, alguns (somados no Total) ou Todos — Todos inclui o que ficou ' +
  'sem centro no Monde e fecha com a DRE da empresa. Só 2026: antes disso o Monde não tem ' +
  'o centro preenchido. A DRE da empresa inteira é a tabela acima.'

/** Centro marcado porque "Todos" está aceso: 30% de --brand sobre --brand-soft — um degrau mais escuro que a
 *  seleção normal (--brand-soft), mesma borda e tinta (--brand-deep ≈ 4,9:1 sobre o fundo no tema neutro). */
const PILL_MARCADA_TODOS_STYLE: CSSProperties = {
  background:  'color-mix(in srgb, var(--brand) 30%, var(--brand-soft))',
  borderColor: 'var(--brand)',
  color:       'var(--brand-deep)',
}

export default function SeletorCentro({
  selecao, onAlternar, onTodos,
}: {
  selecao: ReadonlySet<CentroSelecionavel>
  onAlternar: (c: CentroSelecionavel) => void
  onTodos: () => void
}) {
  const todos = CENTROS_SELECIONAVEIS.every(c => selecao.has(c))
  return (
    <div role="group" aria-label="Centro de custo" className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 text-xs text-text-muted">
        Centro de custo
        <GatilhoAjuda
          rotulo="Centro de custo"
          texto={AJUDA}
          classNameBalao="z-30 w-80 !whitespace-normal font-normal normal-case tracking-normal leading-snug"
        />
      </span>
      {CENTROS_SELECIONAVEIS.map(c => {
        const marcado = selecao.has(c)
        const ultimo = marcado && selecao.size === 1
        return (
          <button
            key={c}
            type="button"
            onClick={() => onAlternar(c)}
            aria-pressed={marcado}
            title={ultimo ? 'Pelo menos um centro fica marcado' : marcado ? `Desmarcar ${ROTULO_CENTRO[c]}` : `Marcar ${ROTULO_CENTRO[c]}`}
            className={['foco-neutro', PILL_FILTRO, marcado ? '' : PILL_FILTRO_INATIVO].join(' ')}
            style={marcado ? (todos ? PILL_MARCADA_TODOS_STYLE : PILL_FILTRO_ATIVO_STYLE) : undefined}
          >
            {ROTULO_CENTRO[c]}
          </button>
        )
      })}
      <span className="mx-1 h-4 w-px bg-wt-border-strong" aria-hidden />
      <button
        type="button"
        onClick={onTodos}
        aria-pressed={todos}
        title="Marcar todos os centros (inclui o que ficou sem centro no Monde)"
        className={['foco-neutro', PILL_FILTRO, todos ? '' : PILL_FILTRO_INATIVO].join(' ')}
        style={todos ? PILL_FILTRO_ATIVO_STYLE : undefined}
      >
        {ROTULO_SELETOR.lado}
      </button>
    </div>
  )
}
