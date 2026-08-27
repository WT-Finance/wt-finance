// ── Janela YTD do regime de COMPETÊNCIA (v5.8.1) — módulo PURO ────────────────
// Quantos meses entram no "YTD" dos três componentes novos da seção de competência
// (linhas-chave, decomposição da variação e ponte entre regimes).
//
// ── Por que esta janela NÃO é a da tabela densa ──────────────────────────────
// A página corta o YTD das DUAS tabelas por `mesJanela` = mês corrente de `hojeSP()`
// (o calendário). Para o regime de CAIXA isso está certo: a base de movimentação é
// alimentada continuamente, então "jan até o mês corrente" é jan até onde há dado.
//
// A competência vem de um UPLOAD periódico, e a base fica naturalmente defasada entre
// uma carga e outra. Cortar pelo calendário faria o YTD somar meses que ainda não têm
// lançamento — zeros lidos como "faturamos zero em agosto", e não como "agosto ainda
// não subiu". A diferença é invisível: o número fecha, só está errado para menos.
//
// Por isso os três componentes cortam pela COBERTURA REAL da base (decisão do Yan na
// abertura da v5.8.1, resolvendo uma contradição do próprio briefing). Cada card
// declara a janela no subtítulo — é o subtítulo que explica ao leitor por que este
// "YTD 26" pode mostrar menos meses que a coluna "YTD" da tabela logo acima.
//
// ⚠️ A tabela densa NÃO foi alterada: mudá-la é escopo maior (mexeria no que a v5.8.0
// entregou) e ficou registrado como fronteira. Enquanto a base estiver em dia as duas
// janelas coincidem, que é o caso hoje (base cobre até 2026-08, e estamos em ago/2026).
//
// Sem `Date`, sem `hojeSP()`, sem rede: tudo sai do envelope do payload. É o que
// permite testar a regra mês a mês sem congelar relógio.

/** O que a janela precisa do envelope — os dois regimes cabem, mas só a competência
 *  traz `cobertura_ate`. Interface estrutural para o módulo não depender do `z.infer`
 *  de um regime só. */
export interface EnvelopeJanela {
  ano:           number
  relacao:       'fechado' | 'corrente' | 'futuro'
  mes_corrente:  number | null
  cobertura_ate?: string | null
}

/** Limita a [0, 12] — 0 significa "nenhum mês coberto neste ano". */
function clampMes(m: number): number {
  if (!Number.isFinite(m)) return 0
  return Math.min(Math.max(Math.trunc(m), 0), 12)
}

/**
 * Último mês do ANO PEDIDO coberto por uma data de cobertura `AAAA-MM-DD`.
 *
 * A comparação é por ANO, e não uma subtração de datas:
 *   · cobertura em ano POSTERIOR → o ano pedido está inteiro coberto → 12
 *   · cobertura NO ano pedido    → o mês da cobertura
 *   · cobertura em ano ANTERIOR  → nada daquele ano foi coberto → 0
 *
 * `null` quando a data não veio ou não tem a forma esperada — o chamador decide o
 * fallback (ver `janelaYtdCompetencia`). Nunca lança e nunca devolve `NaN`.
 */
export function mesFinalCoberto(coberturaAte: string | null | undefined, ano: number): number | null {
  if (typeof coberturaAte !== 'string') return null
  const m = /^(\d{4})-(\d{2})/.exec(coberturaAte)
  if (!m) return null

  const anoCob = Number(m[1])
  const mesCob = Number(m[2])
  if (!Number.isFinite(anoCob) || !Number.isFinite(mesCob)) return null

  if (anoCob > ano) return 12
  if (anoCob < ano) return 0
  return clampMes(mesCob)
}

/**
 * Janela YTD do regime de competência para o ano do envelope.
 *
 * Caminho normal: a cobertura da base. Sem ela, cai no que o envelope já diz sobre a
 * relação do ano com o presente — um ano `fechado` está inteiro (12), um ano
 * `corrente` vai até `mes_corrente`, e um ano `futuro` não tem nada (0).
 *
 * O fallback existe porque `cobertura_ate` é nullable no contrato: base vazia devolve
 * `null` ali, e nesse caso todo mês vale zero de qualquer jeito — mas devolver uma
 * janela coerente evita que o componente tenha de tratar um segundo caso de nada.
 */
export function janelaYtdCompetencia(p: EnvelopeJanela): number {
  const porCobertura = mesFinalCoberto(p.cobertura_ate, p.ano)
  if (porCobertura !== null) return porCobertura

  if (p.relacao === 'fechado') return 12
  if (p.relacao === 'futuro') return 0
  return clampMes(p.mes_corrente ?? 0)
}

const MESES_ABREV = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const

/**
 * Rótulo da janela para o subtítulo do card: `jan–ago`, ou `ano inteiro` quando são
 * os 12 meses. Vazio quando não há mês nenhum — aí o card não tem o que declarar.
 *
 * A declaração da janela no subtítulo NÃO é decoração: é ela que impede a leitura
 * errada quando este YTD diverge do da tabela densa acima.
 */
export function rotuloJanela(ateMes: number): string {
  const m = clampMes(ateMes)
  if (m <= 0) return ''
  if (m >= 12) return 'ano inteiro'
  return `${MESES_ABREV[0]}–${MESES_ABREV[m - 1]}`
}
