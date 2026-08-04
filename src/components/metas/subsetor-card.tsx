import { Card } from '@/components/ui/card'
import MetaProgressBar from '@/components/shared/meta-progress-bar'
import { fmtMi } from '@/lib/fmt'
import { corComparacao } from '@/lib/metas/cor-comparacao'
import { Margem, PctDaMeta, PctEsperado, pctEsperadoDe, pctRound } from '@/components/metas/pecas-meta'
import type { PainelSubsetor } from '@/components/metas/tipos'
import type { RitmoAgregado } from '@/lib/metas/ritmo'

// Card de UM subsetor de Weddings (v5.4.4) — vive dentro da expansão do card de
// Weddings do Acompanhamento de Metas. Mesmo MOLDE do <MetaCard tamanho="setor">
// (rótulo → métrica grande + "% da meta" → "Meta:" + "% esperado" → barra → linhas de
// baixo), em escala mais compacta (5 cards lado a lado). As três leituras e os
// formatadores vêm de `pecas-meta.tsx` — as MESMAS do <MetaCard>, com
// `escala="compacta"`; nada de formatação ou de cor é redefinido aqui.
//
// VARIANTE COMERCIAL: quando `ritmoContratos` não é null, ele GOVERNA a métrica
// grande (contratos, não R$), o "% da meta"/"% esperado" e a barra; o faturamento
// (que compõe a soma da meta de Weddings, mas não tem barra própria aqui) desce para
// as linhas de baixo. Nos outros quatro subsetores `ritmo` (R$) governa tudo.
//
// mostrarTooltip={false} SEMPRE: a barra vive dentro de DUAS cortinas aninhadas (a de
// Weddings e, possivelmente, a de Não Classificados ao lado) — o balão
// `absolute bottom-full` do <MetaProgressBar> seria decapitado pelo overflow-hidden
// do clip (regra da skill ui-design-system §2.1 / header de shared/cortina.tsx). Em
// troca, a informação do balão vira TEXTO curto ("+X adiantado" / "X abaixo do
// esperado"), derivado de `realizado - esperadoAteHoje` do ritmo GOVERNANTE.

const fmtContratos = (v: number): string => {
  const r = Math.round(v)
  return `${r.toLocaleString('pt-BR')} contrato${r === 1 ? '' : 's'}`
}

/** Texto curto que SUBSTITUI o balão do tooltip (proibido dentro de cortina): "+X
 *  adiantado" (R$, com sinal — mesma convenção do balão original) ou "N contrato(s)
 *  adiantado" (COMERCIAL, contagem, sem sinal — nunca R$) / "... abaixo do esperado". */
function TextoRitmo({ ritmo, unidade }: { ritmo: RitmoAgregado; unidade: 'moeda' | 'contratos' }) {
  const gap = Math.abs(ritmo.realizado - ritmo.esperadoAteHoje)
  const adiantado = ritmo.realizado >= ritmo.esperadoAteHoje
  if (unidade === 'moeda') {
    return (
      <p className={`mt-1 text-right text-2xs font-medium ${adiantado ? 'text-success' : 'text-danger'}`}>
        {adiantado ? `+${fmtMi(gap)} adiantado` : `${fmtMi(gap)} abaixo do esperado`}
      </p>
    )
  }
  const n = Math.round(gap)
  const rotulo = `${n.toLocaleString('pt-BR')} contrato${n === 1 ? '' : 's'}`
  return (
    <p className={`mt-1 text-right text-2xs font-medium ${adiantado ? 'text-success' : 'text-danger'}`}>
      {adiantado ? `${rotulo} adiantado` : `${rotulo} abaixo do esperado`}
    </p>
  )
}

interface Props {
  subsetor: PainelSubsetor
}

export default function SubsetorCard({ subsetor }: Props) {
  const { display, subtitulo, cor, faturamento, receita, margemPct, contratos, ritmo, ritmoContratos } = subsetor

  // COMERCIAL: a meta de CONTRATOS governa o topo e a barra; a de R$ (`ritmo`) só
  // compõe a soma da meta de Weddings e desce para as linhas de baixo. `??` (não um
  // ternário sobre um booleano à parte) é o que deixa o TS estreitar `ritmoContratos`
  // para não-null em `governante`.
  const comercial = ritmoContratos != null
  const governante = ritmoContratos ?? ritmo

  const pctEsperado = pctEsperadoDe(governante)
  const corNum = corComparacao(governante.pctMeta, pctEsperado)

  const metricaPrincipal = comercial
    ? (contratos == null ? '—' : fmtContratos(contratos))
    : fmtMi(faturamento)
  const metaPrincipal = comercial ? fmtContratos(governante.metaPeriodo) : fmtMi(governante.metaPeriodo)

  const ariaLabel =
    `${display}: ${pctRound(governante.pctMeta)} da meta; esperado ${pctRound(pctEsperado)} do período`

  return (
    <Card className="flex h-full flex-col px-4 py-3">
      <div>
        <p className="text-sm font-semibold" style={{ color: cor }}>{display}</p>
        {subtitulo && <p className="text-xs font-medium" style={{ color: cor }}>{subtitulo}</p>}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-xl font-bold tabular-nums" style={{ color: cor }} aria-label={ariaLabel}>
          {metricaPrincipal}
        </span>
        <PctDaMeta pctMeta={governante.pctMeta} corNum={corNum} escala="compacta" />
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">Meta: <span className="tabular-nums">{metaPrincipal}</span></p>
        <PctEsperado pct={pctEsperado} corNum={corNum} escala="compacta" />
      </div>

      <div className="mt-2">
        <MetaProgressBar
          pctMeta={governante.pctMeta}
          pctEsperado={pctEsperado ?? 0}
          cor={cor}
          altura={8}
          pctDecorrido={governante.pctDecorrido}
          esperado={governante.esperadoAteHoje}
          realizado={governante.realizado}
          mostrarTooltip={false}
        />
      </div>
      <TextoRitmo ritmo={governante} unidade={comercial ? 'contratos' : 'moeda'} />

      <div className="mt-auto space-y-1 border-t border-zinc-100 pt-2 text-[13px]">
        {comercial && (
          <div className="flex items-baseline justify-between">
            <span className="text-[var(--text-muted)]">Faturamento</span>
            <span className="font-medium tabular-nums text-[var(--text-primary)]">{fmtMi(faturamento)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[var(--text-muted)]">Receita</span>
          <span className="font-medium tabular-nums text-[var(--text-primary)]">{fmtMi(receita)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[var(--text-muted)]">Margem</span>
          {/* `corValor` mantém o valor da margem colorido, como estava antes da
              extração das peças; `ritmo` (R$) é sempre o alvo, nunca o de contratos. */}
          <Margem margemPct={margemPct} alvo={ritmo.pctReceitaAlvo} corValor escala="compacta" />
        </div>
      </div>
    </Card>
  )
}
