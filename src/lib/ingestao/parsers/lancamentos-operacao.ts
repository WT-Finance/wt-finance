// Parser do CRU de "Lançamentos por Operação" (Frente C, M3 da v6.0.0).
//
// Esta base é diferente das outras quatro em três pontos, e vale dizer quais antes do código:
//
// 1. **O cru é um CSV de scrape**, não um export do Monde — vem da "Análise de Operações", uma
//    tabela HTML raspada operação a operação. Por isso os números chegam como texto BR
//    (`"R$ 389,16"`) e as datas como `DD/MM/AAAA`.
//
// 2. **O arquivo NÃO traz checksum.** Não há linha de totais nem outline. A conferência do
//    contrato §4 é um CRUZAMENTO: todo `Número` sem liquidação tem de existir na base de
//    vencimento em aberto ou na de movimentação, e o `Vencimento` tem de coincidir. Ausência
//    acima do baseline é alarme, não bloqueio — é a única base em que o gate não derruba a carga,
//    porque a fonte é scrape e a falta pode ser da raspagem, não do dado.
//
// 3. **O `Vencimento` MUDA DE FONTE nesta versão.** O script R legado
//    (`analise_casamentos2.R`) o buscava em oito planilhas anuais de contas a pagar/receber
//    (`2021.xlsx` … `2028.xlsx`, caminho fixo na máquina de alguém), empilhadas e deduplicadas
//    pela primeira ocorrência. Essas oito planilhas se aposentam: o vencimento passa a sair das
//    bases que o Janus já ingere — Aberto primeiro, Movimentação como reserva. Isto é DESENHO
//    NOVO, não porte; por isso o oráculo desta base não é paridade, e sim ACORDO ENTRE FONTES.
//
// `Status` **não é gravado**: depende de "hoje" e por isso é calculado na leitura. Guardá-lo
// tornaria a linha errada no dia seguinte — e, no legado, um lançamento sem `Data_Final` caía no
// ramo final do `case_when` e nascia com cara de realizado.

import { toNum } from '@/lib/carga/coercao'
import {
  aparar, apararOuNulo, apertar, ehVazio, valorEmReais, lerData, mapearColunas, camposFaltando,
  erro,
  type Matriz, type Checksum, type DataRejeitada, type Parse,
} from './comum'
import type { LancamentoCategoriaCru } from './lancamentos-categoria'

export interface LancamentoOperacaoCru {
  readonly linha_origem: number
  readonly lancamento_numero: string | null
  readonly venda_numero: string | null
  readonly pessoa: string | null
  readonly descricao: string | null
  readonly liquidacao: string | null
  /** Resolvido nas bases vizinhas (Aberto → Movimentação); `null` quando não casa. */
  readonly vencimento: string | null
  readonly valor: number | null
  /** Nome da operação, com espaço interno COLAPSADO — é chave de junção digitada por humano. */
  readonly operacao: string | null
  readonly tipo: string | null
  /** `liquidacao` quando existe, senão `vencimento`. */
  readonly data_final: string | null
}

type Campo = 'lancamento_numero' | 'venda_numero' | 'pessoa' | 'descricao' | 'liquidacao'
  | 'valor' | 'operacao' | 'tipo'

const COL_MAP: Record<string, Campo> = {
  'Lançamento N°':  'lancamento_numero',
  'Lançamento Nº':  'lancamento_numero',
  'Lançamento N.':  'lancamento_numero',
  'Lançamento.N.':  'lancamento_numero',
  'Venda':          'venda_numero',
  'Pessoa':         'pessoa',
  'Descrição':      'descricao',
  'Liquidação':     'liquidacao',
  'Valor':          'valor',
  'Operacao':       'operacao',
  'Operação':       'operacao',
  'Tipo':           'tipo',
}

const OBRIGATORIOS: Campo[] = [
  'lancamento_numero', 'venda_numero', 'pessoa', 'descricao', 'liquidacao', 'valor', 'operacao', 'tipo',
]

/**
 * O que o scrape escreve quando a tabela da operação veio vazia ou não terminou de carregar.
 * São linhas REAIS do CSV — no anexo de 21/09 há cinco delas, uma por operação sem lançamento —
 * e a diferença entre as 41.750 linhas do arquivo e as 41.745 de `fato_lancamento_operacao` é
 * exatamente esta. Ficam no `raw` (que espelha o CSV, contrato §3) com os campos tipados nulos,
 * e é a derivação do fato que as descarta.
 *
 * Reconhecê-las por NOME é o que permite manter a guarda de valor ilegível afiada: qualquer
 * outro texto no lugar do número continua derrubando a carga, porque aí o formato mudou mesmo.
 */
