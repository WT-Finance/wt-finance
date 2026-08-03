// Margem anualizada da Lista de Operações (v5.4.2) — definição de métrica.
//
// PROBLEMA: a margem absoluta distorce a comparação entre operações de ciclos
// diferentes. 17,5% em 30,4 meses e 17,5% em 12 meses não valem o mesmo: a
// primeira ocupou dois anos e meio de capacidade para entregar o mesmo
// percentual. A Margem a.a. normaliza a margem por ano de operação ocupada.
//
// DEFINIÇÃO (decisão do Yan, v5.4.2 — ADR): a anualização é LINEAR,
//
//     margem_aa = margem × 12 / duração_em_meses
//
// e NUNCA composta (`(1+m)^(12/n) − 1`). A escolha é deliberada: a linear é
// explicável em uma frase ("margem por ano de operação ocupada") e é a leitura
// que a gestão de Weddings faz. A composta pressuporia reinvestimento do
// resultado a cada ciclo, que não é o que acontece aqui.
//
// DURAÇÃO é o denominador, então a semântica dela passa a valer dinheiro:
//
//     duração = data_evento − data_venda_contrato   (dias)
//
// exibida em meses de 30,44 dias. É a MESMA definição que a coluna "Duração"
// da lista já usava (`fmtMeses`, em @/lib/fmt) e a mesma que o banco usa para
// ordenar (`d_duracao` em get_operacoes_weddings__nucleo) — as três pontas
// dividem pelo mesmo 30,44 de propósito. Mexer numa exige mexer nas outras.
//
// CICLO CURTO É SINAL, NÃO CAP: anualizar um ciclo muito curto é frágil por
// construção (3,9 meses a 32,5% ⇒ 100% a.a.). O valor é exibido CRU — sem teto,
// sem winsorização — e a fragilidade é comunicada por um sinal visual discreto.
// Capar silenciosamente seria pior: esconderia a distorção em vez de sinalizá-la.

/** Dias por mês usados na conversão. Espelha `fmtMeses` (@/lib/fmt) e o `30.44` do SQL. */
export const DIAS_POR_MES = 30.44

/** Abaixo disto a anualização é frágil e recebe sinal visual (decisão do Yan: < 6 meses). */
export const DURACAO_CURTA_MESES = 6

/**
 * Duração da operação em DIAS: `data_evento − data_venda_contrato`.
 *
 * Usa aritmética em UTC sobre os componentes da string para não depender do
 * fuso do runtime (`new Date('YYYY-MM-DD')` é interpretado como UTC, mas
 * `new Date('YYYY-MM-DD HH:mm')` como local — a ambiguidade já morde aqui).
 *
 * Devolve `null` quando falta uma das datas OU quando a duração é negativa
 * (evento anterior ao contrato = dado inconsistente, não duração de zero).
 */
export function duracaoDias(
  dataVenda: string | null | undefined,
  dataEvento: string | null | undefined,
): number | null {
  if (!dataVenda || !dataEvento) return null
  const [yv, mv, dv] = dataVenda.split('-').map(Number)
  const [ye, me, de] = dataEvento.split('-').map(Number)
  if (![yv, mv, dv, ye, me, de].every(Number.isFinite)) return null
  const dias = Math.round((Date.UTC(ye, me - 1, de) - Date.UTC(yv, mv - 1, dv)) / 86_400_000)
  return dias >= 0 ? dias : null
}

/** Duração em meses (exato, sem arredondar) — é o denominador da anualização. */
export function duracaoMeses(dias: number | null): number | null {
  return dias == null ? null : dias / DIAS_POR_MES
}

/** Duração em meses com 1 casa, para exportação e conferência à mão. */
export function duracaoMesesExibida(dias: number | null): number | null {
  const meses = duracaoMeses(dias)
  return meses == null ? null : Number(meses.toFixed(1))
}

/**
 * Margem anualizada LINEAR: `margem × 12 / duração_meses`.
 *
 * Devolve `null` — nunca `Infinity`/`NaN` — quando a margem não é um número
 * finito ou quando a duração é ausente/zero. Quem exibe traduz `null` em
 * travessão.
 */
export function margemAnualizada(
  margemPct: number | null | undefined,
  dias: number | null,
): number | null {
  if (margemPct == null || !Number.isFinite(margemPct)) return null
  const meses = duracaoMeses(dias)
  if (meses == null || meses <= 0) return null
  return (margemPct * 12) / meses
}

/** Duração curta o bastante para a anualização ser frágil (sinal visual, não cap). */
export function ehDuracaoCurta(dias: number | null): boolean {
  const meses = duracaoMeses(dias)
  return meses != null && meses > 0 && meses < DURACAO_CURTA_MESES
}

/**
 * Percentual em pt-BR com 1 casa ("6,9%", "−12,4%").
 *
 * Helper LOCAL de propósito: `@/lib/fmt` é território da v5.4.1 (DRE) enquanto
 * as duas frentes correm em paralelo — consolidar lá é follow-up pós-merge.
 */
export function fmtPct1(v: number): string {
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
