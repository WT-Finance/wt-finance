// Barras do card "Proporção sobre a Receita Bruta" (v6.3.0) — módulo PURO.
//
// O número vem PRONTO da RPC `get_marketing_proporcao_receita` (o `pct` já é Marketing ÷ Receita
// Bruta × 100, por COMPETÊNCIA, com o sinal da DRE — o MESMO do grupo Marketing na grade da DRE).
// Este módulo NÃO refaz a conta: só ordena os anos, atribui a cor, monta o rótulo e separa o que
// carregou do que falhou.
//
// • ORDEM: crescente por ano (o mais antigo à esquerda), como o gráfico "Despesas mensais".
// • COR: `coresDosAnos` sobre TODOS os anos selecionados — não só os que carregaram. Vale para a
//   PÁGINA TODA: o gráfico "Despesas mensais" (`SerieMensal`) colore pelos mesmos selecionados
//   (`coresPorAno`), então a cor de um ano não muda conforme QUAL leitura/card falhou — nos dois
//   gráficos o mesmo ano tem sempre a mesma cor.
// • ANO PARCIAL: "2026*" + "N meses" (como a grade da DRE: `2026*` no eixo, "2026 · 10 meses" no
//   tooltip). Só o ano corrente é parcial; ano fechado não leva sufixo.
// • `pct` null → sem barra e "—" (travessão cheio; o `fmtAv(null)` da DRE devolve en-dash, que aqui
//   não serve — a especificação pede "—"). Zero é um valor real e NUNCA vira "—".
// • LEITURA que falhou → fora das barras e listada em `anosFalha` (o card avisa, a página não cai).

import { fmtAv } from '@/lib/dre/av'
import { coresDosAnos } from './cores'
import { escalaSerie, type EscalaSerie } from './escala'
import type { ProporcaoReceitaMarketing } from './schemas-proporcao'
import type { Carregado } from './tipos'

/** A leitura da proporção de UM ano (cada uma falha sozinha — `Carregado`). */
export interface LeituraProporcao {
  ano: number
  proporcao: Carregado<ProporcaoReceitaMarketing>
}

interface BarraProporcao {
  ano: number
  /** Texto do eixo X: "2025" · "2026* · 10 meses" · "2024 · —" (sem ponto). */
  rotuloEixo: string
  /** Texto do tooltip: "2025" · "2026 · 10 meses" (sem asterisco). */
  rotuloTooltip: string
  /** Token CSS (`var(--…)`), por posição entre os anos selecionados. */
  cor: string
  /** % com o sinal da DRE (negativo para despesa); `null` = o ano não tem ponto (sem barra). */
  pct: number | null
  /** "(6,2%)" no formato da DRE (`fmtAv`), ou "—" quando não há ponto. */
  rotuloPct: string
  parcial: boolean
  mesesCobertos: number
}

export interface BarrasProporcao {
  /** Uma por ano que carregou, em ordem crescente de ano. */
  barras: BarraProporcao[]
  /** Anos selecionados cuja leitura falhou (ou não veio), em ordem crescente. */
  anosFalha: number[]
}

const rotuloMeses = (n: number): string => `${n} ${n === 1 ? 'mês' : 'meses'}`

export function barrasProporcao(
  anosSelecionados: readonly number[],
  leituras: readonly LeituraProporcao[],
): BarrasProporcao {
  const anos = [...anosSelecionados].sort((a, b) => a - b)
  const cores = coresDosAnos(anos)
  const porAno = new Map(leituras.map(l => [l.ano, l.proporcao]))

  const barras: BarraProporcao[] = []
  const anosFalha: number[] = []

  anos.forEach((ano, i) => {
    const leitura = porAno.get(ano)
    if (leitura === undefined || !leitura.ok) {
      anosFalha.push(ano)
      return
    }
    const { pct, parcial, mesesCobertos } = leitura.dados
    const base = parcial ? `${ano}*` : String(ano)
    const semPonto = pct === null
    barras.push({
      ano,
      rotuloEixo: semPonto ? `${base} · —` : parcial ? `${base} · ${rotuloMeses(mesesCobertos)}` : base,
      rotuloTooltip: parcial ? `${ano} · ${rotuloMeses(mesesCobertos)}` : String(ano),
      cor: cores[i],
      pct,
      rotuloPct: semPonto ? '—' : fmtAv(pct),
      parcial,
      mesesCobertos,
    })
  })

  return { barras, anosFalha }
}

// ── Escala do eixo Y (percentual) ─────────────────────────────────────────────────────────────
// Reusa `escalaSerie` (domínio que CONTÉM o zero e os valores, ticks de passo redondo — o domínio
// default do Recharts cortaria os negativos). Duas diferenças para um eixo de %:
//  • os casos degenerados de `escalaSerie` são monetários (`[-4000, 0]`), aqui são tratados à parte;
//  • FOLGA para o rótulo: o rótulo do % fica logo além da ponta livre da barra, e se o valor cair
//    quase em cima da borda do domínio (ex.: −8,0 num domínio que acaba em −8) o texto sai do
//    gráfico. Quando sobra menos de `FOLGA_DO_PASSO` de passo, o domínio ganha mais um passo.

export interface EscalaProporcao extends EscalaSerie {
  /** Casas decimais dos ticks (0 se todos inteiros, senão 1 ou 2). */
  casas: number
}

const FOLGA_DO_PASSO = 0.6

const limpar = (n: number): number => (n === 0 ? 0 : Math.round(n * 100) / 100)

function casasDosTicks(ticks: readonly number[]): number {
  for (const casas of [0, 1]) {
    const f = 10 ** casas
    if (ticks.every(t => Math.abs(t * f - Math.round(t * f)) < 1e-9)) return casas
  }
  return 2
}

export function escalaProporcao(pcts: readonly (number | null | undefined)[]): EscalaProporcao {
  const v = pcts.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  // Nenhum ponto: o gráfico não desenha barra; só precisa de um eixo legível.
  if (v.length === 0) return { domain: [-2, 0], ticks: [-2, -1, 0], casas: 0 }
  // Tudo zero (valor real, não ausência): zero no meio, com espaço para o rótulo acima da linha.
  if (v.every(n => n === 0)) return { domain: [-1, 1], ticks: [-1, 0, 1], casas: 0 }

  const base = escalaSerie(v)
  const passo = base.ticks[1] - base.ticks[0]
  const ticks = [...base.ticks]
  let [lo, hi] = base.domain
  if (Math.min(...v) < 0 && Math.min(...v) - lo < FOLGA_DO_PASSO * passo) {
    lo = limpar(lo - passo)
    ticks.unshift(lo)
  }
  if (Math.max(...v) > 0 && hi - Math.max(...v) < FOLGA_DO_PASSO * passo) {
    hi = limpar(hi + passo)
    ticks.push(hi)
  }
  return { domain: [lo, hi], ticks, casas: casasDosTicks(ticks) }
}
