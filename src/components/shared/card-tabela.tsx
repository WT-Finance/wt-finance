import type { ReactNode } from 'react'

// Padrão unificado de card-tabela (v4.11). Encapsula o "chrome" comum dos cards
// cuja essência é uma tabela (Próximos Casamentos, Mix por Produto, Top
// Vendedores, Vendas em Aberto, Receita Negativa):
//
//  • Título único na página (SEM subtítulo — o subtítulo vive só no drawer)
//  • `periodoLabel` (cor da aba) APENAS onde o filtro de período se aplica
//  • `headerRight` para um badge à direita (ex.: contagem) — alternativa ao período
//  • Rodapé "Ver mais" neutro em repouso, cor da aba no hover (.card-tabela-vermais),
//    com divisória acima; ou um espaçador quando não há mais itens
//
// O corpo da tabela fica a cargo de cada card (colunas/células divergem), mas
// deve usar `table-fixed` + `<colgroup>` e o cabeçalho `CARD_TABELA_TH`
// (caixa normal, ~11px, cor terciária, alinhado conforme a coluna).

interface Props {
  /** Título único do card (página). */
  titulo: string
  /** "no período selecionado" (cor da aba) — só em cards que respeitam o filtro de período. */
  periodoLabel?: string
  /** Conteúdo à direita do título (ex.: badge de contagem). Use OU periodoLabel OU headerRight. */
  headerRight?: ReactNode
  /** Há mais itens além dos visíveis? Habilita o "Ver mais". */
  temMais?: boolean
  /** Abre o drawer com a lista completa. */
  onVerMais?: () => void
  /** Classes extras no container (ex.: h-full para grids de altura igual). */
  className?: string
  /** A `<table>` da visão de página. */
  children: ReactNode
}

/** Cabeçalho de coluna padrão: caixa normal, ~11px, cor terciária. Some `text-left`/`text-right`. */
export const CARD_TABELA_TH = 'py-2 px-3 text-2xs font-medium text-[var(--text-muted)] whitespace-nowrap'

export default function CardTabela({
  titulo, periodoLabel, headerRight, temMais, onVerMais, className, children,
}: Props) {
  return (
    <div className={`bg-white rounded-xl shadow-sm px-5 py-4 min-w-0 overflow-hidden flex flex-col ${className ?? ''}`}>
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h2 className="text-base font-semibold text-[var(--text-primary)] leading-snug truncate">{titulo}</h2>
          {periodoLabel && (
            <span className="text-xs shrink-0" style={{ color: 'var(--brand)' }}>{periodoLabel}</span>
          )}
        </div>
        {headerRight && <div className="shrink-0">{headerRight}</div>}
      </div>

      <div className="flex-1 min-h-0">
        {children}
      </div>

      <div className="mt-3 border-t border-zinc-100">
        {temMais && onVerMais ? (
          <button
            onClick={onVerMais}
            className="card-tabela-vermais w-full text-xs py-1.5 font-medium"
          >
            Ver mais
          </button>
        ) : (
          <div className="py-1.5" />
        )}
      </div>
    </div>
  )
}
