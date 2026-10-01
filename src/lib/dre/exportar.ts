// ── Export do DRE para Excel — montagem das matrizes (v6.1.1 · M4) — módulo PURO ──
//
// Recebe as MESMAS entradas que a tabela (`tabela-dre.tsx`) recebe e devolve as abas como
// matrizes de células (AOA), sem DOM e sem a lib de planilha. O componente só chama
// `aoa_to_sheet` sobre o resultado e dispara o download — por isso tudo o que importa
// (quais linhas, quais colunas, qual número) é testável no vitest.
//
// ── Contrato (decisão do Yan, v6.1.1) ────────────────────────────────────────────
//  · SEMPRE DUAS ABAS, qualquer que seja a visão ativa na tela:
//      "Mensal"      — colunas da visão Mensal para o ANO em tela e o modo atual;
//      "Consolidado" — colunas da visão Consolidado para os ANOS marcados e o modo atual.
//  · TODAS as linhas, independente do que está recolhido: blocos, subtotais, totalizadores,
//    TODAS as categorias de todos os blocos e a bandeja "Não classificadas" (quando há
//    itens), na ordem da tela. O estado `abertos` da tela NÃO é entrada — não há como ele
//    esconder linha aqui.
//  · MESMA FONTE da tela: cabeçalhos, valores e AV saem das funções de
//    `./colunas-tabela` e `./av` (as mesmas que a tabela chama). Nada é recalculado por
//    fora. A única conta nova é a conversão de unidade do percentual (abaixo).
//
// ── Decisões de produto/técnicas dentro do contrato (declaradas, não óbvias) ─────
//  1. TOGGLES DE COLAPSO SÃO ESTADO DE TELA, TAL QUAL `abertos`. O previsto recolhido
//     (««») e os anos seguintes fechados (»») NÃO limitam a planilha: ela sai com o
//     previsto ABERTO e com os anos seguintes INCLUÍDOS. O que a tela esconde por MODO
//     (Realizado × Realizado + Previsto) continua escondido — o modo é escolha de
//     conteúdo, o toggle é só de leiaute.
//  2. NÚMERO É NÚMERO. Valor sai como célula numérica (`t:'n'`) com formato `z`; nunca
//     texto formatado — a planilha precisa somar, ordenar e refazer a conta.
//  3. AUSÊNCIA ≠ ZERO. `null`/`undefined` (a conta não existia naquele ano, AV sem base,
//     Δ% sobre zero) vira célula VAZIA. Zero é informação e sai como `0`. (Mesma regra de
//     `valorCons` e de `src/lib/patrimonio/csv.ts`.)
//  4. PERCENTUAL = FRAÇÃO + formato `0.0%`. `avPercentual`/`deltaYtd` devolvem pontos
//     percentuais (7,9 = 7,9%); a célula guarda 0,079 com `z: '0.0%'` para o Excel
//     mostrar "7,9%" e poder somar/comparar. A divisão por 100 é conversão de unidade,
//     feita num lugar só (`pct`). AV e Δ% seguem a MESMA convenção.
//  5. HIERARQUIA NO RÓTULO. A planilha não leva estilo, então o recuo é textual:
//     categoria com 4 espaços, subgrupo com 2, bloco/resultado sem recuo.
//  6. GUARDA ANTI-FÓRMULA. Rótulo cujo texto começa com `= + - @` (ou tab/CR) ganha um
//     apóstrofo na frente. A guarda é aplicada ao rótulo ANTES do recuo (o espaço do recuo
//     a neutralizaria no teste sem neutralizar nada de fato). ⚠️ Em `.xlsx` a célula de
//     texto (`t:'s'`) nunca vira fórmula, e o apóstrofo aparece LITERALMENTE — o quote
//     prefix do Excel é estilo, não caractere. A guarda protege quem reexporta a planilha
//     para CSV; o custo é o apóstrofo visível nos rótulos que começam assim (ex.:
//     "= LUCRO BRUTO", se ainda existir gravado desse jeito).
//  7. RÓTULO CRU. A coluna Conta leva `linha.rotulo` como a tela mostra (prefixo contábil
//     incluso), acrescido de " *" quando `estrela` (nota da controladoria, que a tela
//     mostra como sobrescrito).

