// Núcleo COMUM dos parsers de ingestão (Frente C da v6.0.0). Isomórfico: sem 'use client',
// sem import de Node/DB — o mesmo código roda no servidor (rota `/api/ingestao/{base}`) e no
// card de `/admin/uploads`.
//
// O que mora aqui é a regra que as cinco bases compartilham, e cada uma delas nasceu de um
// defeito real:
//
//  • **Aparar é EXPLÍCITO.** No legado em R a aparagem não estava no script — vinha do default
//    `trim_ws = TRUE` do `readxl`. A classificação `Setor Micro` de Vendas só funcionava por
//    causa desse default (17% dos `Produto` do cru têm espaço nas pontas). Regra de negócio
//    pendurada em default de biblioteca é regra invisível: some quando a biblioteca troca e
//    ninguém vê. Aqui ela é código, com sonda por mutante.
//  • **`\xa0`, tab e zero-width contam como espaço.** `Pessoa`/`Fornecedor`/`Descrição` do Monde
//    trazem espaço inquebrável. `String.prototype.trim()` JÁ remove `\xa0` e `\t`, mas NÃO
//    remove `​`/`﻿` — e é justamente o que não se vê que vira chave de junção quebrada.
//  • **Descoberta POSICIONAL de coluna, nunca mapa literal por posição.** No export do
//    Demonstrativo as colunas do cabeçalho não coincidem com as colunas dos dados (cabeçalho em
//    B,G,K,M,O; dados em A,C,D,H,I). Um parser que localizasse a coluna pelo índice do cabeçalho
//    leria coluna inteiramente vazia — e em silêncio.
//  • **Guarda de faixa de data.** O cru traz datas com ano 920, 1900, 1901, 2006 e 2049. O
//    `readxl` devolvia NA; o SheetJS devolve `Date` VÁLIDA (e deslocada um dia abaixo de 1900).
//    Data impossível nunca é convertida: o campo sai `null` e a ocorrência é CONTADA.
//
// Coerção numérica/data vem sempre do módulo canônico `@/lib/carga/coercao` — o lint
// `wt/no-coercao-reimpl` bloqueia reimplementação, e com razão (a versão ingênua lê "8.840,00"
// como 8,84).

import { toNum, toIsoDate, toCentavos } from '@/lib/carga/coercao'
import { normalizeHeader } from '@/lib/carga/vendas-parser'

export { normalizeHeader }

// ── Aparagem ────────────────────────────────────────────────────────────────────────────────

/** Espaço que NÃO é espaço: inquebrável, tab, zero-width, BOM, separadores Unicode.
 *  `\s` do JS já cobre ` ` e `\t`; `​`/`﻿` ele NÃO cobre. */
const ESPACO = '[\\s\\u00a0\\u200b\\u200c\\u200d\\ufeff]'
const PONTAS = new RegExp(`^${ESPACO}+|${ESPACO}+$`, 'g')
const INTERNO = new RegExp(`${ESPACO}+`, 'g')

/** Texto da célula com as pontas aparadas (inclui `\xa0`, tab e zero-width). */
export function aparar(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).replace(PONTAS, '')
}

/** Como `aparar`, mas célula vazia vira `null` — "não veio" e "veio vazio" são o mesmo fato aqui. */
export function apararOuNulo(v: unknown): string | null {
  const s = aparar(v)
  return s === '' ? null : s
}

/** `str_squish`: apara as pontas E colapsa espaço interno. Use em chave de junção digitada por
 *  humano (nome de operação), onde `"W -  Camila e Bruno"` e `"W - Camila e Bruno"` são a mesma
 *  coisa para quem digitou e coisas diferentes para o banco. */
export function apertar(v: unknown): string {
  return aparar(v).replace(INTERNO, ' ')
}

/** Célula sem conteúdo: nula, ausente, ou só espaço (inclusive invisível). */
export function ehVazio(v: unknown): boolean {
  return aparar(v) === ''
}

