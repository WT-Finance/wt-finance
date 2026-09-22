// Parser do CRU de "Lançamentos por Categoria" do Monde — as DUAS bases irmãs (Frente C, M3):
//   • `lancamentos-movimentacao` (15 colunas, tem "Movimentação") → `raw.lancamentos_movimentacao`
//   • `lancamentos-aberto`       (14 colunas, sem ela)            → `raw.titulos_em_aberto`
//
// Um parser só, com o layout DESCOBERTO por nome de coluna normalizado. O legado em R decidia o
// layout por `grepl("moviment", cabeçalho)` e a partir daí aplicava um vetor de tipos POR POSIÇÃO,
// sem nunca conferir a contagem real de colunas: um export com o cabeçalho certo e o layout
// trocado seria lido inteiro na coluna errada, em silêncio. Aqui não há vetor posicional — cada
// campo é achado pelo próprio nome, e a base 14×15 cai fora naturalmente (o campo "Movimentação"
// simplesmente não existe na irmã).
//
// ── O que é NOVO nesta versão, e é o motivo dela ────────────────────────────────────────────
// O export vem com as linhas de OUTLINE do Excel:
//     "Grupo de Categoria : Custo dos Serviços Prestados (1738, -R$ 4.546.031,79)"
//     "Categoria : Assessoria Local (99, -R$ 271.735,35)"
// O script R as DESCARTAVA sem ler — jogava fora, junto com elas, a contagem e a soma que o
// próprio Monde declarou. São **148** conferências em Movimentação (15 grupos + 133 categorias) e
// **95** em Aberto (15 + 80), mais a linha de total do arquivo. Medido nos anexos de 21/09: a
// regex casa 100% delas. É a prova que veio junto com o dado — e o contrato §4 a torna gate.
//
// ── A coluna deslocada ──────────────────────────────────────────────────────────────────────
// O cabeçalho traz "Número" na coluna A, mas nas linhas de dado o número mora na coluna C: A e B
// são as colunas de recuo do outline. Localizar a coluna pelo índice do cabeçalho leria coluna
// vazia. A regra é a mesma do Demonstrativo — manda quem tem conteúdo nas linhas de DADO.

import {
  aparar, apararOuNulo, ehVazio, normalizeHeader, valorEmReais, somaCentavos, lerData,
  AcumuladorBruto,
  mapearColunas, camposFaltando, checksumsFalhos, erro,
  type Matriz, type Checksum, type DataRejeitada, type Parse,
} from './comum'
import { toNum, toCentavos } from '@/lib/carga/coercao'

export interface LancamentoCategoriaCru {
  readonly grupo_categoria: string
  readonly categoria: string
  readonly numero: string
  readonly venda_numero: string | null
  readonly emissao: string | null
  readonly vencimento: string | null
  readonly liquidacao: string | null
  /** Só na base de movimentação; `null` na de vencimento em aberto. */
  readonly movimentacao: string | null
  readonly pessoa: string | null
  readonly descricao: string | null
  readonly descricao_categoria: string | null
  readonly valor: number
  readonly conta: string | null
}

type Campo =
  | 'numero' | 'venda_numero' | 'emissao' | 'vencimento' | 'liquidacao' | 'movimentacao'
  | 'pessoa' | 'descricao' | 'descricao_categoria' | 'valor' | 'categoria' | 'grupo_categoria'
  | 'conta'

const COL_MAP: Record<string, Campo> = {
  'Número':              'numero',
  'Numero':              'numero',
  'Venda Nº':            'venda_numero',
  'Venda N':            'venda_numero',
  'Emissão':             'emissao',
  'Vencimento':          'vencimento',
  'Liquidação':          'liquidacao',
  'Movimentação':        'movimentacao',
  'Pessoa':              'pessoa',
  'Descrição':           'descricao',
  'Descrição Categoria': 'descricao_categoria',
  'Valor':               'valor',
  'Categoria':           'categoria',
  'Grupo de Categoria':  'grupo_categoria',
  'Conta':               'conta',
}

/** Sem qualquer um destes a base não tem significado. "Movimentação" fica de fora de propósito:
 *  é o que separa as duas irmãs. */
const OBRIGATORIOS: Campo[] = [
  'numero', 'venda_numero', 'emissao', 'vencimento', 'liquidacao', 'pessoa', 'descricao',
  'descricao_categoria', 'valor', 'categoria', 'grupo_categoria', 'conta',
]

