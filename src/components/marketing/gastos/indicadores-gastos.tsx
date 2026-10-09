import type { ReactNode } from 'react'
import { WalletMinimal } from 'lucide-react'
import EmptyState from '@/components/shared/empty-state'
import ErroCarregamento from '@/components/shared/erro-carregamento'
import GatilhoAjuda from '@/components/ui/gatilho-ajuda'
import { fmtBRL2 } from '@/lib/fmt'
import { fmtDeltaPct } from '@/lib/marketing/formatar'
import type { Indicadores } from '@/lib/marketing/indicadores'
import { MESES_ABREV, rotuloRecorteAno, type Recorte } from '@/lib/marketing/periodo'

// Componente B — três indicadores: despesa no período, o MESMO período do ano anterior (com o Δ%)
// e o mês corrente.
//
// Tile local, no molde do `Tile` do inventário, e não `KpiCard`: o `KpiCard` exige `KpiMetrica`
// do domínio de Performance e desenha seta ↑/↓ — que aqui reforçaria a leitura errada (ver a
// convenção do Δ no cabeçalho de `@/lib/marketing/indicadores`).
//
// Valores com 2 casas (`fmtBRL2`), não abreviados: a página existe para bater ao centavo com
// a linha de Marketing da DRE, e "R$ -85,3 k" esconderia exatamente a diferença que se procura.

const plural = (n: number) => `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`

const AJUDA_DELTA =
  'Variação calculada como na DRE: sobre valores COM SINAL (despesa é negativa), com o módulo da ' +
  'base no denominador. Despesa MAIOR que a do ano anterior dá variação NEGATIVA — desfavorável; ' +
  'despesa menor dá variação positiva — favorável. É o mesmo Δ% que a DRE mostra para a linha ' +
  'Marketing nos mesmos meses.'

function Tile({ rotulo, valor, children }: {
  rotulo: string
  valor: string
  children?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col rounded-xl bg-white px-5 py-4 shadow-sm">
      <div className="flex min-h-8 items-start gap-1.5">
        <p className="text-2xs font-semibold uppercase leading-[1.3] tracking-[0.5px] text-[var(--text-muted)]">
          {rotulo}
        </p>
      </div>
      <p
        className="mt-auto whitespace-nowrap pt-1 font-extrabold leading-none tabular-nums text-zinc-800"
        style={{ fontSize: 'clamp(16px, 1.7vw, 26px)' }}
      >
        {valor}
      </p>
      <div className="mt-1.5 min-h-8 space-y-0.5 text-2xs text-[var(--text-subtle)]">{children}</div>
    </div>
  )
}

function LinhaDelta({ ind, ano }: { ind: Indicadores; ano: number }) {
  if (ind.deltaPct === null || ind.sentido === null) {
    return <p>Sem base de comparação em {ano - 1}.</p>
  }
  const cor =
    ind.sentido === 'favoravel' ? 'text-success'
    : ind.sentido === 'desfavoravel' ? 'text-danger'
    : 'text-[var(--text-muted)]'
  const palavra =
    ind.sentido === 'favoravel' ? 'favorável'
    : ind.sentido === 'desfavoravel' ? 'desfavorável'
    : 'estável'
  return (
    <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
      <span className="inline-flex items-center gap-x-1.5">
        <span className={`font-semibold tabular-nums ${cor}`}>{fmtDeltaPct(ind.deltaPct)}</span>
        <span className={cor}>{palavra}</span>
        <span className="text-[var(--text-subtle)]">vs {ano - 1}</span>
      </span>
      <GatilhoAjuda rotulo="Variação" texto={AJUDA_DELTA} />
    </p>
  )
}

interface Props {
  ano: number
  recorte: Recorte
  /** `null` = o resumo do ano selecionado não carregou. */
  ind: Indicadores | null
  /** O resumo do ano ANTERIOR falhou (o resto dos indicadores segue). */
  anteriorFalhou: boolean
}

export default function IndicadoresGastos({ ano, recorte, ind, anteriorFalhou }: Props) {
  if (ind === null) {
    return <ErroCarregamento mensagem="Não foi possível carregar os indicadores — recarregue a página." />
  }
  if (ind.periodo.qtd === 0) {
    return (
      <div className="rounded-xl bg-white shadow-sm">
        <EmptyState icon={WalletMinimal} message={`Sem lançamentos pagos em ${rotuloRecorteAno(recorte, ano)}.`} />
      </div>
    )
  }

  const { mesRef } = ind
  const rotuloMes = `${MESES_ABREV[mesRef.mes - 1]}/${String(ano).slice(2)}`

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Tile rotulo={`Despesa no período · ${rotuloRecorteAno(recorte, ano)}`} valor={fmtBRL2(ind.periodo.valor)}>
        {anteriorFalhou && !ind.anteriorSemHistorico
          ? <p>Variação indisponível.</p>
          : <LinhaDelta ind={ind} ano={ano} />}
        <p>{plural(ind.periodo.qtd)}</p>
      </Tile>

      {/* Ano anterior sem histórico na base: "—" (ausência de dado), nunca "R$ 0,00 · 0 lançamentos". */}
      <Tile
        rotulo={`Mesmo período de ${ano - 1} · ${rotuloRecorteAno(recorte, ano - 1)}`}
        valor={ind.anoAnterior ? fmtBRL2(ind.anoAnterior.valor) : '—'}
      >
        {ind.anoAnterior
          ? <p>{plural(ind.anoAnterior.qtd)}</p>
          : ind.anteriorSemHistorico
            ? <p>Sem dados em {ano - 1}</p>
            : <ErroCarregamento mensagem={`Não foi possível carregar ${ano - 1}.`} />}
      </Tile>

      <Tile
        rotulo={mesRef.corrente ? `Mês corrente · ${rotuloMes}` : `Último mês do período · ${rotuloMes}`}
        valor={fmtBRL2(mesRef.valor)}
      >
        <p>{plural(mesRef.qtd)}</p>
      </Tile>
    </div>
  )
}
