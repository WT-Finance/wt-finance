// Parser do CRU do "Demonstrativo de Resultado" do Monde → formato tidy (Frente C, M3 da v6.0.0).
// Porte de `docs/legado/scripts-r/tratamento_demonstrativo_v1.R`.
//
// ATENÇÃO à diferença do que já existia: `@/lib/carga/parse-demonstrativo-competencia.ts` lê o
// arquivo JÁ TRATADO pelo script R (8 colunas tidy). ESTE lê o cru que o Monde exporta — o pivot
// com todos os campos na área de LINHAS — e faz no servidor o que o R fazia na máquina de alguém.
// Os dois convivem até a M4 aposentar o caminho do card.
//
// ── A anatomia do arquivo, e por que NADA aqui é posição fixa ───────────────────────────────
//
// O export é um pivot indentado. Medido no anexo de 21/09 (3.896 × 17):
//   • o cabeçalho dos campos está nas colunas B, G, K, M, O — e os DADOS, nas colunas A, C, D, H, I.
//     As duas coisas não coincidem. Um parser que localizasse a coluna pelo índice do cabeçalho
//     leria colunas inteiramente vazias, e em silêncio.
//   • a coluna de valor é a ÚLTIMA com conteúdo (rótulo "Total Geral"), não uma letra fixa;
//   • cada linha traz o rótulo do SEU nível e herda os de cima da linha anterior (forward-fill);
//   • linha com rótulo no nível mais profundo = folha (3.334 delas);
//   • linha de nível intermediário = subtotal (556) — e a última, o Total Geral.
//
// 556 + 1 = os **557 checksums** do contrato §4. Eles são a razão de o export ser pedido com os
// subtotais LIGADOS: o arquivo chega com a própria prova. Descartá-los sem ler é jogar fora a
// única conferência independente que existe entre o Monde e o Janus.
//
// ── Por que o checksum é o gate, e não um aviso ─────────────────────────────────────────────
// Se qualquer premissa estrutural quebrar (um nível colapsado no export, um campo deixado na área
// de COLUNAS), a soma das folhas deixa de bater com os subtotais. O parser PARA. Nunca entrega
// base silenciosamente errada — é o invariante 5 da versão ("checksum falho nunca aplica").

import { toNum, toCentavos } from '@/lib/carga/coercao'
import {
  aparar, ehVazio, normalizeHeader, valorEmReais, somaCentavos,
  ultimaColunaComConteudo, acharLinhaDeCabecalho, colunasComConteudo, colunasNumericas,
  AcumuladorBruto, centavosDeBruto,
  checksumsFalhos, erro,
  type Matriz, type Checksum, type Parse,
} from './comum'

/** Uma folha do pivot — um registro por (Tipo, Grupo, Descrição, Ano, Mês). */
export interface DemonstrativoCompetenciaCru {
  readonly tipo: string
  readonly grupo: string
  readonly descricao: string
  readonly ano: number
  /** O rótulo do mês como o arquivo o traz ("fevereiro") — apresentação. */
  readonly mes: string
  readonly mes_num: number
  /** Sempre o dia 1, `AAAA-MM-01`. DERIVADA de ano + mes_num: inteiros são imunes a fuso. */
  readonly competencia: string
  readonly valor: number
}

/** Os cinco campos do pivot, por nome NORMALIZADO. A ordem em que aparecem no arquivo é
 *  descoberta, não presumida — reordenar os campos no Monde não quebra a leitura. */
const CAMPOS_CANONICOS = ['tipo', 'grupo', 'descricao', 'ano', 'mes'] as const
type CampoCanonico = (typeof CAMPOS_CANONICOS)[number]

/** Nome de mês pt-BR → número. Tabela FIXA: o `format(data, "%b")` do R dependia do `LC_TIME` da
 *  sessão, e regra de negócio pendurada em locale é regra que muda de máquina para máquina. */
const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

/** Aceita nome cheio, abreviação de 3 letras e o próprio número. `null` no que não reconhecer. */
export function mesParaNumero(rotulo: unknown): number | null {
  const n = normalizeHeader(aparar(rotulo))
  if (n === '') return null
  if (MESES[n] !== undefined) return MESES[n]
  const abrev = Object.keys(MESES).find((m) => m.slice(0, 3) === n.slice(0, 3) && n.length === 3)
  if (abrev !== undefined) return MESES[abrev]
  const num = toNum(n)
  if (num !== null && Number.isInteger(num) && num >= 1 && num <= 12) return num
  return null
}

