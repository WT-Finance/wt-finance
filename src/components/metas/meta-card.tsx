import { Card } from '@/components/ui/card'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import { fmtMi } from '@/lib/fmt'
import type { PainelSetor } from '@/components/metas/tipos'

// Card de UM painel (Group ou setor) do Acompanhamento de Metas (v5.0.0).
// Elemento central = <MetaProgressBar>. Título e VALOR do faturamento na cor de
// identidade do painel (setor = marca; Group = cinza da marca). "X% da meta" e
// "Y% esperado" recebem a MESMA cor, pela distância entre eles (verde se meta ≥
// esperado; âmbar até 3 p.p. abaixo; vermelho mais que isso). Margem = delta em
// p.p. contra o alvo de %Rec.

const fmtNum1 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtPct1 = (v: number) => `${fmtNum1(v)}%`
const fmtMiOuTraco = (v: number | null): string => (v == null ? '—' : fmtMi(v))
const pctRound = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)

/** Cor COMUM de "% da meta" e "% esperado", pela distância (p.p.) entre elas:
 *  meta ≥ esperado → verde; até 3 p.p. abaixo → âmbar; mais que 3 p.p. abaixo → vermelho. */
function corComparacao(pctMeta: number | null, pctEsperado: number | null): string {
  if (pctMeta == null || pctEsperado == null) return 'text-[var(--text-muted)]'
  const diff = pctMeta - pctEsperado
  if (diff >= 0) return 'text-success'
  if (diff >= -3) return 'text-warning'
  return 'text-danger'
}

/** "13,9% −0,1 p.p. vs alvo 14%" — margem + delta p.p. contra o alvo (colorido) + alvo
 *  (sem casas, peso normal). `corValor` pinta TAMBÉM o valor (verde ≥ alvo, vermelho abaixo).
 *  Sem alvo cadastrado → só a margem. */
function Margem({ margemPct, alvo, corValor }: { margemPct: number | null; alvo: number | null; corValor?: boolean }) {
  if (margemPct == null) return <span className="text-[var(--text-primary)]">—</span>
  if (alvo == null) {
    return <span className="tabular-nums text-[var(--text-primary)]">{fmtPct1(margemPct)}</span>
  }
  const delta = margemPct - alvo
  const cor = delta >= 0 ? 'text-success' : 'text-danger'
  const sinal = delta >= 0 ? '+' : '−'
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={corValor ? cor : 'text-[var(--text-primary)]'}>{fmtPct1(margemPct)}</span>{' '}
      <span className={`text-xs font-medium ${cor}`}>{sinal}{fmtNum1(Math.abs(delta))} p.p.</span>{' '}
      <span className="text-xs font-normal text-[var(--text-muted)]">vs alvo {Math.round(alvo)}%</span>
    </span>
  )
}

/** "X% da meta" — número na cor da comparação. Tamanho ÚNICO (text-xl) no Group e nos
 *  setores: entre o faturamento (3xl/2xl) e o esperado (sm), gerando a hierarquia. */
function PctDaMeta({ pctMeta, corNum }: { pctMeta: number | null; corNum: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className={`text-xl font-bold tabular-nums ${corNum}`}>{pctRound(pctMeta)}</span>{' '}
      <span className="text-sm text-[var(--text-muted)]">da meta</span>
    </span>
  )
}

/** "Y% esperado" — referência; o número na MESMA cor da comparação. */
function PctEsperado({ pct, corNum }: { pct: number | null; corNum: string }) {
  return (
    <span className="whitespace-nowrap text-sm">
      <span className={`font-medium tabular-nums ${corNum}`}>{pctRound(pct)}</span>{' '}
      <span className="text-[var(--text-muted)]">esperado</span>
    </span>
  )
}

function Klabel({ children }: { children: string }) {
  return <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{children}</p>
}

interface Props {
  painel:  PainelSetor
  tamanho: 'grande' | 'setor'
}

