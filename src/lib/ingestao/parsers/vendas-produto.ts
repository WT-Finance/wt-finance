// Parser do CRU de "Vendas por Produto" do Monde (Frente C, M3 da v6.0.0).
// Porte de `docs/legado/scripts-r/ajuste_vendas_teste.R`, com três desvios DELIBERADOS.
//
// ── Os três desvios em relação ao script R, e por quê ───────────────────────────────────────
//
// 1. **A linha de totais é LIDA antes de ser descartada.** O R fazia `df[-nrow(df),]` — removia a
//    última linha física de cada arquivo sem olhar. Ela traz a contagem de linhas e quatro somas:
//    são os **5 checksums por arquivo** do contrato §4, a única conferência independente entre o
//    Monde e o Janus. Descartar sem ler é jogar fora a prova que veio junto com o dado.
//
// 2. **`Intermediário` é PRESERVADO.** O R fazia `mutate(Intermediário = NA)`, zerando a coluna
//    inteira; o tratado sai com ela vazia por construção, não por ausência de dado na origem. O
//    briefing §9 é explícito: o oráculo da v6 compara COM `Intermediário`.
//
// 3. **O filtro Welcome NÃO acontece aqui.** No R, `filter(Setor Macro != "Welcome")` ficava no
//    meio do tratamento e a base nascia já filtrada — filtro de negócio embutido na ingestão.
//    Decisão 8 da versão: filtro de negócio vive na LEITURA. O parser entrega o arquivo inteiro.
//
// ── E um cuidado que o R não tinha ──────────────────────────────────────────────────────────
//
// **Aparar é explícito.** O R nunca chama `str_trim`: quem aparava era o default `trim_ws = TRUE`
// do `readxl`. E a classificação `Setor Micro` DEPENDE disso — 17% dos `Produto` do cru têm espaço
// nas pontas, e `"Transporte Rodoviario "` só cai em `Extras` porque alguém, em algum lugar, apara
// a string. Regra de negócio pendurada em default de biblioteca é regra invisível: troca-se a
// biblioteca e a classificação muda sem que nada acuse. Aqui a aparagem é código, com sonda.
//
// **Dado pessoal não entra.** `E-mail`, `CPF`, `CNPJ` e `Tipo Pessoa` existem no cru e NÃO são
// mapeados — não há campo para eles nem por acidente (decisão 3 e invariante 6 da versão). O cru
// com esses dados fica só no bucket.

import { toNum } from '@/lib/carga/coercao'
import {
  apararOuNulo, ehVazio, valorEmReais, lerData, mapearColunas, camposFaltando,
  checksumsFalhos, erro, AcumuladorBruto, centavosDeBruto,
  type Matriz, type Checksum, type DataRejeitada, type Parse,
} from './comum'

export interface VendaProdutoCru {
  readonly arquivo_origem: string
  /** Linha no arquivo de origem, 1-based com cabeçalho — o que o humano vê no Excel. */
  readonly linha_origem: number
  readonly venda_numero: string | null
  readonly data_venda: string | null
  readonly data_inicio: string | null
  readonly vendedor: string | null
  readonly intermediario: string | null
  readonly pagante: string | null
  readonly passageiros: string | null
  readonly setor: string | null
  readonly produto: string | null
  /** Coluna "Contr./ Voucher" do cru. */
  readonly tipo_contrato: string | null
  readonly fornecedor: string | null
  readonly receitas: number | null
  readonly valor_total: number | null
  readonly situacao: string | null
  readonly operacao_propria: string | null
  // ── derivadas ──
  //
  // Consumidores ENUMERADOS (briefing §5-C manda conferir antes de portar), em 22/09:
  //   • `setor_macro` — LIDA. `analytics.vw_vendas_agregadas` (0040) lê a string CRUA, sem passar
  //     pela `dim_setor`; alimenta `get_vendas_em_aberto_weddings`, `get_vendas_prejuizo_weddings`
  //     e `cruzar_vendas_setor` (0159) → tela de Weddings e Calculadora de Rateio.
  //   • `setor_micro` — LIDA. É a chave do `JOIN analytics.dim_setor_micro` do
  //     `transform_raw_to_analytics` (0011): sem ela a linha não vira fato.
  //   • `contrato`    — LIDA. `raw.vendas_excel.contrato = TRUE` é filtro direto em ~15 RPCs de
  //     Weddings/Hotel/Carteira, além da cópia para `analytics.fato_venda`.
  //   • `taxa_servico`— LIDA pelo transform (cópia para `fato_venda`, não recomputo).
  //   • `semana` e `mes` — **nenhum consumidor encontrado**: aparecem só em listas de INSERT,
  //     nunca em SELECT/WHERE/GROUP BY, nem em SQL nem em `src/`. Seguem sendo calculadas aqui
  //     de propósito: é o que permite ao oráculo provar paridade nas 21 colunas do tratado, e a
  //     poda de coluna morta tem lugar próprio — a destrutiva do GATE 3, onde vale o invariante
  //     de citar o commit que removeu a última referência. Registrado no out-briefing.
  readonly semana: number | null
  readonly setor_macro: string | null
  readonly mes: string | null
  readonly setor_micro: string | null
  /** 1 quando o produto é "Contrato de casamento"; 0 caso contrário. */
  readonly contrato: number
  /** 1 quando o produto é "Taxa de Serviço"; 0 caso contrário. */
  readonly taxa_servico: number
}