import {
  ehMesParcial, SUF_PARCIAL, type MesParcial,
} from './mes-parcial'
import {
  avPercentual, baseAv, linhaBaseAv, indiceBaseAv, CHAVE_BASE_AV,
} from './av'
import { chaveDeLinha, chaveDeBandeja } from './identidade'
import {
  construirValores, recortarPrevisto, rotulosMensais, idxPrevistoDe, modoPrevistoDe,
  rotuloTotalAno, totalDoAno, valorCons, deltaYtd, montarColunasCons, janelaTextoDe,
  type AnoSeguinteDados, type TotalModo, type ColunaCons,
} from './colunas-tabela'
import type { DreLinha, DreMensalLike, ConsolidadoAno, RegistroAnoLinha } from './schemas'

// ── Tipos da saída ───────────────────────────────────────────────────────────────

/** Célula numérica no formato que `aoa_to_sheet` aceita como célula pronta. */
export interface CelulaNumero {
  t: 'n'
  v: number
  /** Código de formato numérico do Excel. */
  z: string
}

/** `null` = célula VAZIA (a lib pula `null`). Texto sai como `string`. */
export type Celula = string | CelulaNumero | null

export interface AbaExportacao {
  nome: string
  linhas: Celula[][]
  /** Largura de cada coluna em caracteres (`wch`). */
  larguras: number[]
}

export type RegimeExportacao = 'competencia' | 'caixa'

export interface ExportacaoDre {
  regime: RegimeExportacao
  abas: AbaExportacao[]
}

/** Formato monetário: milhar, 2 casas, negativo entre parênteses (a convenção contábil
 *  da tela). Código neutro — o Excel pt-BR o exibe com ponto de milhar e vírgula. */
export const FMT_MOEDA = '#,##0.00;(#,##0.00)'
/** Formato percentual com 1 casa (a mesma precisão da tela). A célula guarda FRAÇÃO. */
export const FMT_PCT = '0.0%'

export const NOME_ABA_MENSAL = 'Mensal'
export const NOME_ABA_CONSOLIDADO = 'Consolidado'

// ── Entrada ──────────────────────────────────────────────────────────────────────

export interface EntradaExportacaoDre {
  /** Título do card ("Demonstrativo de Resultado por Competência" / ...Fluxo de Caixa). */
  titulo: string
  /** Regime SEM previsto (competência) — trava o modo em 'realizado' e liga o sufixo de
   *  mês parcial nos cabeçalhos, como na tela. */
  semPrevisto: boolean
  /** Payload do ano em tela (`get_dre_mensal`/competência já validado). */
  dados: DreMensalLike
  /** Ano resolvido pela página (o mesmo `ano` que a tela usa — não `dados.ano`). */
  ano: number
  /** Modo EFETIVO (já com `semPrevisto` aplicado). */
  totalModo: TotalModo
  anosSeguintes: AnoSeguinteDados[]
  /** Todos os anos carregados (alimenta o `porLinha` do Consolidado). */
  consolidadoAnos: ConsolidadoAno[]
  /** Anos MARCADOS, seleção EFETIVA, ascendente (nunca o Set cru da tela). */
  anosCons: ConsolidadoAno[]
  mesJanela: number
  mesParcial: MesParcial | null
  /** 'AAAA-MM-DD' — `hojeSP()` no call-site (injetado para o módulo seguir puro). */
  geradoEm: string
}

// ── Células ──────────────────────────────────────────────────────────────────────

/** Número → célula numérica; `null`/`undefined`/não-finito → VAZIA (ausência ≠ 0). */
function num(v: number | null | undefined, z: string = FMT_MOEDA): Celula {
  if (v == null || !Number.isFinite(v)) return null
  return { t: 'n', v, z }
}

