import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import Tooltip from '@/components/ui/tooltip'
import ErroCarregamento from '@/components/shared/erro-carregamento'
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
  /** Alerta opcional ao lado do rótulo: ícone "!" âmbar com o texto num balão (hover/foco/toque). */
  alerta?: { rotulo: string; texto: string } | null
}

/** Ícone de aviso em âmbar (token `--warning*`) com balão — mesmo padrão de acessibilidade do
 *  `GatilhoAjuda` (botão com rótulo, balão por hover e foco), mas com outro ícone e cor. */
function AlertaDoTile({ rotulo, texto }: { rotulo: string; texto: string }) {
  return (
    <Tooltip conteudo={texto} className="z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
      <button
        type="button"
        aria-label={`${rotulo}: ${texto}`}
        className="foco-neutro inline-flex h-4 w-4 items-center justify-center rounded-full text-warning-deep"
      >
        <TriangleAlert size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  )
}

/** Tile local (no molde dos tiles do Marketing), e não `KpiCard`: o `KpiCard` pertence ao domínio de
 *  Performance e desenha seta ↑/↓, que numa despesa (negativa, no sinal da DRE) reforçaria a leitura errada. */
export function Tile({ rotulo, valor, escopo, apoio = [], variacao, referencia, estado = 'ok', mensagem, alerta }: TileProps) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl bg-white px-5 py-4 shadow-sm">
      {alerta ? (
        <div className="flex items-center gap-1.5">
          <p className={CLASSE_ROTULO}>{rotulo}</p>
          <AlertaDoTile {...alerta} />
        </div>
      ) : (
        <p className={CLASSE_ROTULO}>{rotulo}</p>
      )}
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
            className="mt-2 min-w-0 break-words text-lg font-extrabold leading-none tabular-nums text-text-primary"
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

// (v6.5.0: a linha de metadados das seções — `MetaSecao` — saiu, por decisão do Yan. A data de atualização
// de cada base fica só no topo da página, uma linha por fonte; o "?" de cada seção foi para o "?" dos cards.)

/** Casca branca para o estado de erro/vazio de uma seção inteira. Altura mínima: o balão do "?" abre
 *  para baixo dentro da cortina (que corta o que passa dela) e precisa de espaço mesmo sem dado. */
export function CascaEstado({ children }: { children: ReactNode }) {
  return <div className="min-h-[260px] rounded-xl bg-white px-5 py-4 shadow-sm">{children}</div>
}