type Campo =
  | 'venda_numero' | 'data_venda' | 'data_inicio' | 'pagante' | 'vendedor' | 'intermediario'
  | 'setor' | 'passageiros' | 'produto' | 'valor_total' | 'receitas'
  | 'total_produtos_moeda_origem' | 'fornecedor' | 'tipo_contrato' | 'situacao'
  | 'reembolso_ao_cliente' | 'operacao_propria'

/** Só as colunas que a plataforma usa. `E-mail`/`CPF`/`CNPJ`/`Tipo Pessoa` ficam de fora de
 *  propósito (decisão 3); `Data Fim`, `Vendedor(a) Responsável - Grupo`, `Representante`,
 *  `Câmbio Operadora` e `Comissão (%)` o legado já descartava. */
const COL_MAP: Record<string, Campo> = {
  'Venda Nº':                   'venda_numero',
  'Data Venda':                 'data_venda',
  'Data Início':                'data_inicio',
  'Data de Início':             'data_inicio',
  'Pagante':                    'pagante',
  'Vendedor':                   'vendedor',
  'Intermediário':              'intermediario',
  'Setor':                      'setor',
  'Passageiros':                'passageiros',
  'Produto':                    'produto',
  'Valor Total':                'valor_total',
  'Receitas':                   'receitas',
  'Total Produtos Moeda Origem': 'total_produtos_moeda_origem',
  'Fornecedor':                 'fornecedor',
  'Contr./ Voucher':            'tipo_contrato',
  'Situação':                   'situacao',
  'Reembolso ao Cliente':       'reembolso_ao_cliente',
  'Operação Propria':           'operacao_propria',
  'Operação Própria':           'operacao_propria',
}

const OBRIGATORIOS: Campo[] = [
  'venda_numero', 'data_venda', 'data_inicio', 'pagante', 'vendedor', 'intermediario', 'setor',
  'passageiros', 'produto', 'valor_total', 'receitas', 'total_produtos_moeda_origem',
  'fornecedor', 'tipo_contrato', 'situacao', 'reembolso_ao_cliente', 'operacao_propria',
]

/** As quatro somas que a linha de totais declara, na ordem em que o contrato §4 as conta. */
const CAMPOS_SOMADOS = ['valor_total', 'receitas', 'total_produtos_moeda_origem', 'reembolso_ao_cliente'] as const
type CampoSomado = (typeof CAMPOS_SOMADOS)[number]

/** Abreviação de mês pt-BR, por número. Tabela FIXA: o `format(data, "%b")` do R saía do `LC_TIME`
 *  da sessão — "jan" numa máquina, "Jan" noutra, e a coluna mudava de conteúdo sem ninguém mexer
 *  no código. */
const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const

/** `Setor Macro` — a ordem das cláusulas é a do R e ela decide: a primeira que casa vence. */
export function classificarSetorMacro(setor: string | null): string | null {
  if (setor === null) return null
  if (setor === 'Corporativo') return 'Corporativo'
  if (setor === 'Expedições' || setor === 'Lazer') return 'Lazer'
  if (setor === 'Planejamento-WED' || setor === 'Produção' || setor === 'WedMe' || setor === 'Weddings') return 'Weddings'
  if (setor === 'Welcome') return 'Welcome'
  return setor   // fallback: mantém o valor original
}

/** Os produtos que, vendidos por Weddings, contam como "Extras". Lista literal do R. */
const PRODUTOS_EXTRAS = new Set([
  'Aluguel de Carro', 'Bagagens ou assentos', 'Cerimonial de Casamento', 'Ingressos',
  'Pacote de Casamento', 'Pacote Turístico', 'Passagem Aérea', 'Passes de Trem',
  'Receptivo - Traslados e Passeios', 'Seguro Viagem', 'Transporte Rodoviario',
])