/** Percentual em PONTOS (7,9) → fração (0,079) com formato `0.0%`. Único lugar da
 *  conversão de unidade — ver decisão 4 no topo. */
function pct(pontos: number | null | undefined): Celula {
  if (pontos == null || !Number.isFinite(pontos)) return null
  return { t: 'n', v: pontos / 100, z: FMT_PCT }
}

/** Texto que o Excel poderia tomar por fórmula (e o CSV reexportado também). */
const INICIO_PERIGOSO = /^[=+\-@\t\r]/

/** Guarda anti-fórmula de um texto de rótulo — ver decisão 6 no topo. */
export function rotuloSeguro(texto: string): string {
  return INICIO_PERIGOSO.test(texto) ? `'${texto}` : texto
}

const RECUO: Record<DreLinha['t'], string> = {
  blocoH: '',
  sub: '  ',
  tot: '',
  cat: '    ',
}

/** Rótulo da coluna Conta: guarda aplicada ao rótulo, depois o recuo da hierarquia. */
function rotuloConta(l: Pick<DreLinha, 'rotulo' | 'estrela' | 't'>): string {
  const base = l.estrela ? `${l.rotulo} *` : l.rotulo
  return RECUO[l.t] + rotuloSeguro(base)
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' — date PURO (sem fuso): split é seguro aqui. */
function dataBR(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}/${a}` : iso
}

function rotuloModo(semPrevisto: boolean, totalModo: TotalModo): string {
  return !semPrevisto && totalModo === 'tudo' ? 'Realizado + Previsto' : 'Realizado'
}

/** Largura de coluna por rótulo: Conta larga, AV estreita, o resto na régua dos valores. */
function larguraDe(rotulo: string, indice: number): number {
  if (indice === 0) return 58
  if (rotulo === 'AV') return 9
  return 17
}

function larguras(cabecalho: string[]): number[] {
  return cabecalho.map((r, i) => larguraDe(r, i))
}

/** Bloco de título no topo de cada aba: título · descrição do recorte · linha em branco. */
function blocoTitulo(titulo: string, recorte: string, geradoEm: string): Celula[][] {
  return [
    [titulo],
    [`${recorte} · valores em R$ · gerado em ${dataBR(geradoEm)}`],
    [],
  ]
}

// ── Aba Mensal ───────────────────────────────────────────────────────────────────

function abaMensal(e: EntradaExportacaoDre): AbaExportacao {
  const { relacao, mes_corrente: mesCorrente, linhas, bandeja } = e.dados
  const { totalModo, semPrevisto } = e
  const soRealizado = totalModo === 'realizado'
  const incluirPrevCorrente = !soRealizado

  // Previsto SEMPRE aberto (decisão 1): o toggle de colapso é estado de tela.
  const idxPrevisto = idxPrevistoDe(relacao, mesCorrente)
  const modoPrevisto = modoPrevistoDe(totalModo, relacao, true)
  const rotulosMes = rotulosMensais(relacao, mesCorrente, incluirPrevCorrente, modoPrevisto, idxPrevisto)
    .map((m, i) => {
      // Mês parcial (decisão 14, v6.0.0): índice → mês REAL só vale sem previsto, onde não
      // existe a coluna híbrida ·REAL/·PREV — a mesma premissa e o mesmo gate duplo da tela.
      const parcial = semPrevisto && ehMesParcial(e.mesParcial, e.ano, i + 1)
      return parcial ? `${m}${SUF_PARCIAL}` : m
    })

  // Anos seguintes: projeção pura, somem no modo 'realizado'; o toggle NÃO limita.
  const anosSeg = soRealizado ? [] : e.anosSeguintes

  const cabecalho = [
    'Conta',
    ...rotulosMes,
    rotuloTotalAno(totalModo, relacao),
    'AV',
    ...anosSeg.flatMap(a => [String(a.ano), 'AV']),
  ]

  // Base da AV: a Receita Bruta pelo MESMO `totalDoAno` das demais linhas (numerador e
  // denominador no mesmo recorte).
  const linhaBase = linhaBaseAv(linhas)
  const baseAvMensal = baseAv(
    linhaBase ? totalDoAno(linhaBase.meses, linhaBase.total, totalModo, relacao, mesCorrente) : null,
  )
  const idxBaseAv = indiceBaseAv(linhas)

  const valoresDe = (meses: number[], prevCorrente: number | null | undefined) =>
    recortarPrevisto(
      construirValores(meses, prevCorrente, relacao, mesCorrente, incluirPrevCorrente),
      modoPrevisto,
      idxPrevisto,
    )

  const corpo: Celula[][] = linhas.map((l, i) => {
    const avPermitida = idxBaseAv >= 0 && i >= idxBaseAv
    const chave = chaveDeLinha(l)
    // O MESMO número que a célula de total exibe — a AV comenta o que está na tela.
    const totalExibido = totalDoAno(l.meses, l.total, totalModo, relacao, mesCorrente)
    return [
      rotuloConta(l),
      ...valoresDe(l.meses, l.prev_corrente).map(v => num(v)),
      num(totalExibido),
      pct(avPermitida ? avPercentual(totalExibido, baseAvMensal) : null),
      ...anosSeg.flatMap(a => {
        const v = chave != null ? (a.totais[chave] ?? null) : null
        // Base do ANO SEGUINTE: a Receita Bruta DAQUELE ano, nunca a do ano em tela.
        const av = avPermitida ? avPercentual(v, baseAv(a.totais[`b:${CHAVE_BASE_AV}`] ?? null)) : null
        return [num(v), pct(av)]
      }),
    ]
  })

  const faixaBandeja: Celula[][] = bandeja.length === 0 ? [] : [
    [`Não classificadas (${bandeja.length})`],
    ...bandeja.map((b): Celula[] => {
      const chave = chaveDeBandeja(b)
      return [
        `  ${rotuloSeguro(b.rotulo)}`,
        ...valoresDe(b.meses, b.prev_corrente).map(v => num(v)),
        num(totalDoAno(b.meses, b.total, totalModo, relacao, mesCorrente)),
        // AV da bandeja: sempre vazia — a órfã não compõe a base (mesma decisão da tela).
        null,
        ...anosSeg.flatMap(a => [num(a.totais[chave] ?? null), null]),
      ]
    }),
  ]

  const recorte = `Mensal · ano ${e.ano} · modo ${rotuloModo(semPrevisto, totalModo)}`
  return {
    nome: NOME_ABA_MENSAL,
    linhas: [...blocoTitulo(e.titulo, recorte, e.geradoEm), cabecalho, ...corpo, ...faixaBandeja],
    larguras: larguras(cabecalho),
  }
}

// ── Aba Consolidado ──────────────────────────────────────────────────────────────

type PorAno = Map<number, Record<string, RegistroAnoLinha>>

function abaConsolidado(e: EntradaExportacaoDre): AbaExportacao {
  const { linhas, bandeja } = e.dados
  const { totalModo, semPrevisto, anosCons } = e

  if (anosCons.length === 0) {
    // Nenhum ano carregou (a pill "Consolidado" fica desabilitada na tela). A aba existe
    // — o contrato é de duas abas sempre — e diz por que está vazia.
    const recorte = `Consolidado · modo ${rotuloModo(semPrevisto, totalModo)}`
    return {
      nome: NOME_ABA_CONSOLIDADO,
      linhas: [
        ...blocoTitulo(e.titulo, recorte, e.geradoEm),
        ['Comparativo indisponível — nenhum ano pôde ser carregado.'],
      ],
      larguras: [58],
    }
  }

  const soRealizado = totalModo === 'realizado'
  const janelaTexto = janelaTextoDe(e.mesJanela)
  const colunas: ColunaCons[] = montarColunasCons(anosCons, janelaTexto, totalModo)
  const porAno: PorAno = new Map(e.consolidadoAnos.map(c => [c.ano, c.porLinha]))
  const ref = anosCons[anosCons.length - 1]

  // Mesma regra de `anosSegCons` na tela: só no modo 'tudo', só se a referência é o ano
  // corrente, só os que vêm DEPOIS dela. O toggle »» NÃO limita (decisão 1). Aqui, ao
  // contrário da Mensal, o ano seguinte NÃO tem coluna de AV — como na tela.
  const anosSeg = !soRealizado && ref.corrente
    ? e.anosSeguintes.filter(a => a.ano > ref.ano)
    : []

  const cabecalho = ['Conta', ...colunas.map(c => c.rotulo), ...anosSeg.map(a => String(a.ano))]
  const idxBaseAv = indiceBaseAv(linhas)

  const celulaDe = (
    c: ColunaCons,
    reg: (ano: number) => RegistroAnoLinha | undefined,
    avPermitida: boolean,
    ehBandeja: boolean,
  ): Celula => {
    if (c.k === 'delta') return pct(deltaYtd(valorCons(reg(c.de), 'ytd'), valorCons(reg(c.para), 'ytd')))
    if (c.k === 'av') {
      if (ehBandeja || !avPermitida) return null
      const base = baseAv(valorCons(porAno.get(c.ano)?.[`b:${CHAVE_BASE_AV}`], c.campo))
      return pct(avPercentual(valorCons(reg(c.ano), c.campo), base))
    }
    return num(valorCons(reg(c.ano), c.campo))
  }

  const corpo: Celula[][] = linhas.map((l, i) => {
    const avPermitida = idxBaseAv >= 0 && i >= idxBaseAv
    const chave = chaveDeLinha(l)
    const reg = (ano: number) => (chave === null ? undefined : porAno.get(ano)?.[chave])
    return [
      rotuloConta(l),
      ...colunas.map(c => celulaDe(c, reg, avPermitida, false)),
      ...anosSeg.map(a => num(chave !== null ? (a.totais[chave] ?? null) : null)),
    ]
  })

  const faixaBandeja: Celula[][] = bandeja.length === 0 ? [] : [
    [`Não classificadas (${bandeja.length})`],
    ...bandeja.map((b): Celula[] => {
      const chave = chaveDeBandeja(b)
      const reg = (ano: number) => porAno.get(ano)?.[chave]
      return [
        `  ${rotuloSeguro(b.rotulo)}`,
        ...colunas.map(c => celulaDe(c, reg, false, true)),
        ...anosSeg.map(a => num(a.totais[chave] ?? null)),
      ]
    }),
  ]

  const anosTxt = anosCons.map(c => c.ano).join(', ')
  const recorte = `Consolidado · anos ${anosTxt} · YTD ${janelaTexto} · modo ${rotuloModo(semPrevisto, totalModo)}`
  return {
    nome: NOME_ABA_CONSOLIDADO,
    linhas: [...blocoTitulo(e.titulo, recorte, e.geradoEm), cabecalho, ...corpo, ...faixaBandeja],
    larguras: larguras(cabecalho),
  }
}

// ── API ──────────────────────────────────────────────────────────────────────────

/** Monta a planilha do DRE: as duas abas, sempre, com todas as linhas expandidas. */
export function montarExportacaoDre(e: EntradaExportacaoDre): ExportacaoDre {
  return {
    regime: e.semPrevisto ? 'competencia' : 'caixa',
    abas: [abaMensal(e), abaConsolidado(e)],
  }
}

/** Nome do arquivo, sem acento: `dre-competencia-2026-2026-10-01.xlsx` /
 *  `dre-caixa-<ano>-<AAAA-MM-DD>.xlsx`. O ano é o da aba Mensal (o ano em tela). */
export function nomeArquivoExportacao(regime: RegimeExportacao, ano: number, geradoEm: string): string {
  return `dre-${regime}-${ano}-${geradoEm}.xlsx`
}
