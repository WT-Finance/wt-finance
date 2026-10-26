import type { ReactNode } from 'react'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import Badge from '@/components/ui/badge'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { fmtDeltaPct } from '@/lib/marketing/formatar'
import type { Sentido, Variacao } from '@/lib/financeiro-geral/variacao'

// Peças comuns da página "Financeiro · Geral" (v6.4.0): o tile de indicador, o texto de variação, a
// linha de metadados de cada seção (regime · data · "?") e as classes das tabelas. Uma fonte só — as
// cinco seções e a faixa do topo têm de parecer a mesma página (a causa-raiz histórica de divergência
// é cada tela reinventar o seu).

// ── Tabelas (cartão-tabela: cabeçalho em caixa normal, tom terciário — skill `tabela-densa`) ───────
export const TH_ESQ = `${CARD_TABELA_TH} text-left border-b border-zinc-100`
export const TH_DIR = `${CARD_TABELA_TH} text-right border-b border-zinc-100`
export const TD = 'px-3 py-2 text-xs border-b border-zinc-50 text-zinc-700'
export const TD_NUM = `${TD} tabular-nums text-right`
export const TD_TOTAL = 'px-3 py-2 text-xs font-semibold text-zinc-800 border-t border-zinc-200 bg-band-soft'

// ── Variação ───────────────────────────────────────────────────────────────────────────────────

const PALAVRA: Record<Sentido, { texto: string; classe: string }> = {
  favoravel: { texto: 'favorável', classe: 'text-positive-deep' },
  desfavoravel: { texto: 'desfavorável', classe: 'text-negative-deep' },
  neutro: { texto: 'estável', classe: 'text-[var(--text-muted)]' },
}

/** "−50,0% desfavorável · vs 2025 (jan–out)". A palavra vai escrita ao lado (a cor nunca vai sozinha) e a
 *  tinta é a `-deep` (passa AA em corpo pequeno — skill `ui-design-system` §1.3). Sem juízo: só o número. */
function TextoVariacao({ variacao, referencia }: { variacao: Variacao; referencia?: string | null }) {
  const palavra = variacao.sentido ? PALAVRA[variacao.sentido] : null
  return (
    <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-2xs text-[var(--text-subtle)]">
      <span className={`font-semibold tabular-nums ${palavra?.classe ?? 'text-[var(--text-muted)]'}`}>
        {fmtDeltaPct(variacao.pct)}{palavra ? ` ${palavra.texto}` : ''}
      </span>
      {referencia && <span>{referencia}</span>}
    </p>
  )
}

// ── Tile ───────────────────────────────────────────────────────────────────────────────────────

const CLASSE_ROTULO = 'text-2xs font-semibold uppercase leading-[1.3] tracking-[0.5px] text-[var(--text-muted)]'

interface TileProps {
  rotulo: string
  /** Texto principal já formatado; `null` em `vazio`/`erro`. */
  valor: string | null
  /** O recorte do número ("na carga de 15/10", "2026*"). */
  escopo?: string | null
  /** Linhas de contexto. */
  apoio?: readonly string[]
  variacao?: Variacao | null
  referencia?: string | null
  estado?: 'ok' | 'vazio' | 'erro'
  /** Explicação de `vazio`/`erro`. */
  mensagem?: string | null
}

/** Tile local (no molde dos tiles do Marketing), e não `KpiCard`: o `KpiCard` pertence ao domínio de
 *  Performance e desenha seta ↑/↓, que numa despesa (negativa, no sinal da DRE) reforçaria a leitura errada. */
export function Tile({ rotulo, valor, escopo, apoio = [], variacao, referencia, estado = 'ok', mensagem }: TileProps) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl bg-white px-5 py-4 shadow-sm">
      <p className={CLASSE_ROTULO}>{rotulo}</p>
      {escopo && <p className="mt-0.5 text-2xs text-[var(--text-subtle)]">{escopo}</p>}

      {estado === 'erro' && (
        <ErroCarregamento className="mt-3" mensagem={mensagem ?? 'Não foi possível carregar — recarregue a página.'} />
      )}
      {estado === 'vazio' && (
        <p className="mt-3 text-[13px] text-[var(--text-muted)]">{mensagem ?? 'Sem dado ainda.'}</p>
      )}
      {estado === 'ok' && (
        <>
          <p
            className="mt-2 min-w-0 truncate whitespace-nowrap text-lg font-extrabold leading-none tabular-nums text-text-primary"
            title={valor ?? undefined}
          >
            {valor ?? '—'}
          </p>
          {variacao && <TextoVariacao variacao={variacao} referencia={referencia} />}
          {apoio.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-[var(--text-muted)]">
              {apoio.map(linha => <li key={linha}>{linha}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// ── Metadados da seção ─────────────────────────────────────────────────────────────────────────

interface MetaProps {
  /** "estoque" (posição numa data) ou "fluxo" (período). */
  regime: 'estoque' | 'fluxo'
  /** O recorte desta seção, por extenso ("posição na carga de 15/10", "2025 + 2026*"). */
  recorte: string
  /** A data própria da seção ("Carga gravada em 15/10/2026"); `null` = nenhuma fonte carregou. */
  carimbo: string | null
  ajudaRotulo: string
  ajudaTexto: string
  /** Ação da seção (ex.: "Registrar antecipação"), à direita. */
  acao?: ReactNode
}

/** A linha que abre cada seção: etiqueta do regime, recorte, data própria e o "?" com a definição.
 *  O "?" abre o balão para BAIXO, dentro da cortina — a seção sempre tem conteúdo abaixo desta linha. */
export function MetaSecao({ regime, recorte, carimbo, ajudaRotulo, ajudaTexto, acao }: MetaProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Badge variant="neutro">{regime}</Badge>
      <span className="text-xs text-[var(--text-muted)]">{recorte}</span>
      {carimbo && <span className="text-xs text-[var(--text-subtle)]">· {carimbo}</span>}
      <GatilhoAjuda rotulo={ajudaRotulo} texto={ajudaTexto} />
      {acao && <div className="ml-auto">{acao}</div>}
    </div>
  )
}

/** Casca branca para o estado de erro/vazio de uma seção inteira. Altura mínima: o balão do "?" abre
 *  para baixo dentro da cortina (que corta o que passa dela) e precisa de espaço mesmo sem dado. */
export function CascaEstado({ children }: { children: ReactNode }) {
  return <div className="min-h-[260px] rounded-xl bg-white px-5 py-4 shadow-sm">{children}</div>
}