/**
 * `Setor Micro` — ordem literal do R, e ela importa:
 *   1. Produção / Planejamento-WED  → o próprio Setor
 *   2. Weddings ou WedMe + "Diárias de Hospedagem" → "Hospedagem"
 *   3. Weddings (só Weddings, não WedMe) + produto da lista de extras → "Extras"
 *   4. fallback → o próprio Setor
 *
 * ⚠️ `produto` PRECISA chegar aparado. No cru, 17% dos valores têm espaço nas pontas, e
 * `"Transporte Rodoviario "` com espaço não casa a lista — a venda cairia no fallback e mudaria
 * de classificação em silêncio.
 */
export function classificarSetorMicro(setor: string | null, produto: string | null): string | null {
  if (setor === null) return null
  if (setor === 'Produção' || setor === 'Planejamento-WED') return setor
  if ((setor === 'Weddings' || setor === 'WedMe') && produto === 'Diárias de Hospedagem') return 'Hospedagem'
  if (setor === 'Weddings' && produto !== null && PRODUTOS_EXTRAS.has(produto)) return 'Extras'
  return setor
}

/** Um arquivo do conjunto — Vendas aceita N (um por ano/período). */
export interface ArquivoVendas {
  readonly nome: string
  readonly rows: Matriz
}

/**
 * Calendário de semanas do legado. NÃO é semana ISO:
 *   • a contagem reinicia a cada ano civil;
 *   • a semana 1 vai do primeiro dia coberto até a véspera do primeiro domingo;
 *   • cada domingo abre uma semana nova.
 *
 * ⚠️ O ano mais antigo começa na MENOR data de venda do conjunto, não em 1º de janeiro — é o que
 * o `calendario` do R faz ao ser construído em `[min(Data Venda), max(Data Venda)]`. Isso torna a
 * numeração dependente do conjunto de arquivos carregado: subir só 2024 e 2025 renumeraria as
 * semanas de 2024. Está portado fielmente porque a coluna já existe na base e mudar a regra
 * mudaria número em tela — mas fica registrado como fragilidade do desenho legado.
 */
/**
 * Vendas distintas que vão existir em `analytics.fato_venda` depois da carga: `Venda Nº` não
 * vazio e Setor Macro diferente de Welcome — o predicado de `analytics.vendas_excel_para_fato`
 * (0277), em que `null` passa (`IS DISTINCT FROM`). É a grandeza do "depois" do diff de Vendas:
 * contar também as Welcome fazia o modal da 1ª carga real (M9) dizer "29.458 → 29.599" numa carga
 * que deixa o `fato_venda` em 29.458.
 */
export function vendasDistintasQueEntramNoFato(
  linhas: readonly Pick<VendaProdutoCru, 'venda_numero' | 'setor_macro'>[],
): number {
  return new Set(
    linhas
      .filter((l) => l.setor_macro !== 'Welcome')
      .map((l) => l.venda_numero)
      .filter((n): n is string => n !== null && n !== ''),
  ).size
}

export function semanaDoAno(iso: string, menorDataIso: string): number | null {
  if (iso.length < 10) return null
  const ano = Number(iso.slice(0, 4))
  const inicioDoAno = `${ano}-01-01`
  const inicio = inicioDoAno > menorDataIso ? inicioDoAno : menorDataIso
  if (iso < inicio) return null

  const dias = (a: string): number => {
    const [y, m, d] = a.split('-').map(Number)
    return Date.UTC(y, m - 1, d) / 86_400_000
  }
  // 1970-01-01 (dia 0) foi uma QUINTA; o primeiro domingo é 1970-01-04, dia 3. Errar isto em um
  // dia desloca a virada da semana e só aparece em parte do ano — a primeira versão usava 4 e
  // passou no caso 2026-09-18, que dá o mesmo número por coincidência.
  const ehDomingo = (n: number): boolean => ((n % 7) + 7) % 7 === 3
  const domingosAte = (n: number, desde: number): number => {
    if (n < desde) return 0
    // Quantos domingos em [desde, n]: conta pelo primeiro domingo ≥ desde.
    let primeiro = desde
    while (!ehDomingo(primeiro)) primeiro++
    return n < primeiro ? 0 : Math.floor((n - primeiro) / 7) + 1
  }

  const nInicio = dias(inicio)
  const n = dias(iso)
  const acumulado = domingosAte(n, nInicio)
  const base = ehDomingo(nInicio) ? 1 : 0
  return acumulado - base + 1
}

