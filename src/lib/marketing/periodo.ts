// Recorte de meses da página "Gastos de Marketing" (v6.3.0) — módulo PURO, sem I/O nem React.
//
// O recorte global é: UM ano (pills, vem da URL) + um intervalo CONTÍGUO de meses dentro dele
// (`mesIni..mesFim`, 1..12, inclusivo nas duas pontas). Todos os cards respeitam o mesmo recorte.
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

/** Recorte inicial: do janeiro até o último mês alcançado — num ano em curso é o YTD, o que
 *  torna o "mesmo período do ano anterior" comparável por construção. */
export function recortePadrao(ano: number, hoje: string): Recorte {
  return { mesIni: 1, mesFim: mesLimite(ano, hoje) }
}

/** Prende `mes` em 1..limite (limite ≥ 1). */
function prender(mes: number, limite: number): number {
  return Math.min(Math.max(1, Math.trunc(mes)), Math.max(1, limite))
}

/** Normaliza um recorte: meses inteiros em 1..limite e `mesIni ≤ mesFim` (inverte se vierem
 *  trocados — a ordem dos cliques/seleções é indiferente). */
export function normalizarRecorte(r: Recorte, limite = 12): Recorte {
  const a = prender(r.mesIni, limite)
  const b = prender(r.mesFim, limite)
  return a <= b ? { mesIni: a, mesFim: b } : { mesIni: b, mesFim: a }
}

/** Muda UMA ponta do recorte e arrasta a outra se a ordem se desfizer (mudar o "de" para
 *  depois do "até" empurra o "até"; mudar o "até" para antes do "de" empurra o "de"). */
export function ajustarRecorte(
  atual: Recorte,
  mudanca: { mesIni: number } | { mesFim: number },
  limite = 12,
): Recorte {
  if ('mesIni' in mudanca) {
    const mesIni = prender(mudanca.mesIni, limite)
    return { mesIni, mesFim: Math.max(mesIni, prender(atual.mesFim, limite)) }
  }
  const mesFim = prender(mudanca.mesFim, limite)
  return { mesIni: Math.min(mesFim, prender(atual.mesIni, limite)), mesFim }
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

/** 'YYYY-MM-DD' → 'DD/MM' (o aviso "Cartão lançado até DD/MM"). */
export function fmtDiaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
