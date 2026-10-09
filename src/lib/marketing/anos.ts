// Seleção de anos da página "Despesas de Marketing" (v6.3.0) — módulo PURO, sem I/O nem React.
//
// O usuário escolhe 1, 2 ou 3 anos nas pills (seleção múltipla) e o estado vive na URL:
// `?anos=2025,2026`. O antigo `?ano=2026` (um ano só, da primeira versão da página) continua
// aceito. Regras, todas aqui para serem testáveis (a `page.tsx` é um Server Component):
//
//  • SEMPRE ao menos um ano — sem parâmetro válido, o default é o ano corrente em São Paulo
//    (`anoCorrente` é parâmetro, calculado no servidor; nunca relógio próprio aqui);
//  • valor que não é um inteiro de 4 dígitos, fora de [ANO_PISO, anoCorrente] ou fora de
//    `anosDisponiveis` (a lista das pills) é IGNORADO, nunca vira erro;
//  • no máximo `MAX_ANOS` (3): o gráfico tem um tom de cinza para cada ano e o painel Total, uma
//    barra por ano. Vindo da URL com mais, ficam os mais recentes;
//  • a lista é sempre crescente (o gráfico desenha do mais antigo ao mais recente).

/** Piso do parâmetro de ano. As RPCs aceitam 2000..2100; 2001 é o piso histórico da página (a
 *  versão com comparativo lia `ano − 1`). Não é "o primeiro ano com dado" — esse vem do resumo
 *  (`anosDisponiveis`) e pode recuar se a base ganhar histórico. */
export const ANO_PISO = 2001

/** Teto de anos selecionados ao mesmo tempo (tons de cinza e barras do painel Total). */
export const MAX_ANOS = 3

type ParamBruto = string | string[] | undefined

export interface ParamsAnos {
  /** `?anos=2025,2026` (lista separada por vírgula; aceita também repetido: `?anos=2025&anos=2026`). */
  anos?: ParamBruto
  /** `?ano=2026` — formato antigo, um ano só. Só vale se `anos` não trouxe nenhum ano válido. */
  ano?: ParamBruto
}

/** Quebra o parâmetro em inteiros de EXATAMENTE 4 dígitos. `parseInt` sozinho aceitaria
 *  "2025abc" como 2025 — validar a forma inteira evita ler lixo como ano. */
function inteirosDe(v: ParamBruto): number[] {
  const brutos = v === undefined ? [] : Array.isArray(v) ? v : [v]
  return brutos
    .flatMap(s => s.split(','))
    .map(s => s.trim())
    .filter(s => /^\d{4}$/.test(s))
    .map(Number)
}

const unicosCrescentes = (anos: readonly number[]): number[] =>
  [...new Set(anos)].sort((a, b) => a - b)

/** No máximo `MAX_ANOS`, ficando com os mais recentes. Espera a lista já crescente. */
const limitar = (anos: readonly number[]): number[] => anos.slice(-MAX_ANOS)

/**
 * Anos pedidos na URL, já filtrados pela FAIXA [ANO_PISO, anoCorrente] — a lista de anos com dado
 * (`anosDisponiveis`) só é conhecida depois de ler o resumo, então o filtro por ela é
 * `resolverAnos`. Sem nenhum ano válido: `[anoCorrente]`.
 */
export function anosDaUrl(params: ParamsAnos, anoCorrente: number): number[] {
  const naFaixa = (n: number) => n >= ANO_PISO && n <= anoCorrente
  const doAnos = unicosCrescentes(inteirosDe(params.anos).filter(naFaixa))
  if (doAnos.length > 0) return limitar(doAnos)
  // Formato antigo: um ano só — o primeiro VÁLIDO.
  const doAno = inteirosDe(params.ano).filter(naFaixa).slice(0, 1)
  return doAno.length > 0 ? doAno : [anoCorrente]
}

/**
 * Filtra o pedido pelos anos que têm pill. `anosDisponiveis === null` = a lista não pôde ser lida
 * (todas as leituras falharam): não há com o que filtrar, vale o pedido. Se nada sobrar, o default
 * (ano corrente), que sempre tem pill.
 */
export function resolverAnos(
  pedidos: readonly number[],
  anosDisponiveis: readonly number[] | null,
  anoCorrente: number,
): number[] {
  const validos = anosDisponiveis === null ? [...pedidos] : pedidos.filter(a => anosDisponiveis.includes(a))
  return validos.length > 0 ? unicosCrescentes(validos) : [anoCorrente]
}

/**
 * Clique numa pill: liga/desliga o ano. Nunca devolve lista vazia (clicar no único selecionado não
 * o desmarca) e nunca passa de `MAX_ANOS` (com o teto atingido, um ano novo não entra — a pill
 * aparece desabilitada, ver `anoBloqueado`). Devolve a MESMA lista quando nada muda.
 */
export function alternarAno(selecionados: readonly number[], ano: number): number[] {
  if (selecionados.includes(ano)) {
    return selecionados.length === 1 ? [...selecionados] : selecionados.filter(a => a !== ano)
  }
  if (selecionados.length >= MAX_ANOS) return [...selecionados]
  return unicosCrescentes([...selecionados, ano])
}

/** A pill de `ano` está bloqueada: o teto foi atingido e ela não está selecionada. */
export function anoBloqueado(selecionados: readonly number[], ano: number): boolean {
  return selecionados.length >= MAX_ANOS && !selecionados.includes(ano)
}

/** Valor do parâmetro `anos` na URL: "2025,2026". */
export function serializarAnos(anos: readonly number[]): string {
  return unicosCrescentes(anos).join(',')
}