const PLACEHOLDERS_DO_SCRAPE = new Set(['nada para mostrar', 'carregando', 'carregando...'])

function ehPlaceholderDoScrape(v: unknown): boolean {
  return PLACEHOLDERS_DO_SCRAPE.has(aparar(v).toLowerCase())
}

/**
 * Índice `Número → Vencimento` a partir das bases vizinhas já parseadas.
 *
 * Precedência: **Aberto ganha de Movimentação**. Aberto é a base dos títulos ainda não
 * liquidados — que é exatamente a população cujo vencimento interessa aqui; Movimentação entra
 * como reserva para o que já foi baixado.
 *
 * ⚠️ `Número` vazio NUNCA entra no índice. No legado, a junção era um `left_join` do dplyr, que
 * casa `NA` com `NA` por padrão: bastava uma linha de vencimento com número nulo para TODAS as
 * linhas sem número herdarem o mesmo vencimento. Um `JOIN` de SQL não faz isso (`NULL` não casa
 * com `NULL`) e este índice também não.
 */
export function indiceDeVencimentos(
  aberto: readonly LancamentoCategoriaCru[],
  movimentacao: readonly LancamentoCategoriaCru[],
): Map<string, string> {
  const indice = new Map<string, string>()
  // Movimentação primeiro; Aberto sobrescreve, porque tem precedência.
  for (const fonte of [movimentacao, aberto]) {
    for (const l of fonte) {
      const numero = aparar(l.numero)
      if (numero === '' || l.vencimento === null) continue
      indice.set(numero, l.vencimento)
    }
  }
  return indice
}

export interface ResultadoCruzamento {
  /** `Número` DISTINTOS sem liquidação — a população que o cruzamento cobre.
   *
   *  Distintos, não linhas: o mesmo lançamento aparece em mais de uma operação (no anexo de
   *  21/09 são 5.019 linhas para 4.008 números), e contar linhas mediria a duplicação do scrape
   *  em vez da cobertura do cruzamento. */
  readonly semLiquidacao: number
  /** Desses, quantos acharam vencimento nas bases vizinhas. */
  readonly encontrados: number
  /** Os `Número` que não foram achados (até 20, para o alarme nomear). */
  readonly ausentes: string[]
  /** Linhas sem liquidação, antes de deduplicar por `Número`. */
  readonly linhasSemLiquidacao: number
}

/**
 * Lê o CSV cru da Análise de Operações e resolve o `Vencimento` nas bases vizinhas.
 *
 * `vencimentos` vem de `indiceDeVencimentos`. Quando o índice está vazio (carga isolada, sem as
 * vizinhas), o parser ainda lê o arquivo: quem decide se isso é aceitável é o grafo de
 * dependência da rota (contrato §5 — Operação exige Aberto aplicado no dia, senão 409).
 */