/** Os campos que são data — todos passam pela guarda de faixa. */
const CAMPOS_DATA = ['emissao', 'vencimento', 'liquidacao', 'movimentacao'] as const

/** A linha de outline do Excel, com a contagem e a soma que o Monde declarou.
 *  Aceita o valor com ou sem sinal e com ou sem `R$` — o export usa `-R$ 4.546.031,79`. */
const RE_OUTLINE = /^(Grupo de Categoria|Categoria)\s*:\s*(.+?)\s*\((\d+),\s*(-?\s*R?\$?[\d.,\s-]+)\)$/

/** Quantas colunas do começo podem ser recuo de outline antes de o dado começar. */
const MAX_COLUNAS_DE_RECUO = 3

/**
 * Resolve a coluna REAL de cada campo: se a coluna do cabeçalho não tem conteúdo nenhum nas
 * linhas de dado, o campo mora à direita dela, antes do próximo campo mapeado (é o caso de
 * "Número", cujo cabeçalho está na coluna A e cujo dado está na C).
 *
 * Coluna genuinamente vazia — "Liquidação" na base de vencimento em aberto, onde nada foi
 * liquidado por definição — MANTÉM o índice do cabeçalho: não havendo candidata com conteúdo, não
 * há o que corrigir. Curar o que não está quebrado é como se inventa um mapeamento errado.
 */
function resolverColunas(
  rows: Matriz,
  indices: Partial<Record<Campo, number>>,
  primeiraLinhaDado: number,
  ehOutline: readonly boolean[],
): Partial<Record<Campo, number>> {
  const ocupadas = Object.values(indices).filter((x): x is number => x !== undefined).sort((a, b) => a - b)
  // As linhas de OUTLINE ficam de fora da conta: elas trazem o marcador de recuo ("-") justamente
  // nas colunas A e B, e contá-las faria "Número" parecer preenchido na coluna A — que é
  // exatamente o engano que esta função existe para desfazer.
  const temConteudo = (j: number): boolean => {
    for (let i = primeiraLinhaDado; i < rows.length; i++) {
      if (ehOutline[i]) continue
      if (!ehVazio(rows[i]?.[j])) return true
    }
    return false
  }

  const resolvido: Partial<Record<Campo, number>> = { ...indices }
  for (const [campo, j] of Object.entries(indices) as [Campo, number][]) {
    if (temConteudo(j)) continue
    const proxima = ocupadas.find((o) => o > j)
    const limite = Math.min(proxima ?? j + MAX_COLUNAS_DE_RECUO + 1, j + MAX_COLUNAS_DE_RECUO + 1)
    for (let k = j + 1; k < limite; k++) {
      if (ocupadas.includes(k)) break
      if (temConteudo(k)) { resolvido[campo] = k; break }
    }
  }
  return resolvido
}

/** Lê "(1738, -R$ 4.546.031,79)" → contagem e centavos. */
function lerOutline(texto: string): { escopo: 'grupo' | 'categoria'; nome: string; linhas: number; centavos: number } | null {
  const m = RE_OUTLINE.exec(texto)
  if (!m) return null
  const centavos = toCentavos(m[4].replace(/R\$/g, '').trim())
  if (centavos === null) return null
  return {
    escopo: m[1] === 'Grupo de Categoria' ? 'grupo' : 'categoria',
    nome: aparar(m[2]),
    linhas: Number(m[3]),
    centavos,
  }
}

/**
 * Lê a matriz do cru de Lançamentos por Categoria (qualquer das duas irmãs) e devolve as linhas
 * de dado + os checksums que o arquivo declarou nas linhas de outline e na linha de total.
 */
