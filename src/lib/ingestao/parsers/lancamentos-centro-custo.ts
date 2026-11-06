// Parser do CRU de "Lançamentos por Centro de Custo" do Monde — base `lancamentos-centro-custo`
// (v6.5.1 / M2) → `raw.lancamentos_centro_custo`. Contrato: docs/specs/v6-5-1-m2-base-centro-custo.md.
//
// ── O formato (medido no export de 06/11/2026) ──────────────────────────────────────────────
// Uma aba, cabeçalho na linha 1, 12 colunas: Pessoa · (vazia) · Descrição · Valor Lançamento ·
// % Centro Custo · Valor Centro Custo · Número · Emissão · Vencimento · Movimentação ·
// Centro de Custo · Valor Movimentação. O rótulo "Pessoa" está na coluna A e o dado na B (recuo do
// outline) — irrelevante aqui, porque Pessoa NÃO é lida. As colunas lidas são achadas por NOME
// normalizado no cabeçalho (nunca vetor posicional).
//
// O arquivo é um OUTLINE do Excel, um grupo por centro de custo:
//     col. A = "-" (aberto) ou "+" (recolhido) · col. B = "Centro de Custo :  X (2980, R$ 1.325.290,56)"
// seguido das linhas de DETALHE (uma por lançamento×centro) e de uma linha de SUBTOTAL. No fim há
// uma linha de TOTAL que soma `Valor Movimentação` repetido por centro — NÃO serve de checksum.
// Nome vazio no outline = grupo SEM centro.
//
// ── Decisões ────────────────────────────────────────────────────────────────────────────────
//  • **Checksum = o outline** (contagem + Σ de `Valor Centro Custo` com o SINAL de `Valor
//    Movimentação`), um por grupo, tolerância zero, apurado no BRUTO (`AcumuladorBruto`).
//  • **Grupo recolhido ("+") REJEITA a carga** (D4), mesmo que o checksum fechasse: o rateio é
//    regenerado inteiro a cada carga, e um centro ausente do raw viraria peso errado em silêncio.
//  • **`Valor Centro Custo` vem SEM sinal** no arquivo (0 negativos em 21.144); o sinal é o de
//    `Valor Movimentação`. Negativo no arquivo ⇒ a convenção mudou ⇒ rejeita.
//  • **`Número` é TEXTO** (inclui sufixo `-N`): lido como string, nunca como número.
//  • **`% Centro Custo`** na escala 0–100, como vem; vazio = null (lançamento de valor líquido zero).
//  • **Lista fechada (D6):** só as 8 colunas do COL_MAP viram campo. Pessoa, Descrição e Valor
//    Lançamento nunca; nenhuma mensagem de erro reproduz conteúdo de linha além de Número e nome de
//    centro (o arquivo real carrega nomes de pessoas).
//  • Datas passam pela guarda de faixa (errata 1): fora dela o campo sai null e a linha permanece.

import {
  aparar, apararOuNulo, ehVazio, normalizeHeader, valorEmReais, lerData,
  AcumuladorBruto, mapearColunas, camposFaltando, checksumsFalhos, erro,
  type Matriz, type Checksum, type DataRejeitada, type Parse,
} from './comum'
import { toNum, toCentavos } from '@/lib/carga/coercao'

export interface LancamentoCentroCustoCru {
  /** 1-based, contando o cabeçalho (o que o humano vê no Excel). */
  readonly linha_origem: number
  /** Texto inteiro, com sufixo `-N` se houver. */
  readonly numero: string
  readonly emissao: string | null
  readonly vencimento: string | null
  readonly movimentacao: string | null
  /** Nome aparado; `null` = lançamento sem centro. */
  readonly centro_custo: string | null
  /** Escala 0–100, como vem; vazio = null. */
  readonly pct_centro: number | null
  /** 2 casas. */
  readonly valor_movimentacao: number
  /** 2 casas, COM o sinal de `valor_movimentacao`. */
  readonly valor_centro_custo: number
}