export function parseLancamentosOperacaoRows(
  rows: Matriz,
  vencimentos: ReadonlyMap<string, string>,
  opcoes: { hoje?: Date } = {},
): Parse<LancamentoOperacaoCru> & { cruzamento?: ResultadoCruzamento } {
  if (rows.length < 2) return erro('FORMATO_INVALIDO', 'CSV vazio ou sem linhas de dado.')

  const { indices, naoMapeados } = mapearColunas<Campo>(rows[0] ?? [], COL_MAP)
  const faltando = camposFaltando(indices, OBRIGATORIOS)
  if (faltando.length > 0) {
    return erro('ESTRUTURA_INESPERADA',
      `O CSV não traz no cabeçalho: ${faltando.join(', ')}. Confira se o arquivo é a "Análise de ` +
      'Operações".',
      { faltando, naoMapeados })
  }

  const linhas: LancamentoOperacaoCru[] = []
  const datasRejeitadas: DataRejeitada[] = []
  const semLiquidacaoNumeros = new Set<string>()
  const encontradosNumeros = new Set<string>()
  const ausentesNumeros = new Set<string>()
  let linhasSemLiquidacao = 0
  let ignoradas = 0
  let semLancamento = 0

  for (let i = 1; i < rows.length; i++) {
    const linha = rows[i] ?? []
    if (linha.every((c) => ehVazio(c))) continue

    // Linha de operação SEM lançamento: o scrape preenche todas as colunas com o mesmo texto.
    const vazia = ehPlaceholderDoScrape(linha[indices.valor as number])
    if (vazia) semLancamento++

    const numero = apararOuNulo(linha[indices.lancamento_numero as number])
    const liquidacao = vazia ? null : lerData(
      linha[indices.liquidacao as number], 'liquidacao', i + 1, datasRejeitadas, opcoes.hoje)

    // O vencimento vem de fora do arquivo. Sem `Número` não há como cruzar — e herdar por
    // casamento de nulo é o defeito que `indiceDeVencimentos` existe para não repetir.
    const vencimento = numero === null || vazia ? null : (vencimentos.get(numero) ?? null)
    if (liquidacao === null && !vazia) {
      linhasSemLiquidacao++
      if (numero !== null) {
        semLiquidacaoNumeros.add(numero)
        if (vencimento !== null) encontradosNumeros.add(numero)
        else ausentesNumeros.add(numero)
      }
    }

    const valorBruto = linha[indices.valor as number]
    const valor = ehVazio(valorBruto) || vazia ? null : valorEmReais(toNum(valorBruto))
    if (valor === null && !ehVazio(valorBruto) && !vazia) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: valor ilegível ("${aparar(valorBruto)}"). No CSV o valor chega como texto ` +
        'BR e a coerção canônica não o reconheceu — o formato do scrape mudou.',
        { linha: i + 1 })
    }

    linhas.push({
      linha_origem:      i + 1,
      lancamento_numero: numero,
      venda_numero:      apararOuNulo(linha[indices.venda_numero as number]),
      pessoa:            apararOuNulo(linha[indices.pessoa as number]),
      descricao:         apararOuNulo(linha[indices.descricao as number]),
      liquidacao,
      vencimento,
      valor,
      // `str_squish`: "W - Camila e Bruno -  02SET23" e "W - Camila e Bruno - 02SET23" são a
      // mesma operação para quem digitou. O legado corrigia o caso com um patch manual
      // comentado no script; colapsar o espaço resolve a classe inteira.
      operacao:          apararOuNulo(apertar(linha[indices.operacao as number])),
      tipo:              apararOuNulo(linha[indices.tipo as number]),
      data_final:        liquidacao ?? vencimento,
    })
    if (linhas.length === 0) ignoradas++
  }

  if (linhas.length === 0) {
    return erro('ESTRUTURA_INESPERADA', 'Nenhuma linha de lançamento encontrada no CSV.')
  }

  // Esta base não tem checksum próprio: o "checksum" é a cobertura do cruzamento. Ele vira
  // ALARME, não bloqueio (contrato §4) — a fonte é scrape, e a falta pode ser da raspagem.
  const checksums: Checksum[] = [{
    escopo: 'cruzamento-vencimento',
    chave: [],
    campo: 'vencimento',
    linhasDeclaradas: null,
    centavosDeclarados: null,
    linhasApuradas: encontradosNumeros.size,
    centavosApurados: 0,
  }]

  return {
    ok: true,
    linhas,
    checksums,
    datasRejeitadas,
    cruzamento: {
      semLiquidacao: semLiquidacaoNumeros.size,
      encontrados: encontradosNumeros.size,
      ausentes: [...ausentesNumeros].slice(0, 20),
      linhasSemLiquidacao,
    },
    diagnostico: {
      linhas: linhas.length,
      colunasNaoMapeadas: naoMapeados,
      semLiquidacao: semLiquidacaoNumeros.size,
      linhasSemLiquidacao,
      linhasSemLancamento: semLancamento,
      vencimentosEncontrados: encontradosNumeros.size,
      vencimentosAusentes: ausentesNumeros.size,
      linhasIgnoradas: ignoradas,
      datasRejeitadas: datasRejeitadas.length,
    },
  }
}

/**
 * `Status` — calculado na LEITURA, nunca gravado (depende de "hoje").
 *
 * O legado usava `case_when(... TRUE ~ Tipo)`: um lançamento sem `Data_Final` caía no ramo final
 * e nascia como "Entrada"/"Saída", isto é, com cara de realizado. Aqui a ausência tem nome
 * próprio — `null` —, e quem exibe decide como mostrá-la.
 */
export function statusDoLancamento(
  tipo: string | null,
  dataFinal: string | null,
  hojeIso: string,
): string | null {
  if (tipo === null) return null
  if (dataFinal === null) return null
  if (dataFinal > hojeIso) {
    if (tipo === 'Entrada') return 'A Receber Futuro'
    if (tipo === 'Saída') return 'A Pagar Futuro'
  }
  return tipo
}

/**
 * A lista de operações DERIVADA de Vendas (`Produto = 'Contrato de casamento'`), aparada com
 * espaço interno colapsado. Substitui o `Lista de Operações.csv` curado à mão, que ficava fora do
 * repositório e onde um espaço duplo digitado deixava uma operação inteira de fora.
 */
export function operacoesDeVendas(
  vendas: readonly { produto: string | null; operacao_propria: string | null }[],
): string[] {
  const nomes = new Set<string>()
  for (const v of vendas) {
    if (v.produto !== 'Contrato de casamento') continue
    const nome = apertar(v.operacao_propria)
    if (nome !== '') nomes.add(nome)
  }
  return [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