export function parseLancamentosCategoriaRows(
  rows: Matriz,
  opcoes: { hoje?: Date } = {},
): Parse<LancamentoCategoriaCru> {
  if (rows.length < 2) return erro('FORMATO_INVALIDO', 'Planilha vazia ou sem linhas de dado.')

  const { indices, naoMapeados } = mapearColunas<Campo>(rows[0] ?? [], COL_MAP)
  const faltando = camposFaltando(indices, OBRIGATORIOS)
  if (faltando.length > 0) {
    return erro('ESTRUTURA_INESPERADA',
      `O cabeçalho do export não traz: ${faltando.join(', ')}. Confira se o relatório exportado é ` +
      '"Lançamentos por Categoria" (movimentação ou vencimento em aberto).',
      { faltando, naoMapeados })
  }

  // ── Passo 1: marcar as linhas de OUTLINE e ler o checksum que cada uma declara ───────────
  // Tem de vir ANTES da resolução de colunas: o marcador de recuo dessas linhas ("-") ocupa as
  // colunas A e B e faria "Número" parecer preenchido na coluna do cabeçalho.
  const ehOutline: boolean[] = new Array(rows.length).fill(false)
  const outlines: { escopo: 'grupo' | 'categoria'; nome: string; linhas: number; centavos: number }[] = []
  for (let i = 1; i < rows.length; i++) {
    const linha = rows[i] ?? []
    for (let j = 0; j < MAX_COLUNAS_DE_RECUO; j++) {
      const v = linha[j]
      if (typeof v !== 'string') continue
      const t = aparar(v)
      if (!/^(Grupo de Categoria|Categoria)\s*:/.test(t)) continue
      const lido = lerOutline(t)
      if (lido === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: linha de outline em formato não reconhecido — "${t}". O checksum que o ` +
          'arquivo declara não pode ser lido, e sem ele a carga perde a conferência independente.',
          { linha: i + 1, texto: t })
      }
      outlines.push(lido)
      ehOutline[i] = true
      break
    }
  }

  const col = resolverColunas(rows, indices, 1, ehOutline)
  const cValor = col.valor as number
  const cNumero = col.numero as number
  const cCategoria = col.categoria as number
  const cGrupo = col.grupo_categoria as number
  const temMovimentacao = col.movimentacao !== undefined

  const linhas: LancamentoCategoriaCru[] = []
  /** Valor BRUTO de cada linha, na mesma ordem de `linhas` — só para os checksums. */
  const brutos: number[] = []
  const datasRejeitadas: DataRejeitada[] = []
  let totalLinhasDeclarado: number | null = null
  let totalCentavosDeclarado: number | null = null
  let ignoradas = 0

  const texto = (linha: readonly unknown[], j: number | undefined): string | null =>
    j === undefined ? null : apararOuNulo(linha[j])

  // ── Passo 2: as linhas de dado e a linha de total ────────────────────────────────────────
  for (let i = 1; i < rows.length; i++) {
    if (ehOutline[i]) continue
    const linha = rows[i] ?? []

    // Linha de DADO: as três colunas-chave preenchidas (mesmo critério do legado em R).
    const numero = apararOuNulo(linha[cNumero])
    const categoria = apararOuNulo(linha[cCategoria])
    const grupo = apararOuNulo(linha[cGrupo])

    if (numero !== null && categoria !== null && grupo !== null) {
      // Dois números por linha, de propósito: o BRUTO alimenta o checksum (o subtotal declarado
      // foi calculado sobre ele) e o ARREDONDADO é o que vai para a coluna NUMERIC(18,2).
      const bruto = toNum(linha[cValor])
      const valor = valorEmReais(bruto)
      if (valor === null || bruto === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: lançamento ${numero} sem valor legível. Linha com conteúdo que não fecha ` +
          'um registro não é pulada em silêncio.',
          { linha: i + 1, numero })
      }
      const datas: Record<string, string | null> = {}
      for (const campo of CAMPOS_DATA) {
        const j = col[campo]
        datas[campo] = j === undefined ? null : lerData(linha[j], campo, i + 1, datasRejeitadas, opcoes.hoje)
      }
      linhas.push({
        grupo_categoria:     grupo,
        categoria,
        numero,
        venda_numero:        texto(linha, col.venda_numero),
        emissao:             datas.emissao,
        vencimento:          datas.vencimento,
        liquidacao:          datas.liquidacao,
        movimentacao:        temMovimentacao ? datas.movimentacao : null,
        pessoa:              texto(linha, col.pessoa),
        descricao:           texto(linha, col.descricao),
        descricao_categoria: texto(linha, col.descricao_categoria),
        valor,
        conta:               texto(linha, col.conta),
      })
      brutos.push(bruto)
      continue
    }

    // 3. Linha de TOTAL do arquivo: sem as três chaves, mas com a soma na coluna de valor.
    //    A contagem vem na única outra célula numérica da linha — o Monde a põe sob "Pessoa",
    //    mas depender dessa posição seria repetir o erro que este parser existe para não cometer.
    const somaTotal = ehVazio(linha[cValor]) ? null : valorEmReais(linha[cValor])
    if (somaTotal !== null) {
      const outrosNumeros: number[] = []
      for (let j = 0; j < linha.length; j++) {
        if (j === cValor || ehVazio(linha[j])) continue
        const n = toNum(linha[j])
        if (n !== null && Number.isInteger(n)) outrosNumeros.push(n)
      }
      if (outrosNumeros.length !== 1) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: linha de total do arquivo com ${outrosNumeros.length} candidatas a ` +
          'contagem — esperava exatamente uma. O formato do rodapé do export mudou.',
          { linha: i + 1 })
      }
      totalLinhasDeclarado = outrosNumeros[0]
      totalCentavosDeclarado = toCentavos(somaTotal)
      continue
    }

    if (!linha.every((c) => ehVazio(c))) ignoradas++
  }

  if (linhas.length === 0) {
    return erro('ESTRUTURA_INESPERADA', 'Nenhuma linha de lançamento encontrada no arquivo.')
  }

  // ── Checksums: cada outline fecha com as linhas que ele cobre? ───────────────────────────
  interface Apurado { acc: AcumuladorBruto; arredondados: number }
  const novo = (): Apurado => ({ acc: new AcumuladorBruto(), arredondados: 0 })
  const porGrupo = new Map<string, Apurado>()
  const porCategoria = new Map<string, Apurado>()

  linhas.forEach((l, i) => {
    const g = porGrupo.get(l.grupo_categoria) ?? novo()
    g.acc.somar(brutos[i]); g.arredondados += toCentavos(l.valor) ?? 0
    porGrupo.set(l.grupo_categoria, g)
    // A categoria é única DENTRO do grupo, não no arquivo: a chave é composta.
    const chave = `${l.grupo_categoria}\u0000${l.categoria}`
    const c = porCategoria.get(chave) ?? novo()
    c.acc.somar(brutos[i]); c.arredondados += toCentavos(l.valor) ?? 0
    porCategoria.set(chave, c)
  })

  const checksums: Checksum[] = []
  let grupoCorrente: string | null = null
  for (const o of outlines) {
    if (o.escopo === 'grupo') {
      grupoCorrente = o.nome
      const apurado = porGrupo.get(o.nome) ?? novo()
      checksums.push({
        escopo: 'grupo', chave: [o.nome], campo: 'valor',
        linhasDeclaradas: o.linhas, centavosDeclarados: o.centavos,
        linhasApuradas: apurado.acc.linhas, centavosApurados: apurado.acc.centavos,
        centavosArredondados: apurado.arredondados,
      })
    } else {
      // A linha de categoria vem SEMPRE depois da linha do grupo a que pertence — é assim que o
      // outline do Excel se aninha. Sem o grupo corrente, "Assessoria Local" seria somada
      // atravessando grupos diferentes e o checksum passaria a medir outra coisa.
      if (grupoCorrente === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha de outline "Categoria : ${o.nome}" apareceu antes de qualquer "Grupo de ` +
          'Categoria" — o aninhamento do export não é o esperado.',
          { categoria: o.nome })
      }
      const apurado = porCategoria.get(`${grupoCorrente}\u0000${o.nome}`) ?? novo()
      checksums.push({
        escopo: 'categoria', chave: [grupoCorrente, o.nome], campo: 'valor',
        linhasDeclaradas: o.linhas, centavosDeclarados: o.centavos,
        linhasApuradas: apurado.acc.linhas, centavosApurados: apurado.acc.centavos,
        centavosArredondados: apurado.arredondados,
      })
    }
  }

  if (totalCentavosDeclarado !== null) {
    const total = new AcumuladorBruto()
    for (const b of brutos) total.somar(b)
    checksums.push({
      escopo: 'total-arquivo', chave: [], campo: 'valor',
      linhasDeclaradas: totalLinhasDeclarado,
      centavosDeclarados: totalCentavosDeclarado,
      linhasApuradas: linhas.length,
      centavosApurados: total.centavos,
      centavosArredondados: somaCentavos(linhas.map((l) => l.valor)),
    })
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
      layout: temMovimentacao ? 'movimentacao' : 'aberto',
      colunas: col,
      colunasNaoMapeadas: naoMapeados,
      outlinesGrupo: outlines.filter((o) => o.escopo === 'grupo').length,
      outlinesCategoria: outlines.filter((o) => o.escopo === 'categoria').length,
      totalLinhasDeclarado,
      linhasIgnoradas: ignoradas,
      datasRejeitadas: datasRejeitadas.length,
    },
  }
}

/** Rótulo normalizado do cabeçalho — reexportado para a sonda de mutante do oráculo. */
export { normalizeHeader }
