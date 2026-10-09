// Seleção de anos da página "Despesas de Marketing" (v6.3.0) — módulo PURO, sem I/O nem React.
//
// O usuário escolhe um ou mais anos nas pills (seleção múltipla) e o estado vive na URL:
// `?anos=2025,2026`. O antigo `?ano=2026` (um ano só, da primeira versão da página) continua
// aceito. Regras, todas aqui para serem testáveis (a `page.tsx` é um Server Component):
//
//  • SEMPRE ao menos um ano — sem parâmetro válido, o default são os ÚLTIMOS TRÊS anos até o
//    corrente em São Paulo (decisão do Yan, 09/10: a página abre com 2024, 2025 e 2026), filtrados
//    depois pelos anos que existem na base (`resolverAnos`); `anoCorrente` é parâmetro, calculado no
//    servidor — nunca relógio próprio aqui;
//  • valor que não é um inteiro de 4 dígitos, fora de [ANO_PISO, anoCorrente] ou fora de
//    `anosDisponiveis` (a lista das pills) é IGNORADO, nunca vira erro;
//  • SEM teto de anos: as pills são os anos presentes na base e podem ser todas selecionadas (a
//    escada de cores repete o tom mais claro além de três anos — ver `cores.ts`);
//  • a lista é sempre crescente (o gráfico desenha do mais antigo ao mais recente).

/** Piso do parâmetro de ano. As RPCs aceitam 2000..2100; 2001 é o piso histórico da página (a
 *  versão com comparativo lia `ano − 1`). Não é "o primeiro ano com dado" — esse vem do resumo
 *  (`anosDisponiveis`) e pode recuar se a base ganhar histórico. */
export const ANO_PISO = 2001

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

/** Quantos anos a página abre selecionados quando a URL não diz: o corrente e os dois anteriores. */
const ANOS_PADRAO = 3

/** A seleção padrão: os `ANOS_PADRAO` anos até o corrente (ex.: 2024, 2025, 2026). Os que não têm
 *  lançamento na base são descartados depois por `resolverAnos`. */
export function anosPadrao(anoCorrente: number): number[] {
  return Array.from({ length: ANOS_PADRAO }, (_, i) => anoCorrente - (ANOS_PADRAO - 1) + i)
    .filter(a => a >= ANO_PISO)
}

/**
 * Anos pedidos na URL, já filtrados pela FAIXA [ANO_PISO, anoCorrente] — a lista de anos com dado
 * (`anosDisponiveis`) só é conhecida depois de ler o resumo, então o filtro por ela é
 * `resolverAnos`. Sem nenhum ano válido: `anosPadrao(anoCorrente)`.
 */
export function anosDaUrl(params: ParamsAnos, anoCorrente: number): number[] {
  const naFaixa = (n: number) => n >= ANO_PISO && n <= anoCorrente
  const doAnos = unicosCrescentes(inteirosDe(params.anos).filter(naFaixa))
  if (doAnos.length > 0) return doAnos
  // Formato antigo: um ano só — o primeiro VÁLIDO.
  const doAno = inteirosDe(params.ano).filter(naFaixa).slice(0, 1)
  return doAno.length > 0 ? doAno : anosPadrao(anoCorrente)
}

/**
 * A lista de pills de ano. Fonte normal: `anosDaBase` (anos com lançamento, GLOBAL — qualquer
 * resumo carregado traz a mesma lista). Sem ela (`null` = nenhum resumo carregou), cai na janela
 * dos últimos `janela` anos até o corrente E inclui os anos PEDIDOS: nesse caso `resolverAnos`
 * devolve o pedido tal como veio, e uma seleção sem pill não poderia ser desmarcada pelo usuário.
 * Sempre inclui o ano corrente (em janeiro ele pode ainda não ter lançamento e a pill não pode
 * sumir). Com a base lida, um `?anos=` fora dela NÃO ganha pill (é descartado por `resolverAnos`).
 */
export function anosDasPills(
  anosDaBase: readonly number[] | null,
  pedidos: readonly number[],
  anoCorrente: number,
  janela: number,
): number[] {
  const base = anosDaBase
    ?? [
      ...Array.from({ length: janela }, (_, i) => anoCorrente - (janela - 1) + i),
      ...pedidos,
    ]
  return unicosCrescentes([...base, anoCorrente])
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
 * o desmarca); não há teto de anos. Devolve a MESMA lista (cópia) quando nada muda.
 */
export function alternarAno(selecionados: readonly number[], ano: number): number[] {
  if (selecionados.includes(ano)) {
    return selecionados.length === 1 ? [...selecionados] : selecionados.filter(a => a !== ano)
  }
  return unicosCrescentes([...selecionados, ano])
}

/** Valor do parâmetro `anos` na URL: "2025,2026". */
export function serializarAnos(anos: readonly number[]): string {
  return unicosCrescentes(anos).join(',')
}