/** A célula é (ou parece) número? Usado para achar a linha de cabeçalho e a coluna de valor.
 *  Célula numérica nativa conta; texto conta se a coerção canônica o reconhecer. */
export function pareceNumero(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v)
  if (v instanceof Date) return false
  if (ehVazio(v)) return false
  return toNum(v) !== null
}

// ── Faixa de data (contrato §2.3 passo 5) ───────────────────────────────────────────────────

/** Nada anterior a isto é data real nesta plataforma — o Monde nasceu depois. */
export const DATA_MINIMA = '2015-01-01'
/** Quantos anos à frente de "hoje" ainda são plausíveis (parcela futura, título a vencer). */
export const ANOS_A_FRENTE = 5

/**
 * Limite superior da faixa, em ISO, a partir de um "hoje" injetável (o oráculo fixa o dia para
 * não depender de quando a suíte roda).
 *
 * ⚠️ O limite é o FIM DO ANO de `hoje + 5 anos`, não o mesmo dia daqui a cinco anos — e a
 * diferença não é cosmética. Medido no anexo de vencimento em aberto de 21/09: com o limite ao
 * DIA, nove títulos com vencimento em **2031-09-22** eram recusados por um único dia de folga, e
 * passariam a ser aceitos no dia seguinte. Uma guarda cujo veredito depende de QUANDO a carga
 * rodou transforma parcela longa legítima em campo nulo de forma intermitente — o pior tipo de
 * defeito, porque some quando se vai investigar.
 *
 * Com o limite no fim do ano, a faixa é estável dentro do ano e as anomalias reais continuam
 * caindo: no mesmo arquivo, 2049-12-31 (cinco células) e as emissões de 2002 e 2004 seguem
 * recusadas — os **7** casos que o briefing da versão previu para esta base.
 */
export function dataMaxima(hoje: Date = new Date()): string {
  return `${hoje.getUTCFullYear() + ANOS_A_FRENTE}-12-31`
}

/** Data ISO dentro de `[DATA_MINIMA, hoje + 5 anos]`? Comparação lexicográfica: `AAAA-MM-DD`
 *  ordena como string exatamente como ordena como data, e não passa por fuso nenhum. */
export function dataNaFaixa(iso: string, hoje?: Date): boolean {
  return iso >= DATA_MINIMA && iso <= dataMaxima(hoje)
}

/** Uma data recusada pela guarda de faixa. A linha PERMANECE na carga (o contrato §7 diz que a
 *  carga aplica e reporta); só o campo sai `null`, e a ocorrência é contada. */
export interface DataRejeitada {
  /** Índice da linha no arquivo, 1-based, contando o cabeçalho — é o que o humano vê no Excel. */
  readonly linha: number
  readonly campo: string
  /** O que estava na célula, como texto, para o humano procurar na origem. */
  readonly valor: string
}

/**
 * Lê uma célula de data pela coerção canônica e aplica a guarda de faixa.
 * Fora da faixa ⇒ devolve `null` e empurra a ocorrência em `rejeitadas` (nunca converte).
 */
export function lerData(
  v: unknown,
  campo: string,
  linha: number,
  rejeitadas: DataRejeitada[],
  hoje?: Date,
): string | null {
  if (ehVazio(v)) return null
  const iso = toIsoDate(v)
  if (iso === null) {
    // Data que a coerção canônica recusa de todo (o serial 0 do Excel e o que vem antes de 1900).
    // Registrar o `Date.toString()` cru encheria o log de "Sun Dec 31 1899 00:00:00 GMT-0306"; o
    // dia em UTC é o que o humano precisa para achar a célula na origem.
    const legivel = v instanceof Date && !Number.isNaN(v.getTime())
      ? v.toISOString().slice(0, 10)
      : aparar(v)
    rejeitadas.push({ linha, campo, valor: legivel })
    return null
  }
  if (!dataNaFaixa(iso, hoje)) {
    rejeitadas.push({ linha, campo, valor: iso })
    return null
  }
  return iso
}