export default function MetaCard({ painel, tamanho }: Props) {
  const { key, display, cor, faturamento, receita, margemPct, contratos, ritmo } = painel

  // Esperado como % da meta = fração do período decorrida (esperado é linear).
  const pctEsperado = ritmo.metaPeriodo > 0 ? (ritmo.esperadoAteHoje / ritmo.metaPeriodo) * 100 : null
  const corNum = corComparacao(ritmo.pctMeta, pctEsperado)
  const ariaLabel =
    `${display}: ${pctRound(ritmo.pctMeta)} da meta; esperado ${pctRound(pctEsperado)} do período`

  const barra = (altura: number) => (
    <MetaProgressBar
      pctMeta={ritmo.pctMeta}
      pctEsperado={pctEsperado ?? 0}
      cor={cor}
      altura={altura}
      pctDecorrido={ritmo.pctDecorrido}
      esperado={ritmo.esperadoAteHoje}
      realizado={ritmo.realizado}
    />
  )

  if (tamanho === 'grande') {
    return (
      <Card className="px-6 py-5">
        <p className="mb-3 text-[15px] font-semibold" style={{ color: cor }}>{display}</p>

        {/* Duas linhas PAREADAS: faturamento ↔ "% da meta"; Meta ↔ "% esperado". */}
        <div className="mb-2">
          <div className="flex items-baseline justify-between gap-6">
            <p className="text-3xl font-bold tabular-nums" style={{ color: cor }} aria-label={ariaLabel}>{fmtMiOuTraco(faturamento)}</p>
            <PctDaMeta pctMeta={ritmo.pctMeta} corNum={corNum} />
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-6">
            <p className="text-sm text-[var(--text-muted)]">Meta: <span className="tabular-nums">{fmtMi(ritmo.metaPeriodo)}</span></p>
            <PctEsperado pct={pctEsperado} corNum={corNum} />
          </div>
        </div>

        {barra(12)}

        <div className="mt-4 grid grid-cols-2 divide-x divide-zinc-100 border-t border-zinc-100 pt-4">
          <div className="pr-5">
            <Klabel>Receita</Klabel>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--text-primary)]">{fmtMiOuTraco(receita)}</p>
          </div>
          <div className="pl-5">
            <Klabel>Margem</Klabel>
            <p className="mt-1 text-xl font-bold"><Margem margemPct={margemPct} alvo={ritmo.pctReceitaAlvo} corValor /></p>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="flex h-full flex-col px-5 py-4">
      <p className="text-[15px] font-semibold" style={{ color: cor }}>{display}</p>

      {/* Duas linhas PAREADAS: faturamento (cor do setor) ↔ "% da meta"; Meta ↔ "% esperado". */}
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <span className="text-2xl font-bold tabular-nums" style={{ color: cor }} aria-label={ariaLabel}>{fmtMiOuTraco(faturamento)}</span>
        <PctDaMeta pctMeta={ritmo.pctMeta} corNum={corNum} />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">Meta: <span className="tabular-nums">{fmtMi(ritmo.metaPeriodo)}</span></p>
        <PctEsperado pct={pctEsperado} corNum={corNum} />
      </div>

      <div className="mt-3">{barra(10)}</div>

      {/* Métrica e Margem em DUAS LINHAS empilhadas (rótulo à esquerda, valor à direita —
          molde dos subcards de subsetor). Em Weddings a 1ª linha é "Contratos" (nº de contratos
          de casamento vendidos); nos demais é "Receita". Valor da margem colorido (verde ≥ alvo,
          vermelho abaixo). */}
      <div className="mt-auto border-t border-zinc-100 pt-2">
        <div className="flex items-baseline justify-between py-1 text-[13px]">
          <span className="text-[var(--text-muted)]">{key === 'Weddings' ? 'Contratos' : 'Receita'}</span>
          <span className="font-medium tabular-nums text-[var(--text-primary)]">
            {key === 'Weddings'
              ? (contratos == null ? '—' : contratos.toLocaleString('pt-BR'))
              : fmtMiOuTraco(receita)}
          </span>
        </div>
        <div className="flex items-baseline justify-between py-1 text-[13px]">
          <span className="text-[var(--text-muted)]">Margem</span>
          <Margem margemPct={margemPct} alvo={ritmo.pctReceitaAlvo} corValor />
        </div>
      </div>
    </Card>
  )
}