type Campo =
  | 'numero' | 'emissao' | 'vencimento' | 'movimentacao' | 'centro_custo'
  | 'pct_centro' | 'valor_movimentacao' | 'valor_centro_custo'

export const COL_MAP: Readonly<Record<string, Campo>> = {
  'Número':              'numero',
  'Numero':              'numero',
  'Emissão':             'emissao',
  'Vencimento':          'vencimento',
  'Movimentação':        'movimentacao',
  'Centro de Custo':     'centro_custo',
  '% Centro Custo':      'pct_centro',
  'Valor Centro Custo':  'valor_centro_custo',
  'Valor Movimentação':  'valor_movimentacao',
}

/** Todos os oito são exigidos: sem qualquer um a base não tem significado (o rateio e o ano do
 *  fluxo dependem de cada um). */
export const OBRIGATORIOS: readonly Campo[] = [
  'numero', 'emissao', 'vencimento', 'movimentacao', 'centro_custo',
  'pct_centro', 'valor_movimentacao', 'valor_centro_custo',
]

const CAMPOS_DATA = ['emissao', 'vencimento', 'movimentacao'] as const

/** Linha de outline: "Centro de Custo :  WG - Corp (2980, R$ 1.325.290,56)". O nome pode ser vazio
 *  (grupo sem centro) e o valor vem com ou sem sinal ("-R$ …"). */
const RE_OUTLINE = /^Centro de Custo\s*:\s*(.*?)\s*\((\d+),\s*(-?\s*R?\$?[\d.,\s-]+)\)$/
const RE_PREFIXO_OUTLINE = /^Centro de Custo\s*:/

/** Quantas colunas do começo podem conter o marcador/texto do outline. */
const MAX_COLUNAS_DE_RECUO = 3

interface Outline {
  /** `''` = grupo sem centro. */
  readonly nome: string
  readonly linhas: number
  readonly centavos: number
}

const rotulo = (nome: string): string => (nome === '' ? '(sem centro)' : `"${nome}"`)
const semMenosZero = (n: number): number => (n === 0 ? 0 : n)

function lerOutline(texto: string): Outline | null {
  const m = RE_OUTLINE.exec(texto)
  if (!m) return null
  const centavos = toCentavos(m[3].replace(/R\$/g, '').trim())
  if (centavos === null) return null
  return { nome: aparar(m[1]), linhas: Number(m[2]), centavos }
}

/**
 * Lê a matriz do cru de Lançamentos por Centro de Custo e devolve as linhas de detalhe + um
 * checksum por grupo do outline.
 */