// ── Checksums (contrato §4) ─────────────────────────────────────────────────────────────────

/**
 * Um checksum que o PRÓPRIO arquivo traz — linha de totais, linha de outline
 * `Grupo de Categoria : X (n, -R$ v)`, subtotal do pivot, Total Geral.
 *
 * Descartar essas linhas sem lê-las é jogar fora a prova que veio junto com o dado. Elas são
 * lidas ANTES de serem descartadas e conferidas contra o que o parser apurou.
 *
 * Dinheiro em CENTAVOS INTEIROS: comparar float com float por tolerância é como o legado em R
 * fazia (`abs(a-b) > 0.005`) e funciona, mas em JS a soma de 94 mil floats acumula erro visível
 * (o próprio cru traz `717710.739200002` onde o arquivo mostra `717.710,74`). Em inteiro não há
 * o que acumular. O arredondamento sai de `toCentavos`, que usa a MESMA regra do Postgres
 * (meio-para-longe-de-zero sobre a representação decimal) — `Math.round(v*100)` discorda dele em
 * todo meio-centavo negativo, e estas bases são majoritariamente negativas.
 */
export interface Checksum {
  /** Que nível do arquivo declarou isto: `'total-geral'`, `'grupo'`, `'categoria'`, `'arquivo'`… */
  readonly escopo: string
  /** Chave hierárquica a que o checksum se refere (`['Receitas', 'Receita de Vendas']`). */
  readonly chave: readonly string[]
  /** Qual grandeza soma — as bases com mais de uma soma por linha de totais (Vendas) usam isto. */
  readonly campo: string
  /** Contagem declarada pelo arquivo, quando ele a traz. */
  readonly linhasDeclaradas: number | null
  /** Soma declarada pelo arquivo, em centavos. */
  readonly centavosDeclarados: number | null
  readonly linhasApuradas: number
  /** Soma apurada a partir dos valores BRUTOS do arquivo, arredondada uma vez só — é assim que o
   *  subtotal declarado foi calculado na origem, e é contra isto que ele fecha. */
  readonly centavosApurados: number
  /** Soma dos valores JÁ ARREDONDADOS que a carga vai gravar. Difere do anterior em alguns
   *  centavos quando o cru traz mais de 2 casas; é o número que a RPC de promoção pode conferir
   *  contra a tabela depois do `INSERT`, já que lá só existe o valor arredondado. */
  readonly centavosArredondados?: number
}

/** Tolerância, em centavos, ao conferir um checksum. O contrato §4 dá 0,005 (meio centavo) para
 *  o Demonstrativo — sobre valores já arredondados a 2 casas isso é igualdade exata — e 0 para
 *  as demais. Fica parametrizado para a tolerância ser DECLARADA, não presumida. */
export const TOLERANCIA_CENTAVOS_PADRAO = 0

/** Um checksum que não fechou. */
export interface ChecksumFalho extends Checksum {
  readonly deltaCentavos: number
  readonly deltaLinhas: number
}

/** Separa os checksums que não fecham. Contagem `null` (o arquivo não declarou) não é conferida. */
export function checksumsFalhos(
  lista: readonly Checksum[],
  toleranciaCentavos: number = TOLERANCIA_CENTAVOS_PADRAO,
): ChecksumFalho[] {
  const falhos: ChecksumFalho[] = []
  for (const c of lista) {
    const deltaCentavos = c.centavosDeclarados === null ? 0 : c.centavosApurados - c.centavosDeclarados
    const deltaLinhas = c.linhasDeclaradas === null ? 0 : c.linhasApuradas - c.linhasDeclaradas
    if (Math.abs(deltaCentavos) > toleranciaCentavos || deltaLinhas !== 0) {
      falhos.push({ ...c, deltaCentavos, deltaLinhas })
    }
  }
  return falhos
}

/** Soma uma coluna de valores já arredondados a 2 casas, em centavos inteiros. */
export function somaCentavos(valores: readonly (number | null)[]): number {
  let c = 0
  for (const v of valores) c += v === null ? 0 : (toCentavos(v) ?? 0)
  return c
}