/**
 * Lê N arquivos crus de Vendas por Produto e devolve as linhas unidas + os 5 checksums por
 * arquivo. A linha de totais de cada arquivo é lida como checksum e não vira registro.
 */
export function parseVendasProdutoRows(
  arquivos: readonly ArquivoVendas[],
  opcoes: { hoje?: Date } = {},
): Parse<VendaProdutoCru> {
  if (arquivos.length === 0) return erro('FORMATO_INVALIDO', 'Nenhum arquivo na carga.')

  interface Bruta {
    arquivo: string
    linha: number
    valores: Partial<Record<Campo, unknown>>
  }
  const brutas: Bruta[] = []
  const checksums: Checksum[] = []
  const datasRejeitadas: DataRejeitada[] = []
  const diagnosticoArquivos: Record<string, unknown>[] = []

  for (const arq of arquivos) {
    const { rows, nome } = arq
    if (rows.length < 2) {
      return erro('FORMATO_INVALIDO', `Arquivo "${nome}" vazio ou sem linhas de dado.`, { arquivo: nome })
    }

    const { indices, naoMapeados } = mapearColunas<Campo>(rows[0] ?? [], COL_MAP)
    const faltando = camposFaltando(indices, OBRIGATORIOS)
    if (faltando.length > 0) {
      return erro('ESTRUTURA_INESPERADA',
        `O arquivo "${nome}" não traz no cabeçalho: ${faltando.join(', ')}. Confira se o relatório ` +
        'exportado é "Vendas por produto".',
        { arquivo: nome, faltando, naoMapeados })
    }

    const cDataVenda = indices.data_venda as number
    const cVendaNumero = indices.venda_numero as number
    const arredondados: Record<CampoSomado, number> = {
      valor_total: 0, receitas: 0, total_produtos_moeda_origem: 0, reembolso_ao_cliente: 0,
    }
    const acumuladores: Record<CampoSomado, AcumuladorBruto> = {
      valor_total: new AcumuladorBruto(),
      receitas: new AcumuladorBruto(),
      total_produtos_moeda_origem: new AcumuladorBruto(),
      reembolso_ao_cliente: new AcumuladorBruto(),
    }
    let totais: { linhas: number | null; somas: Record<CampoSomado, number | null> } | null = null
    let linhasDoArquivo = 0

    for (let i = 1; i < rows.length; i++) {
      const linha = rows[i] ?? []
      if (linha.every((c) => ehVazio(c))) continue

      // A linha de TOTAIS não tem Data Venda — é assim que o legado a reconhecia (`is.na` da
      // segunda coluna), e é o único traço estrutural que ela tem. Mas aqui ela é LIDA.
      if (ehVazio(linha[cDataVenda])) {
        const somas = {} as Record<CampoSomado, number | null>
        for (const campo of CAMPOS_SOMADOS) somas[campo] = toNum(linha[indices[campo] as number])
        const declaradas = toNum(linha[cVendaNumero])
        if (somas.valor_total === null) {
          return erro('ESTRUTURA_INESPERADA',
            `Arquivo "${nome}", linha ${i + 1}: linha sem Data Venda e sem Valor Total — não é ` +
            'linha de dado nem linha de totais. O formato do export mudou.',
            { arquivo: nome, linha: i + 1 })
        }
        if (totais !== null) {
          return erro('ESTRUTURA_INESPERADA',
            `Arquivo "${nome}": mais de uma linha de totais (a segunda na linha ${i + 1}).`,
            { arquivo: nome, linha: i + 1 })
        }
        totais = { linhas: declaradas === null ? null : Math.round(declaradas), somas }
        continue
      }

      const valores: Partial<Record<Campo, unknown>> = {}
      for (const [campo, j] of Object.entries(indices) as [Campo, number][]) valores[campo] = linha[j]
      brutas.push({ arquivo: nome, linha: i + 1, valores })
      linhasDoArquivo++
      for (const campo of CAMPOS_SOMADOS) {
        const bruto = toNum(linha[indices[campo] as number])
        acumuladores[campo].somar(bruto)
        arredondados[campo] += centavosDeBruto(valorEmReais(bruto)) ?? 0
      }
    }

    if (totais === null) {
      return erro('ESTRUTURA_INESPERADA',
        `Arquivo "${nome}" não traz a linha de totais. Ela é a prova que o export carrega: sem ela ` +
        'a carga perde os cinco checksums do arquivo (contrato §4).',
        { arquivo: nome })
    }

    for (const campo of CAMPOS_SOMADOS) {
      checksums.push({
        escopo: 'arquivo',
        chave: [nome],
        campo,
        // A contagem é declarada uma vez por arquivo (na coluna "Venda Nº" da linha de totais);
        // fica presa ao primeiro dos quatro para não ser conferida quatro vezes.
        linhasDeclaradas: campo === 'valor_total' ? totais.linhas : null,
        centavosDeclarados: centavosDeBruto(totais.somas[campo]),
        linhasApuradas: linhasDoArquivo,
        centavosApurados: acumuladores[campo].centavos,
        // Soma dos valores JÁ ARREDONDADOS — é o que a RPC de promoção pode conferir contra a
        // tabela depois do INSERT, já que lá só existe o valor com 2 casas. Nesta base os dois
        // números coincidem nos anexos atuais, mas nada garante que continuem: três casas nascem
        // de divisão de título (parcelamento, rateio, câmbio) e podem aparecer aqui também.
        centavosArredondados: arredondados[campo],
      })
    }
    diagnosticoArquivos.push({
      nome, linhas: linhasDoArquivo, linhasDeclaradas: totais.linhas, colunasNaoMapeadas: naoMapeados,
    })
  }

  // ── Datas e derivadas ───────────────────────────────────────────────────────────────────
  // A menor data de venda do CONJUNTO ancora o calendário de semanas (ver `semanaDoAno`), então
  // as datas têm de ser lidas antes de qualquer derivada.
  const datasVenda: (string | null)[] = brutas.map((b) =>
    lerData(b.valores.data_venda, 'data_venda', b.linha, datasRejeitadas, opcoes.hoje))
  const datasInicio: (string | null)[] = brutas.map((b) =>
    lerData(b.valores.data_inicio, 'data_inicio', b.linha, datasRejeitadas, opcoes.hoje))

  let menorData: string | null = null
  for (const d of datasVenda) if (d !== null && (menorData === null || d < menorData)) menorData = d

  const linhas: VendaProdutoCru[] = brutas.map((b, i) => {
    const setor = apararOuNulo(b.valores.setor)
    const produto = apararOuNulo(b.valores.produto)
    const dataVenda = datasVenda[i]
    return {
      arquivo_origem:   b.arquivo,
      linha_origem:     b.linha,
      venda_numero:     apararOuNulo(b.valores.venda_numero),
      data_venda:       dataVenda,
      data_inicio:      datasInicio[i],
      vendedor:         apararOuNulo(b.valores.vendedor),
      intermediario:    apararOuNulo(b.valores.intermediario),
      pagante:          apararOuNulo(b.valores.pagante),
      passageiros:      apararOuNulo(b.valores.passageiros),
      setor,
      produto,
      tipo_contrato:    apararOuNulo(b.valores.tipo_contrato),
      fornecedor:       apararOuNulo(b.valores.fornecedor),
      receitas:         valorEmReais(b.valores.receitas),
      valor_total:      valorEmReais(b.valores.valor_total),
      situacao:         apararOuNulo(b.valores.situacao),
      operacao_propria: apararOuNulo(b.valores.operacao_propria),
      semana:           dataVenda === null || menorData === null ? null : semanaDoAno(dataVenda, menorData),
      setor_macro:      classificarSetorMacro(setor),
      mes:              dataVenda === null ? null : MES_ABREV[Number(dataVenda.slice(5, 7)) - 1] ?? null,
      setor_micro:      classificarSetorMicro(setor, produto),
      contrato:         produto === 'Contrato de casamento' ? 1 : 0,
      taxa_servico:     produto === 'Taxa de Serviço' ? 1 : 0,
    }
  })

  if (linhas.length === 0) {
    return erro('ESTRUTURA_INESPERADA',
      'Nenhuma venda encontrada nos arquivos da carga — só cabeçalho e linha de totais. Carga ' +
      'vazia é sinal de export errado, não de dia sem venda.',
      { arquivos: diagnosticoArquivos })
  }

  const falhos = checksumsFalhos(checksums, 0)
  if (falhos.length > 0) {
    return erro('CHECKSUM_FALHOU',
      `CHECKSUM REPROVADO: ${falhos.length} de ${checksums.length} conferências não fecharam contra ` +
      'a linha de totais que o próprio export traz. A base NÃO foi alterada.',
      { falhos: falhos.slice(0, 10), total: falhos.length })
  }

  return {
    ok: true,
    linhas,
    checksums,
    datasRejeitadas,
    diagnostico: {
      arquivos: diagnosticoArquivos,
      linhas: linhas.length,
      menorDataVenda: menorData,
      datasRejeitadas: datasRejeitadas.length,
    },
  }
}

