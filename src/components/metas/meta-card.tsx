import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import { fmtMi } from '@/lib/fmt'
import { corComparacao } from '@/lib/metas/cor-comparacao'
import {
  Margem, PctDaMeta, PctEsperado, fmtMiOuTraco, pctEsperadoDe, pctRound,
} from '@/components/metas/pecas-meta'
import type { PainelSetor } from '@/components/metas/tipos'

// Card de UM painel (Group ou setor) do Acompanhamento de Metas (v5.0.0).
// Elemento central = <MetaProgressBar>. Título e VALOR do faturamento na cor de
// identidade do painel (setor = marca; Group = cinza da marca). "X% da meta" e
// "Y% esperado" recebem a MESMA cor, pela distância entre eles (verde se meta ≥
// esperado; âmbar até 3 p.p. abaixo; vermelho mais que isso). Margem = delta em
// p.p. contra o alvo de %Rec.

// As três leituras ("% da meta", "% esperado", Margem) e os formatadores moram em
// `pecas-meta.tsx` desde a v5.4.4 — o card de SUBSETOR usa as MESMAS, em escala menor,
// e duas cópias idênticas que precisam permanecer idênticas foi o que custou caro na
// DRE (v5.4.1). A escala default (`normal`) reproduz exatamente o que estava aqui.

function Klabel({ children }: { children: string }) {
  return <p className="text-[13px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{children}</p>
}

interface Props {
  painel:  PainelSetor
  tamanho: 'grande' | 'setor'
  /** Ação renderizada no cabeçalho, à direita do rótulo — ex.: o <BotaoCortina> dos
   *  subsetores no card de Weddings (v5.4.4). Opcional; ausente não muda nada. */
  acaoCabecalho?: ReactNode
}

export default function MetaCard({ painel, tamanho, acaoCabecalho }: Props) {
  const { key, display, cor, faturamento, receita, margemPct, contratos, ritmo } = painel

  // Esperado como % da meta = fração do período decorrida (esperado é linear).
  const pctEsperado = pctEsperadoDe(ritmo)
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
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold" style={{ color: cor }}>{display}</p>
          {acaoCabecalho}
        </div>

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
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold" style={{ color: cor }}>{display}</p>
        {acaoCabecalho}
      </div>

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
