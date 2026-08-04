import { fmtMi } from '@/lib/fmt'

// ── Peças de leitura de meta (v5.4.4) ────────────────────────────────────────
// "X% da meta", "Y% esperado" e "13,9% −0,1 p.p. vs alvo 14%" — as três leituras
// que TODO card de meta mostra, com a formatação e a regra de cor num lugar só.
//
// Nasceram inline em `meta-card.tsx` (v5.0.0). A v5.4.4 acrescentou o card de
// SUBSETOR, que precisa exatamente das mesmas três em escala menor — e a diferença
// entre os dois é SÓ a escala de tipo: a lógica (arredondar, escolher sinal, decidir
// verde/vermelho pelo delta) é idêntica. Duas cópias idênticas que precisam
// PERMANECER idênticas é a receita da divergência silenciosa que a v5.4.1 pagou na
// DRE (`dre/celula-contabil.tsx` existe pelo mesmo motivo): a cor de um lado é
// ajustada, a do outro não, e dois números vizinhos passam a contar histórias
// diferentes sem nenhum erro de build.
//
// A cor da comparação meta×esperado NÃO está aqui: vem de `@/lib/metas/cor-comparacao`,
// que já era compartilhada. Aqui vive a apresentação.
//
// ⚠️ `tv/tv-tela.tsx` tem a TERCEIRA versão dessas leituras, deliberadamente própria
// (escala de parede, sem interação, legenda fixa no rodapé). Não foi unificada: mexer
// no Modo TV exige conferência visual que a sessão não alcança. Se for tocá-lo por
// outro motivo, é candidato natural a migrar para cá.

/** `compacta` = card de subsetor (5 lado a lado); `normal` = card de setor/Group. */
export type EscalaMeta = 'normal' | 'compacta'

const ESCALA: Record<EscalaMeta, { pctNum: string; rotulo: string; nota: string }> = {
  normal:   { pctNum: 'text-xl', rotulo: 'text-sm',  nota: 'text-xs'  },
  compacta: { pctNum: 'text-lg', rotulo: 'text-2xs', nota: 'text-2xs' },
}

export const fmtNum1 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const fmtPct1 = (v: number) => `${fmtNum1(v)}%`

export const fmtMiOuTraco = (v: number | null): string => (v == null ? '—' : fmtMi(v))

export const pctRound = (v: number | null): string => (v == null ? '—' : `${Math.round(v)}%`)

/**
 * "% esperado" a partir do ritmo. É `esperado/meta`, não `pctDecorrido` cru: sem meta
 * cadastrada o esperado não existe (devolve `null` → a tela mostra "—"), enquanto
 * `pctDecorrido` seguiria informando uma fração de calendário sem denominador.
 */
export function pctEsperadoDe(ritmo: { metaPeriodo: number; esperadoAteHoje: number }): number | null {
  return ritmo.metaPeriodo > 0 ? (ritmo.esperadoAteHoje / ritmo.metaPeriodo) * 100 : null
}

/** "X% da meta" — número na cor da comparação. */
export function PctDaMeta({
  pctMeta, corNum, escala = 'normal',
}: { pctMeta: number | null; corNum: string; escala?: EscalaMeta }) {
  const e = ESCALA[escala]
  return (
    <span className="whitespace-nowrap">
      <span className={`${e.pctNum} font-bold tabular-nums ${corNum}`}>{pctRound(pctMeta)}</span>{' '}
      <span className={`${e.rotulo} text-[var(--text-muted)]`}>da meta</span>
    </span>
  )
}

/** "Y% esperado" — referência; o número na MESMA cor da comparação. */
export function PctEsperado({
  pct, corNum, escala = 'normal',
}: { pct: number | null; corNum: string; escala?: EscalaMeta }) {
  const e = ESCALA[escala]
  return (
    <span className={`whitespace-nowrap ${e.rotulo}`}>
      <span className={`font-medium tabular-nums ${corNum}`}>{pctRound(pct)}</span>{' '}
      <span className="text-[var(--text-muted)]">esperado</span>
    </span>
  )
}

/**
 * "13,9% −0,1 p.p. vs alvo 14%" — margem + delta em p.p. contra o alvo (colorido) +
 * o alvo (sem casas, peso normal). `corValor` pinta TAMBÉM o valor. Sem alvo
 * cadastrado → só a margem.
 */
export function Margem({
  margemPct, alvo, corValor, escala = 'normal',
}: { margemPct: number | null; alvo: number | null; corValor?: boolean; escala?: EscalaMeta }) {
  if (margemPct == null) return <span className="text-[var(--text-primary)]">—</span>
  if (alvo == null) {
    return <span className="tabular-nums text-[var(--text-primary)]">{fmtPct1(margemPct)}</span>
  }
  const e = ESCALA[escala]
  const delta = margemPct - alvo
  const cor = delta >= 0 ? 'text-success' : 'text-danger'
  const sinal = delta >= 0 ? '+' : '−'
  return (
    <span className="whitespace-nowrap tabular-nums">
      <span className={corValor ? cor : 'text-[var(--text-primary)]'}>{fmtPct1(margemPct)}</span>{' '}
      <span className={`${e.nota} font-medium ${cor}`}>{sinal}{fmtNum1(Math.abs(delta))} p.p.</span>{' '}
      <span className={`${e.nota} font-normal text-[var(--text-muted)]`}>vs alvo {Math.round(alvo)}%</span>
    </span>
  )
}