/** Escala do acumulador de valores brutos: décimo de milésimo de real (0,0001). */
const ESCALA_BRUTA = 10_000

/**
 * Acumulador para somar valores com MAIS de duas casas decimais sem carregar erro de float.
 *
 * Por que existe: o subtotal que o export declara (`Grupo de Categoria : X (n, -R$ 4.546.031,79)`)
 * é o arredondamento da soma dos valores EXATOS — e o cru traz valores com mais de 2 casas (o
 * próprio total do arquivo de movimentação é 717.710,7392). Somar linha a linha JÁ ARREDONDADO e
 * comparar com esse subtotal nunca fecha: a diferença é o arredondamento acumulado, medido entre
 * 1 e 6 centavos por grupo no anexo de 21/09. Arredondar UMA VEZ, no fim, fecha exato.
 *
 * O acumulador é inteiro (unidades de 0,0001 real) porque somar 94 mil floats acumula erro visível
 * — é o que produz `717710.739200002` no próprio arquivo.
 */
export class AcumuladorBruto {
  private unidades = 0
  private n = 0

  somar(valor: number | null): void {
    if (valor === null || !Number.isFinite(valor)) return
    this.unidades += Math.round(valor * ESCALA_BRUTA)
    this.n++
  }

  get linhas(): number { return this.n }

  /** Centavos, arredondados meio-para-longe-de-zero (a mesma regra do Postgres). */
  get centavos(): number {
    const emCentavos = this.unidades / 100
    return Math.sign(emCentavos) * Math.round(Math.abs(emCentavos))
  }
}

/** Valor monetário já arredondado a 2 casas — o que se envia passa a ser exatamente o que a
 *  coluna `NUMERIC(x,2)` vai guardar, sem a fronteira arredondar de novo por conta própria. */
export function valorEmReais(v: unknown): number | null {
  const c = toCentavos(v)
  return c === null ? null : c / 100
}

// ── Resultado do parse ──────────────────────────────────────────────────────────────────────

/** Códigos de rejeição do contrato §2.4 que nascem no parse. */
export type CodigoRejeicaoParse =
  | 'FORMATO_INVALIDO'
  | 'ESTRUTURA_INESPERADA'
  | 'CHECKSUM_FALHOU'

export interface ParseOk<T> {
  readonly ok: true
  readonly linhas: T[]
  readonly checksums: Checksum[]
  readonly datasRejeitadas: DataRejeitada[]
  /** O que o parser DESCOBRIU no arquivo (linha de cabeçalho, colunas de rótulo, níveis) —
   *  vai para o log da carga: sem isso, "o export mudou de forma" é indistinguível de bug. */
  readonly diagnostico: Record<string, unknown>
}

export interface ParseErro {
  readonly ok: false
  readonly codigo: CodigoRejeicaoParse
  readonly mensagem: string
  readonly detalhe?: unknown
}

export type Parse<T> = ParseOk<T> | ParseErro

export function erro(codigo: CodigoRejeicaoParse, mensagem: string, detalhe?: unknown): ParseErro {
  return { ok: false, codigo, mensagem, detalhe }
}

// ── Descoberta posicional de colunas ────────────────────────────────────────────────────────

/** Matriz de células do arquivo: linha 0 = a primeira linha física da planilha. */
export type Matriz = readonly (readonly unknown[])[]

/** Quantas colunas a matriz tem de fato (a linha mais larga). */
export function larguraDe(rows: Matriz): number {
  let n = 0
  for (const r of rows) if (r.length > n) n = r.length
  return n
}

/** Índice da última coluna com QUALQUER conteúdo. É assim que se acha a coluna de valor de um
 *  pivot, cujo rótulo ("Total Geral") não tem posição fixa. `-1` se não houver nenhuma. */