export function parseLancamentosCentroCustoRows(
  rows: Matriz,
  opcoes: { hoje?: Date } = {},
): Parse<LancamentoCentroCustoCru> {
  if (rows.length < 2) return erro('FORMATO_INVALIDO', 'Planilha vazia ou sem linhas de dado.')

  const { indices, naoMapeados } = mapearColunas<Campo>(rows[0] ?? [], COL_MAP)
  const faltando = camposFaltando(indices, OBRIGATORIOS)
  if (faltando.length > 0) {
    return erro('ESTRUTURA_INESPERADA',
      `O cabeçalho do export não traz: ${faltando.join(', ')}. Confira se o relatório exportado é ` +
      '"Lançamentos por Centro de Custo".',
      { faltando, naoMapeados })
  }
  const col = indices as Readonly<Record<Campo, number>>

  // ── Passo 1: as linhas de OUTLINE — estado (aberto/recolhido) e checksum declarado ────────
  // Antes de qualquer linha de dado: grupo recolhido rejeita a carga inteira, com ou sem linhas
  // de detalhe presentes.
  const outlinePorLinha = new Map<number, Outline>()
  const vistos = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    const linha = rows[i] ?? []
    if (!ehVazio(linha[col.numero])) continue   // linha de dado nunca é outline
    for (let j = 0; j < MAX_COLUNAS_DE_RECUO; j++) {
      const v = linha[j]
      if (typeof v !== 'string') continue
      const t = aparar(v)
      if (!RE_PREFIXO_OUTLINE.test(t)) continue
      const lido = lerOutline(t)
      if (lido === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: linha de outline em formato não reconhecido — "${t}". O checksum que o ` +
          'arquivo declara não pode ser lido, e sem ele a carga perde a conferência independente.',
          { linha: i + 1, texto: t })
      }
      const estado = j > 0 ? aparar(linha[0]) : ''
      if (estado === '+') {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: o grupo ${rotulo(lido.nome)} está RECOLHIDO no arquivo. Exporte de novo com ` +
          'TODOS os grupos de centro de custo abertos (expandidos) — um grupo recolhido faria o rateio ' +
          'ser calculado sem aquele centro.',
          { linha: i + 1, centro: lido.nome })
      }
      if (estado !== '-') {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: o grupo ${rotulo(lido.nome)} não traz o marcador de aberto ("-") esperado ` +
          'na primeira coluna. O formato do export mudou.',
          { linha: i + 1, centro: lido.nome })
      }
      if (vistos.has(lido.nome)) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: o grupo ${rotulo(lido.nome)} aparece mais de uma vez no arquivo.`,
          { linha: i + 1, centro: lido.nome })
      }
      vistos.add(lido.nome)
      outlinePorLinha.set(i, lido)
      break
    }
  }
  if (outlinePorLinha.size === 0) {
    return erro('ESTRUTURA_INESPERADA',
      'Nenhuma linha de grupo "Centro de Custo : …" encontrada. Confira se o relatório exportado é ' +
      '"Lançamentos por Centro de Custo", com os grupos abertos.')
  }

  // ── Passo 2: as linhas de dado ────────────────────────────────────────────────────────────
  const linhas: LancamentoCentroCustoCru[] = []
  /** Valor BRUTO (com sinal) de cada linha, na mesma ordem de `linhas` — só para os checksums. */
  const brutos: number[] = []
  const datasRejeitadas: DataRejeitada[] = []
  let ignoradas = 0
  let corrente: Outline | null = null

  // Colunas que uma linha de subtotal/total pode preencher (só valores). "Valor Lançamento" não é
  // campo gravado, mas o cabeçalho é consultado só para saber que ali um total é esperado.
  const colunasDeValor = new Set<number>([col.valor_centro_custo, col.valor_movimentacao])
  ;(rows[0] ?? []).forEach((h, j) => {
    if (normalizeHeader(aparar(h)) === 'valor lancamento') colunasDeValor.add(j)
  })

  for (let i = 1; i < rows.length; i++) {
    const linha = rows[i] ?? []
    const outline = outlinePorLinha.get(i)
    if (outline !== undefined) { corrente = outline; continue }

    const numero = apararOuNulo(linha[col.numero])
    if (numero === null) {
      // Subtotal/total: só células de valor. Qualquer outra linha com conteúdo é contada.
      const soValores = linha.every((c, j) => ehVazio(c) || colunasDeValor.has(j))
      if (!soValores && !linha.every((c) => ehVazio(c))) ignoradas++
      continue
    }

    if (corrente === null) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: lançamento ${numero} antes de qualquer grupo "Centro de Custo : …".`,
        { linha: i + 1, numero })
    }
    const centro = apararOuNulo(linha[col.centro_custo])
    if ((centro ?? '') !== corrente.nome) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: lançamento ${numero} com centro ${rotulo(centro ?? '')} dentro do grupo ` +
        `${rotulo(corrente.nome)}. O aninhamento do export não é o esperado.`,
        { linha: i + 1, numero })
    }

    const brutoMov = toNum(linha[col.valor_movimentacao])
    const valorMov = valorEmReais(brutoMov)
    if (brutoMov === null || valorMov === null) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: lançamento ${numero} sem Valor Movimentação legível. Linha com conteúdo que ` +
        'não fecha um registro não é pulada em silêncio.',
        { linha: i + 1, numero })
    }
    const brutoCentro = toNum(linha[col.valor_centro_custo])
    if (brutoCentro === null) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: lançamento ${numero} sem Valor Centro Custo legível.`,
        { linha: i + 1, numero })
    }
    if (brutoCentro < 0) {
      return erro('ESTRUTURA_INESPERADA',
        `Linha ${i + 1}: lançamento ${numero} com Valor Centro Custo NEGATIVO. O export traz esse valor ` +
        'sem sinal (o sinal é o de Valor Movimentação); a convenção do relatório mudou e a carga não ' +
        'pode seguir sem revisão.',
        { linha: i + 1, numero })
    }
    // Sinal = o de Valor Movimentação.
    const comSinal = brutoMov < 0 ? -brutoCentro : brutoCentro
    const valorCentro = valorEmReais(comSinal)
    if (valorCentro === null) {
      return erro('ESTRUTURA_INESPERADA', `Linha ${i + 1}: lançamento ${numero} sem valor legível.`,
        { linha: i + 1, numero })
    }

    let pct: number | null = null
    if (!ehVazio(linha[col.pct_centro])) {
      pct = toNum(linha[col.pct_centro])
      if (pct === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: lançamento ${numero} com % Centro Custo ilegível.`,
          { linha: i + 1, numero })
      }
    }

    const datas: Record<string, string | null> = {}
    for (const campo of CAMPOS_DATA) {
      datas[campo] = lerData(linha[col[campo]], campo, i + 1, datasRejeitadas, opcoes.hoje)
    }

    linhas.push({
      linha_origem: i + 1,
      numero,
      emissao: datas.emissao,
      vencimento: datas.vencimento,
      movimentacao: datas.movimentacao,
      centro_custo: centro,
      pct_centro: pct,
      valor_movimentacao: semMenosZero(valorMov),
      valor_centro_custo: semMenosZero(valorCentro),
    })
    brutos.push(comSinal)
  }

  if (linhas.length === 0) {
    return erro('ESTRUTURA_INESPERADA', 'Nenhuma linha de lançamento encontrada no arquivo.')
  }

  // ── Checksums: cada outline fecha com as linhas que ele cobre? ───────────────────────────
  interface Apurado { acc: AcumuladorBruto; arredondados: number }
  const porCentro = new Map<string, Apurado>()
  linhas.forEach((l, i) => {
    const chave = l.centro_custo ?? ''
    const a = porCentro.get(chave) ?? { acc: new AcumuladorBruto(), arredondados: 0 }
    a.acc.somar(brutos[i])
    a.arredondados += toCentavos(l.valor_centro_custo) ?? 0
    porCentro.set(chave, a)
  })

  const checksums: Checksum[] = []
  const centros: { nome: string; linhas: number }[] = []
  for (const o of outlinePorLinha.values()) {
    const a = porCentro.get(o.nome) ?? { acc: new AcumuladorBruto(), arredondados: 0 }
    checksums.push({
      escopo: 'centro', chave: [o.nome], campo: 'valor_centro_custo',
      linhasDeclaradas: o.linhas, centavosDeclarados: o.centavos,
      linhasApuradas: a.acc.linhas, centavosApurados: a.acc.centavos,
      centavosArredondados: a.arredondados,
    })
    centros.push({ nome: o.nome, linhas: a.acc.linhas })
  }

  const falhos = checksumsFalhos(checksums, 0)
  if (falhos.length > 0) {
    return erro('CHECKSUM_FALHOU',
      `CHECKSUM REPROVADO: ${falhos.length} de ${checksums.length} conferências não fecharam ` +
      'contra os subtotais que o próprio export declara. A base NÃO foi alterada.',
      { falhos: falhos.slice(0, 10), total: falhos.length })
  }

  return {
    ok: true,
    linhas,
    checksums,
    datasRejeitadas,
    diagnostico: {
      colunas: col,
      colunasNaoMapeadas: naoMapeados,
      centros,
      linhasIgnoradas: ignoradas,
      datasRejeitadas: datasRejeitadas.length,
    },
  }
}

/** Rótulo normalizado do cabeçalho — reexportado para a sonda de mutante do oráculo. */
export { normalizeHeader }
