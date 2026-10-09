// Recorte de meses da página "Despesas de Marketing" (v6.3.0) — módulo PURO, sem I/O nem React.
//
// O recorte é DERIVADO do ano (pills, vem da URL) — não há seleção de meses: `recortePadrao`
// devolve jan–dez num ano fechado e jan até o mês corrente no ano em curso (`mesIni..mesFim`,
// 1..12, inclusivo nas duas pontas). Todos os cards respeitam o mesmo recorte.
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

/** "Jan–Set" (ou só "Mar" quando é um mês) — o rótulo que os subtítulos dos cards declaram. */
export function rotuloRecorte(r: Recorte): string {
  const ini = MESES_ABREV[r.mesIni - 1]
  const fim = MESES_ABREV[r.mesFim - 1]
  return r.mesIni === r.mesFim ? ini : `${ini}–${fim}`
}

/** "Jan–Set/2026". */
export function rotuloRecorteAno(r: Recorte, ano: number): string {
  return `${rotuloRecorte(r)}/${ano}`
}

/** Soma `dias` a uma data 'YYYY-MM-DD' por componentes UTC (calendário puro, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dias))
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`
}