export function ultimaColunaComConteudo(rows: Matriz): number {
  let ultima = -1
  for (const r of rows) {
    for (let j = r.length - 1; j > ultima; j--) {
      if (!ehVazio(r[j])) { ultima = j; break }
    }
  }
  return ultima
}

/**
 * Colunas que carregam RÓTULO nas linhas de dado — não as do cabeçalho.
 * É a única forma correta de localizar a coluna de um pivot indentado: quem tem conteúdo nos
 * dados é quem manda. `ateColuna` é exclusivo (a coluna de valor fica de fora).
 */
export function colunasComConteudo(rows: Matriz, daLinha: number, ateColuna: number): number[] {
  const cols: number[] = []
  for (let j = 0; j < ateColuna; j++) {
    for (let i = daLinha; i < rows.length; i++) {
      if (!ehVazio(rows[i]?.[j])) { cols.push(j); break }
    }
  }
  return cols
}

/**
 * Linha de cabeçalho = a que tem MAIS células não-vazias e NÃO numéricas à esquerda da coluna
 * de valor. Não é a linha 0: o export do Demonstrativo traz título e linhas em branco antes.
 * Procura só nas primeiras `limite` linhas — cabeçalho no meio do arquivo não é cabeçalho.
 */
export function acharLinhaDeCabecalho(rows: Matriz, ateColuna: number, limite = 30): number {
  let melhor = 0
  let melhorCont = -1
  const ate = Math.min(limite, rows.length)
  for (let i = 0; i < ate; i++) {
    const r = rows[i] ?? []
    let cont = 0
    for (let j = 0; j < ateColuna; j++) {
      if (!ehVazio(r[j]) && !pareceNumero(r[j])) cont++
    }
    if (cont > melhorCont) { melhorCont = cont; melhor = i }
  }
  return melhor
}

/**
 * Guarda de FORMATO LARGO. No formato tidy só a coluna de valor concentra números (a de Ano
 * também, por serem anos). Muitas colunas numéricas ⇒ o export veio com campos na área de
 * COLUNAS do pivot, e o que se leria seria outra coisa com a mesma cara.
 * Devolve quantas colunas parecem numéricas.
 */
export function colunasNumericas(rows: Matriz, ateColuna: number, minimoCelulas = 5): number {
  let n = 0
  for (let j = 0; j < ateColuna; j++) {
    let num = 0
    for (const r of rows) {
      if (pareceNumero(r[j])) { num++; if (num >= minimoCelulas) break }
    }
    if (num >= minimoCelulas) n++
  }
  return n
}

/**
 * Casa os cabeçalhos do arquivo com um mapa `rótulo → campo`, por nome NORMALIZADO
 * (insensível a acento, caixa e espaço). Devolve, para cada campo, o índice da coluna.
 * Cabeçalho repetido fica com a PRIMEIRA ocorrência — e a repetição vai no diagnóstico.
 */
export function mapearColunas<C extends string>(
  cabecalhos: readonly unknown[],
  mapa: Readonly<Record<string, C>>,
): { indices: Partial<Record<C, number>>; naoMapeados: string[] } {
  const normalizado = new Map<string, C>()
  for (const [rotulo, campo] of Object.entries(mapa)) normalizado.set(normalizeHeader(rotulo), campo)

  const indices: Partial<Record<C, number>> = {}
  const naoMapeados: string[] = []
  cabecalhos.forEach((h, j) => {
    const texto = aparar(h)
    if (texto === '') return
    const campo = normalizado.get(normalizeHeader(texto))
    if (campo === undefined) { naoMapeados.push(texto); return }
    if (indices[campo] === undefined) indices[campo] = j
  })
  return { indices, naoMapeados }
}

/** Campos exigidos que o cabeçalho não trouxe. Coluna que some em silêncio já custou caro
 *  (`Data Início` na v4.9, `Operação Própria` na v4.9.1). */
export function camposFaltando<C extends string>(
  indices: Partial<Record<C, number>>,
  obrigatorios: readonly C[],
): C[] {
  return obrigatorios.filter((c) => indices[c] === undefined)
}
