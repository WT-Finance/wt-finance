// Recorte de meses da página "Despesas de Marketing" (v6.3.0) — módulo PURO, sem I/O nem React.
//
// O recorte é DERIVADO de cada ano selecionado (pills, vem da URL) — não há seleção de meses:
// `recortePadrao(ano, hoje)` devolve jan–dez num ano fechado e jan até o mês corrente no ano em
// curso (`mesIni..mesFim`, 1..12, inclusivo nas duas pontas). O PERÍODO da página é a união dos
// recortes dos anos selecionados (cada ano no seu): `rotuloPeriodoAnos` o descreve para os
// subtítulos dos cards.
// "Hoje" é SEMPRE parâmetro ('YYYY-MM-DD', calculado no servidor) — nunca `Date.now()` aqui.

export const MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'] as const

export interface Recorte {
  /** 1..12 */
  mesIni: number
  /** 1..12, ≥ mesIni */
  mesFim: number
}

/** Mês (1..12) de uma data 'YYYY-MM-DD' (ou ISO que comece por ela). */
export function mesDaData(iso: string): number {
  return parseInt(iso.slice(5, 7), 10)
}

/** Ano de uma data 'YYYY-MM-DD'. */
export function anoDaData(iso: string): number {
  return parseInt(iso.slice(0, 4), 10)
}

/** Último mês JÁ ALCANÇADO do ano: o mês de `hoje` no ano corrente; 12 em ano encerrado;
 *  1 em ano futuro (a UI não oferece, mas a conta não pode devolver mês inexistente). */
export function mesLimite(ano: number, hoje: string): number {
  const anoHoje = anoDaData(hoje)
  if (ano < anoHoje) return 12
  if (ano === anoHoje) return mesDaData(hoje)
  return 1
}

/** O recorte da página: de janeiro até o último mês alcançado — ano fechado = jan–dez; ano em
 *  curso = YTD, o que torna o "mesmo período do ano anterior" comparável por construção. */
export function recortePadrao(ano: number, hoje: string): Recorte {
  return { mesIni: 1, mesFim: mesLimite(ano, hoje) }
}

export function mesNoRecorte(mes: number, r: Recorte): boolean {
  return mes >= r.mesIni && mes <= r.mesFim
}

/** [mesIni, …, mesFim]. */
export function mesesDoRecorte(r: Recorte): number[] {
  const n = Math.max(0, r.mesFim - r.mesIni + 1)
  return Array.from({ length: n }, (_, i) => r.mesIni + i)
}

/** "2025 + 2026" — os anos selecionados, do mais antigo ao mais recente. */
export function rotuloAnos(anos: readonly number[]): string {
  return [...anos].sort((a, b) => a - b).join(' + ')
}

/**
 * O período da página, legível: "2025 + 2026 (até out)". Ano fechado entra só pelo número (jan–dez);
 * o ano corrente, quando ainda não chegou a dezembro, acrescenta "(até <mês>)" — o sufixo vem no
 * fim porque o ano corrente é sempre o mais recente dos selecionados. Ano corrente em dezembro é
 * um ano inteiro e não leva sufixo.
 */
export function rotuloPeriodoAnos(anos: readonly number[], hoje: string): string {
  const ordenados = [...anos].sort((a, b) => a - b)
  const corrente = anoDaData(hoje)
  const base = rotuloAnos(ordenados)
  if (!ordenados.includes(corrente)) return base
  const fim = mesLimite(corrente, hoje)
  return fim < 12 ? `${base} (até ${MESES_ABREV[fim - 1].toLowerCase()})` : base
}

// ── Ano PARCIAL (recorte menor que jan–dez) ─────────────────────────────────────────────────────
// Mesma convenção do card de proporção (`proporcao.ts`): o ano em curso leva `*` no rótulo e uma
// nota diz até onde vai. Só o ano corrente é parcial na prática, mas tudo aqui deriva do RECORTE —
// nada supõe qual ano é.

/** O recorte não cobre o ano civil inteiro. */
export function recorteParcial(r: Recorte): boolean {
  return r.mesIni > 1 || r.mesFim < 12
}

/** "jan–out" (um mês só: "jan"). */
export function rotuloRecorte(r: Recorte): string {
  const ini = MESES_ABREV[r.mesIni - 1].toLowerCase()
  const fim = MESES_ABREV[r.mesFim - 1].toLowerCase()
  return r.mesIni === r.mesFim ? ini : `${ini}–${fim}`
}

/** "2026*" quando o recorte do ano é parcial; "2025" num ano inteiro. */
export function rotuloAnoNoTotal(ano: number, r: Recorte): string {
  return recorteParcial(r) ? `${ano}*` : String(ano)
}

/**
 * A nota que explica o `*`: "* jan–out". `null` quando nenhum ano é parcial. Se mais de um ano
 * parcial tiver recortes DIFERENTES, a nota nomeia cada um ("* 2025: jan–set · 2026: jan–out") —
 * senão o mesmo asterisco diria duas coisas.
 */
export function notaRecortesParciais(
  itens: readonly { ano: number; recorte: Recorte }[],
): string | null {
  const parciais = itens.filter(i => recorteParcial(i.recorte)).sort((a, b) => a.ano - b.ano)
  if (parciais.length === 0) return null
  const rotulos = new Set(parciais.map(i => rotuloRecorte(i.recorte)))
  if (rotulos.size === 1) return `* ${[...rotulos][0]}`
  return `* ${parciais.map(i => `${i.ano}: ${rotuloRecorte(i.recorte)}`).join(' · ')}`
}

/** Soma `dias` a uma data 'YYYY-MM-DD' por componentes UTC (calendário puro, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dias))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}