/** Proporção mínima de linhas com Ano+Mês legíveis para as derivadas valerem (igual ao R). */
const MINIMO_DERIVAVEL = 0.9

/**
 * Lê a matriz de células do cru e devolve as folhas do pivot + os 557 checksums do arquivo.
 *
 * Aborta (`ok: false`) quando a estrutura não é a esperada ou quando qualquer checksum não fecha.
 * Nunca devolve base parcial: ou o arquivo inteiro fecha, ou nada sai.
 */
export function parseDemonstrativoCruRows(
  rows: Matriz,
): Parse<DemonstrativoCompetenciaCru> {
  if (rows.length < 2) return erro('FORMATO_INVALIDO', 'Planilha vazia ou sem linhas de dado.')

  // ── Coluna de valor: a última com qualquer conteúdo ──────────────────────────────────────
  const colValor = ultimaColunaComConteudo(rows)
  if (colValor < 1) {
    return erro('FORMATO_INVALIDO',
      'Só há uma coluna com conteúdo — o arquivo não parece ser o export do Demonstrativo.')
  }

  // ── Linha de cabeçalho: a que tem mais rótulos NÃO numéricos à esquerda do valor ─────────
  const linhaCabecalho = acharLinhaDeCabecalho(rows, colValor)
  const campos: string[] = []
  const linhaCab = rows[linhaCabecalho] ?? []
  for (let j = 0; j < colValor; j++) {
    if (!ehVazio(linhaCab[j])) campos.push(aparar(linhaCab[j]))
  }
  if (campos.length < 2) {
    return erro('ESTRUTURA_INESPERADA',
      'Não encontrei a linha de cabeçalho dos campos do pivot. Confira se o arquivo é o export ' +
      'do Demonstrativo de Resultado com os campos na área de LINHAS.',
      { linhaCabecalho, campos })
  }

  // ── Guarda: campos deixados na área de COLUNAS do pivot (formato LARGO) ──────────────────
  // No tidy só a coluna de valor concentra números (a de Ano também, por serem anos). Muitas
  // colunas numéricas = o export veio largo, e o que se leria teria outra semântica com a
  // mesma cara. `colValor + 1` porque a própria coluna de valor entra na conta (igual ao R).
  const nColunasNumericas = colunasNumericas(rows, colValor + 1)
  if (nColunasNumericas > 3) {
    return erro('ESTRUTURA_INESPERADA',
      `Este arquivo está no formato LARGO (${nColunasNumericas} colunas com números): há campos ` +
      'na área de COLUNAS do pivot. Corrija no Monde — arraste TODOS os campos (Tipo, Grupo, ' +
      'Descrição, Ano, Mês) para a área de LINHAS e deixe a área de COLUNAS vazia.',
      { nColunasNumericas })
  }

  // ── Colunas de rótulo: as que têm conteúdo nas LINHAS DE DADO (nunca as do cabeçalho) ────
  const primeiraLinhaDado = linhaCabecalho + 1
  const colRotulos = colunasComConteudo(rows, primeiraLinhaDado, colValor)
  if (colRotulos.length !== campos.length) {
    return erro('ESTRUTURA_INESPERADA',
      `Estrutura inesperada: o cabeçalho tem ${campos.length} campo(s) [${campos.join(', ')}] mas ` +
      `os dados ocupam ${colRotulos.length} coluna(s) de rótulo. Confira se todos os níveis do ` +
      'pivot estão expandidos e se a área de COLUNAS está vazia.',
      { campos, colRotulos })
  }
  const nNiveis = campos.length

  // ── Onde cada campo canônico caiu, por NOME normalizado (sobrevive a reordenação) ────────
  const nivelDoCampo = {} as Record<CampoCanonico, number>
  const camposNorm = campos.map((c) => normalizeHeader(c))
  for (const canonico of CAMPOS_CANONICOS) {
    const k = camposNorm.indexOf(canonico)
    if (k === -1) {
      return erro('ESTRUTURA_INESPERADA',
        `O campo "${canonico}" não está no cabeçalho do pivot (campos lidos: ${campos.join(', ')}).`,
        { campos })
    }
    nivelDoCampo[canonico] = k
  }
  // Mês tem de ser o nível mais profundo: é ele que define a folha (um registro por competência).
  if (nivelDoCampo.mes !== nNiveis - 1) {
    return erro('ESTRUTURA_INESPERADA',
      `O campo "Mês" precisa ser o último nível do pivot (é o grão da base), mas é o nível ` +
      `${nivelDoCampo.mes + 1} de ${nNiveis}. Reordene os campos na área de LINHAS.`,
      { campos })
  }

  // ── Varredura: forward-fill, folhas e subtotais ──────────────────────────────────────────
  const atual: (string | null)[] = new Array(nNiveis).fill(null)
  // `valor` é o que vai para a coluna NUMERIC(18,2); `bruto` é o que o arquivo trazia, e é ele
  // que alimenta o checksum — o subtotal declarado pelo pivot é o arredondamento da soma dos
  // valores EXATOS. Hoje o anexo do Demonstrativo não tem mais de 2 casas e os dois números
  // coincidem, mas o contrato §4 já prevê tolerância nesta base ("o pivot arredonda na exibição"):
  // somar o arredondado deixaria a divergência latente, esperando o primeiro título dividido.
  const folhas: { chave: string[]; valor: number; bruto: number }[] = []
  const subtotais: { nivel: number; chave: string[]; centavos: number }[] = []
  let totalGeral: number | null = null
  let ignoradas = 0

  for (let i = primeiraLinhaDado; i < rows.length; i++) {
    const linha = rows[i] ?? []

    // Nível da linha = a coluna de rótulo mais à DIREITA que está preenchida.
    let nivel = 0
    for (let k = 0; k < nNiveis; k++) if (!ehVazio(linha[colRotulos[k]])) nivel = k + 1

    const celula = linha[colValor]
    const bruto = ehVazio(celula) ? null : toNum(celula)
    const valor = bruto === null ? null : valorEmReais(bruto)

    if (nivel === 0) {
      if (valor !== null) ignoradas++
      continue
    }

    const rotulo = aparar(linha[colRotulos[nivel - 1]])

    // Total Geral: rótulo no primeiro nível dizendo exatamente "total geral".
    // Igualdade EXATA, não prefixo: um Tipo que legitimamente começasse com "Total Geral…" seria
    // descartado das folhas em silêncio — e sobrescreveria o total do arquivo por cima. Improvável
    // num plano de contas, mas é justamente a classe de perda silenciosa que esta versão existe
    // para impedir, e o custo de fechar é uma linha.
    if (nivel === 1 && normalizeHeader(rotulo) === 'total geral') {
      if (totalGeral !== null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: segunda linha "Total Geral" no arquivo. O export traz uma só — duas ` +
          'significam que a estrutura mudou, e a segunda estaria apagando a primeira.',
          { linha: i + 1 })
      }
      totalGeral = bruto
      continue
    }

    atual[nivel - 1] = rotulo
    for (let k = nivel; k < nNiveis; k++) atual[k] = null

    if (nivel === nNiveis) {
      if (valor === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Linha ${i + 1}: folha sem valor (${atual.filter((x) => x !== null).join(' > ')}). ` +
          'Linha com conteúdo que não fecha um registro não é pulada em silêncio.',
          { linha: i + 1 })
      }
      folhas.push({ chave: atual.map((x) => x ?? ''), valor, bruto: bruto ?? valor })
    } else if (valor !== null) {
      // Nível intermediário SEM valor não vira checksum e não é erro — é o comportamento do
      // legado em R (`else if (!is.na(v))`), e é correto: o pivot pode trazer um nível de
      // agrupamento puro, sem subtotal ligado. A assimetria com a folha (que sem valor DERRUBA o
      // parse) é deliberada: folha sem valor é registro perdido; nível sem subtotal é só uma
      // conferência a menos, e o Total Geral continua cobrindo o arquivo inteiro.
      subtotais.push({
        nivel,
        chave: atual.slice(0, nivel).map((x) => x ?? ''),
        // O declarado sai da célula CRUA, não da arredondada: é o número que o arquivo afirma.
        centavos: centavosDeBruto(bruto) ?? 0,
      })
    }
  }

  if (folhas.length === 0) {
    return erro('ESTRUTURA_INESPERADA',
      'Nenhuma linha de folha encontrada. Confira se todos os níveis do pivot estão expandidos ' +
      'antes de exportar.')
  }

  // ── Checksums: todo subtotal fecha com a soma das folhas abaixo dele? ────────────────────
  const checksums: Checksum[] = []
  for (const s of subtotais) {
    const acc = new AcumuladorBruto()
    let arredondados = 0
    let linhas = 0
    for (const f of folhas) {
      let casa = true
      for (let k = 0; k < s.nivel; k++) if (f.chave[k] !== s.chave[k]) { casa = false; break }
      if (casa) { acc.somar(f.bruto); arredondados += toCentavos(f.valor) ?? 0; linhas++ }
    }
    checksums.push({
      escopo: camposNorm[s.nivel - 1],
      chave: s.chave,
      campo: 'valor',
      linhasDeclaradas: null,   // o pivot declara a soma, não a contagem
      centavosDeclarados: s.centavos,
      linhasApuradas: linhas,
      centavosApurados: acc.centavos,
      centavosArredondados: arredondados,
    })
  }

  const centavosFolhas = somaCentavos(folhas.map((f) => f.valor))
  const totalBruto = new AcumuladorBruto()
  for (const f of folhas) totalBruto.somar(f.bruto)
  if (totalGeral !== null) {
    checksums.push({
      escopo: 'total-geral',
      chave: [],
      campo: 'valor',
      linhasDeclaradas: null,
      centavosDeclarados: centavosDeBruto(totalGeral) ?? 0,
      linhasApuradas: folhas.length,
      centavosApurados: totalBruto.centavos,
      centavosArredondados: centavosFolhas,
    })
  }

  // Tolerância 0: o contrato §4 dá 0,005 (meio centavo) para esta base, e sobre valores já
  // arredondados a 2 casas meio centavo É igualdade exata em centavos inteiros. Fica explícito
  // para ninguém "afrouxar" depois achando que 0 é rigor acidental.
  const falhos = checksumsFalhos(checksums, 0)
  if (falhos.length > 0) {
    return erro('CHECKSUM_FALHOU',
      `CHECKSUM REPROVADO: ${falhos.length} de ${checksums.length} conferências não fecharam. ` +
      'Quase sempre significa que a estrutura do export mudou ou que algum nível do pivot ficou ' +
      'colapsado. A base NÃO foi alterada.',
      { falhos: falhos.slice(0, 10), total: falhos.length })
  }

  // ── Derivadas (Mês Nº e Competência) ────────────────────────────────────────────────────
  const iAno = nivelDoCampo.ano
  const iMes = nivelDoCampo.mes
  const legiveis = folhas.filter((f) => {
    const ano = toNum(f.chave[iAno])
    return ano !== null && Number.isInteger(ano) && mesParaNumero(f.chave[iMes]) !== null
  }).length
  if (legiveis / folhas.length < MINIMO_DERIVAVEL) {
    return erro('ESTRUTURA_INESPERADA',
      `Só ${Math.round((100 * legiveis) / folhas.length)}% das folhas têm Ano e Mês legíveis — ` +
      'os campos do pivot não são os esperados. A competência é o grão desta base; sem ela a ' +
      'carga não tem significado.',
      { legiveis, folhas: folhas.length })
  }

  const linhas: DemonstrativoCompetenciaCru[] = []
  const mesesNaoReconhecidos = new Set<string>()
  for (const f of folhas) {
    const ano = toNum(f.chave[iAno])
    const mesNum = mesParaNumero(f.chave[iMes])
    if (ano === null || !Number.isInteger(ano) || mesNum === null) {
      mesesNaoReconhecidos.add(`${f.chave[iAno]}/${f.chave[iMes]}`)
      continue
    }
    linhas.push({
      tipo:        f.chave[nivelDoCampo.tipo],
      grupo:       f.chave[nivelDoCampo.grupo],
      descricao:   f.chave[nivelDoCampo.descricao],
      ano,
      mes:         f.chave[iMes],
      mes_num:     mesNum,
      competencia: `${String(ano).padStart(4, '0')}-${String(mesNum).padStart(2, '0')}-01`,
      valor:       f.valor,
    })
  }

  return {
    ok: true,
    linhas,
    checksums,
    datasRejeitadas: [],   // esta base não tem coluna de data: a competência é derivada de inteiros
    diagnostico: {
      linhaCabecalho: linhaCabecalho + 1,
      colunaValor: colValor,
      campos,
      colunasDeRotulo: colRotulos,
      niveis: nNiveis,
      folhas: folhas.length,
      subtotaisConferidos: checksums.length,
      linhasIgnoradas: ignoradas,
      totalGeral,
      centavosFolhas,
      mesesNaoReconhecidos: [...mesesNaoReconhecidos],
    },
  }
}
