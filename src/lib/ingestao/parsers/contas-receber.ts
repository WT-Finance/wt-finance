// Parser do CRU de "Contas a receber" do Monde (v6.4.0) — base `contas-receber`.
// Relatório "Contas a pagar e a receber", filtrado em a receber, em Excel → `raw.contas_receber`.
//
// ── O formato (conferido na M1, `docs/auditoria/v6-4-0-m1-export-contas-receber.md`) ────────
//
// 1 aba, cabeçalho na linha 1, 17 colunas, uma linha por TÍTULO e, ao fim, UMA linha de total:
// `Número` numérico (= a contagem de títulos do arquivo) e `Valor Final` (= Σ dos títulos); as outras
// colunas, vazias. É o checksum que o próprio export traz — lido ANTES de ser descartado (skill
// `ingestao-planilhas` §8) — e fecha ao centavo: **um checksum por arquivo**.
//
// ── Lista fechada GRAVADA (invariante 5 da versão) ──────────────────────────────────────────
//
// Só 9 colunas viram campo. As outras 8 (`Documento`, `Observações`, `Conta (Previsão)`, `Valor`,
// `Pendente com:`, `Fatura Cliente Nº`, `Fatura Fornecedor Conferida`, `Fatura Cliente Fechada`) não
// têm campo aqui nem por acidente — existem no arquivo, caem em `colunasNaoMapeadas` do diagnóstico
// e nunca chegam à base. `Pessoa`, `Descrição` e `Operação Própria` carregam NOMES de pessoas em
// parte das linhas: ficam no raw sob a proteção da área `financeiro/geral`, e nenhuma mensagem de
// erro deste módulo reproduz o conteúdo delas (só contagens, números de linha e `Número`).
//
// ── Várias faixas, um arquivo cada ──────────────────────────────────────────────────────────
//
// O Monde limita a pesquisa a 30 mil linhas, então o export vem por faixa de vencimento (N arquivos
// por carga, como Vendas). Cada arquivo fecha sozinho — e é por isso que lacuna ou sobreposição
// entre faixas NÃO é detectável pelo checksum. Duas guardas cobrem isso: `Número` repetido entre
// arquivos reprova a carga (`reconciliarContasReceber`, em `carga.ts`) e uma lacuna entre as faixas
// de vencimento vira AVISO (`lacunasDeVencimento`).
//
// ── Coerção ─────────────────────────────────────────────────────────────────────────────────
//
// Valor e data pelo valor NATIVO da célula, só via `@/lib/carga/coercao` (o lint
// `wt/no-coercao-reimpl` impede reimplementar). Data pela guarda de faixa do contrato (errata 1):
// fora da faixa — inclusive a data ZERO do Excel, que o Monde grava em `Emissão` de alguns títulos —
// o CAMPO sai `null`, é contado e vira aviso; a LINHA permanece (o checksum é do arquivo inteiro).

import { toNum, toCentavos } from '@/lib/carga/coercao'
import {
  apararOuNulo, ehVazio, valorEmReais, lerData, mapearColunas, camposFaltando,
  checksumsFalhos, erro, AcumuladorBruto, centavosDeBruto,
  type Matriz, type Checksum, type DataRejeitada, type Parse,
} from './comum'

export interface ContaReceberCru {
  readonly arquivo_origem: string
  /** Linha no arquivo de origem, 1-based com cabeçalho — o que o humano vê no Excel. */
  readonly linha_origem: number
  /** Texto: pode vir com sufixo `-N` e pode chegar como número nativo da célula. */
  readonly numero: string
  readonly emissao: string | null
  readonly pessoa: string | null
  readonly descricao: string | null
  readonly vencimento: string | null
  readonly liquidacao: string | null
  /** Já arredondado a 2 casas — o que vai para `numeric(18,2)` é exatamente isto. Nunca negativo (zero é legítimo: fatura zerada por compensação). */
  readonly valor_final: number
  readonly conferido: ConferidoContaReceber | null
  readonly operacao_propria: string | null
}

/** O domínio de `Conferido` (CHECK de `raw.contas_receber`); vazio vira `null`. */
export const CONFERIDOS_VALIDOS = ['Sim', 'Pendente', 'Enviado para o banco', 'Inadimplente'] as const
export type ConferidoContaReceber = (typeof CONFERIDOS_VALIDOS)[number]

function ehConferido(s: string): s is ConferidoContaReceber {
  return (CONFERIDOS_VALIDOS as readonly string[]).includes(s)
}

type Campo =
  | 'numero' | 'emissao' | 'pessoa' | 'descricao' | 'vencimento' | 'liquidacao'
  | 'valor_final' | 'conferido' | 'operacao_propria'

/** Só as 9 colunas gravadas. `Valor` (≠ `Valor Final`) e as outras 7 ficam de fora de propósito. */
export const COL_MAP: Readonly<Record<string, Campo>> = {
  'Número':           'numero',
  'Numero':           'numero',
  'Emissão':          'emissao',
  'Pessoa':           'pessoa',
  'Descrição':        'descricao',
  'Vencimento':       'vencimento',
  'Liquidação':       'liquidacao',
  'Valor Final':      'valor_final',
  'Conferido':        'conferido',
  'Operação Própria': 'operacao_propria',
  'Operação Propria': 'operacao_propria',
}

/** Todas exigidas: sem qualquer uma o arquivo não é o relatório certo (coluna que some em silêncio
 *  já custou caro — `Operação Própria`, v4.9.1). */
export const OBRIGATORIOS: readonly Campo[] = [
  'numero', 'emissao', 'pessoa', 'descricao', 'vencimento', 'liquidacao',
  'valor_final', 'conferido', 'operacao_propria',
]

/** Os campos que a linha de total deixa vazios (todos menos `numero` e `valor_final`). */
const CAMPOS_VAZIOS_NO_TOTAL: readonly Campo[] = [
  'emissao', 'pessoa', 'descricao', 'vencimento', 'liquidacao', 'conferido', 'operacao_propria',
]

/** Um arquivo do conjunto — Contas a receber aceita N (um por faixa de vencimento). */
export interface ArquivoContasReceber {
  readonly nome: string
  readonly rows: Matriz
}

/** Faixa de vencimento de um arquivo (`null` quando nenhum título dele tem vencimento válido). */
export interface FaixaVencimento {
  readonly nome: string
  readonly min: string | null
  readonly max: string | null
}

export interface LacunaDeVencimento {
  /** Último dia coberto até aqui (ISO). */
  readonly fim: string
  /** Primeiro dia da faixa seguinte (ISO). */
  readonly inicio: string
  /** Quantos dias SEM cobertura entre os dois (≥ 1). */
  readonly diasSemCobertura: number
  readonly arquivoAntes: string
  readonly arquivoDepois: string
}

const MS_POR_DIA = 86_400_000

function diaEmMs(iso: string): number {
  const [a, m, d] = iso.split('-').map(Number)
  return Date.UTC(a, m - 1, d)
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`, só para texto de aviso (fatia a string — data de calendário puro). */
function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/**
 * Buracos entre as faixas de vencimento. Ordena por início e compara cada faixa com o MAIOR fim visto
 * até ali (faixas que se sobrepõem não geram lacuna). Há lacuna quando o início da próxima está a
 * MAIS de 1 dia do fim anterior — ou seja, sobra ao menos um dia sem cobertura (31/12 → 02/01 deixa
 * 01/01 de fora; 31/12 → 01/01 é contíguo). Faixa sem vencimento válido não entra. Pura.
 */
export function lacunasDeVencimento(faixas: readonly FaixaVencimento[]): LacunaDeVencimento[] {
  const validas = faixas
    .filter((f): f is { nome: string; min: string; max: string } => f.min !== null && f.max !== null)
    .sort((a, b) => (a.min < b.min ? -1 : a.min > b.min ? 1 : 0))
  const lacunas: LacunaDeVencimento[] = []
  if (validas.length === 0) return lacunas
  let fim = validas[0].max
  let arquivoDoFim = validas[0].nome
  for (const f of validas.slice(1)) {
    const dias = (diaEmMs(f.min) - diaEmMs(fim)) / MS_POR_DIA
    if (dias > 1) {
      lacunas.push({ fim, inicio: f.min, diasSemCobertura: dias - 1, arquivoAntes: arquivoDoFim, arquivoDepois: f.nome })
    }
    if (f.max > fim) { fim = f.max; arquivoDoFim = f.nome }
  }
  return lacunas
}

function textoDaLacuna(l: LacunaDeVencimento): string {
  return `entre ${dataBR(l.fim)} ("${l.arquivoAntes}") e ${dataBR(l.inicio)} ("${l.arquivoDepois}"), ` +
    `${l.diasSemCobertura} dia(s) sem cobertura`
}

/** Lê o campo `avisos` do diagnóstico do parse (lista de textos). Vazio se ausente/malformado. */
export function avisosDoDiagnostico(diagnostico: Record<string, unknown>): string[] {
  const a = diagnostico.avisos
  return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
}

/** A linha tem a FORMA da linha de total: os sete campos que ela deixa vazios estão vazios. */
function pareceTotal(linha: readonly unknown[], indices: Partial<Record<Campo, number>>): boolean {
  return CAMPOS_VAZIOS_NO_TOTAL.every((c) => ehVazio(linha[indices[c] as number]))
}

/**
 * Lê N arquivos crus de Contas a receber e devolve as linhas unidas + 1 checksum por arquivo
 * (`{escopo:'arquivo', chave:[nome], campo:'valor_final'}`, tolerância 0). A linha de total de cada
 * arquivo é lida como checksum e não vira registro. Os avisos (emissão/datas fora da faixa, lacuna
 * entre faixas) vão em `diagnostico.avisos`; as faixas de vencimento, em `diagnostico.arquivos`.
 */
export function parseContasReceberRows(
  arquivos: readonly ArquivoContasReceber[],
  opcoes: { hoje?: Date } = {},
): Parse<ContaReceberCru> {
  if (arquivos.length === 0) return erro('FORMATO_INVALIDO', 'Nenhum arquivo na carga.')

  const linhas: ContaReceberCru[] = []
  const checksums: Checksum[] = []
  const datasRejeitadas: DataRejeitada[] = []
  const diagnosticoArquivos: Record<string, unknown>[] = []
  const faixas: FaixaVencimento[] = []

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
        'exportado é "Contas a pagar e a receber", filtrado em a receber.',
        { arquivo: nome, faltando, naoMapeados })
    }
    const c = indices as Record<Campo, number>

    // A linha de total é a ÚLTIMA com conteúdo (o contrato). Não se reconhece por "Número é
    // numérico": um título sem sufixo também pode vir com o número como valor nativo da célula.
    let ultimo = rows.length - 1
    while (ultimo > 0 && (rows[ultimo] ?? []).every((x) => ehVazio(x))) ultimo--
    const linhaTotal = rows[ultimo] ?? []
    const contagemDeclarada = toNum(linhaTotal[c.numero])
    const somaDeclarada = toNum(linhaTotal[c.valor_final])
    if (
      ultimo < 1 || contagemDeclarada === null || !Number.isInteger(contagemDeclarada) ||
      somaDeclarada === null || !pareceTotal(linhaTotal, c)
    ) {
      return erro('ESTRUTURA_INESPERADA',
        `Arquivo "${nome}" não traz a linha de total (a última linha, com a contagem de títulos em ` +
        'Número e a soma em Valor Final). Ela é a prova que o export carrega: sem ela a carga perde a ' +
        'conferência do arquivo.',
        { arquivo: nome })
    }
    if (ultimo === 1) {
      return erro('ESTRUTURA_INESPERADA',
        `Arquivo "${nome}" só traz cabeçalho e linha de total. Carga vazia é sinal de export errado.`,
        { arquivo: nome })
    }

    const acumulador = new AcumuladorBruto()
    let arredondados = 0
    let titulos = 0
    let min: string | null = null
    let max: string | null = null
    const naoPositivos: number[] = []
    const conferidosInvalidos = new Set<string>()

    for (let i = 1; i < ultimo; i++) {
      const linha = rows[i] ?? []
      if (linha.every((x) => ehVazio(x))) continue

      const numero = apararOuNulo(linha[c.numero])
      const bruto = toNum(linha[c.valor_final])
      if (numero === null || bruto === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Arquivo "${nome}", linha ${i + 1}: título sem ${numero === null ? 'Número' : 'Valor Final'} legível. ` +
          'Linha com conteúdo que não fecha um registro não é pulada em silêncio.',
          { arquivo: nome, linha: i + 1 })
      }
      if (pareceTotal(linha, c)) {
        return erro('ESTRUTURA_INESPERADA',
          `Arquivo "${nome}", linha ${i + 1}: segunda linha de total (só Número e Valor Final preenchidos). ` +
          'O arquivo tem uma só linha de total, e ela é a última.',
          { arquivo: nome, linha: i + 1 })
      }
      const valor = valorEmReais(bruto)
      if (valor === null) {
        return erro('ESTRUTURA_INESPERADA',
          `Arquivo "${nome}", linha ${i + 1}: Valor Final ilegível no título ${numero}.`,
          { arquivo: nome, linha: i + 1 })
      }
      if (bruto < 0) naoPositivos.push(i + 1)

      const conferidoBruto = apararOuNulo(linha[c.conferido])
      let conferido: ConferidoContaReceber | null = null
      if (conferidoBruto !== null) {
        if (ehConferido(conferidoBruto)) conferido = conferidoBruto
        else conferidosInvalidos.add(conferidoBruto)
      }

      const emissao = lerData(linha[c.emissao], 'emissao', i + 1, datasRejeitadas, opcoes.hoje)
      const vencimento = lerData(linha[c.vencimento], 'vencimento', i + 1, datasRejeitadas, opcoes.hoje)
      const liquidacao = lerData(linha[c.liquidacao], 'liquidacao', i + 1, datasRejeitadas, opcoes.hoje)
      if (vencimento !== null) {
        if (min === null || vencimento < min) min = vencimento
        if (max === null || vencimento > max) max = vencimento
      }

      linhas.push({
        arquivo_origem: nome,
        linha_origem: i + 1,
        numero,
        emissao,
        pessoa: apararOuNulo(linha[c.pessoa]),
        descricao: apararOuNulo(linha[c.descricao]),
        vencimento,
        liquidacao,
        valor_final: valor,
        conferido,
        operacao_propria: apararOuNulo(linha[c.operacao_propria]),
      })
      acumulador.somar(bruto)
      arredondados += toCentavos(valor) ?? 0
      titulos++
    }

    // Reprova ANTES do checksum: a mensagem certa é a do motivo, não a da soma que não fechou. Um
    // arquivo misto de pagar + receber traz o total COM SINAL e nunca fecharia com a Σ positiva.
    if (naoPositivos.length > 0) {
      return erro('ESTRUTURA_INESPERADA',
        `Arquivo "${nome}": ${naoPositivos.length} título(s) com Valor Final negativo ` +
        `(linhas ${naoPositivos.slice(0, 5).join(', ')}${naoPositivos.length > 5 ? '…' : ''}). Esta base só ` +
        'recebe contas a RECEBER — confira se o relatório foi filtrado em a receber (um arquivo com ' +
        'pagar e receber juntos traz valores negativos).',
        { arquivo: nome, total: naoPositivos.length, linhas: naoPositivos.slice(0, 20) })
    }
    if (conferidosInvalidos.size > 0) {
      return erro('ESTRUTURA_INESPERADA',
        `Arquivo "${nome}": valor(es) de Conferido fora do domínio (${[...conferidosInvalidos].slice(0, 5).join(', ')}). ` +
        `Aceitos: vazio, ${CONFERIDOS_VALIDOS.join(', ')}.`,
        { arquivo: nome, valores: [...conferidosInvalidos].slice(0, 20) })
    }

    checksums.push({
      escopo: 'arquivo',
      chave: [nome],
      campo: 'valor_final',
      linhasDeclaradas: contagemDeclarada,
      centavosDeclarados: centavosDeBruto(somaDeclarada),
      linhasApuradas: titulos,
      centavosApurados: acumulador.centavos,
      // Soma dos valores JÁ ARREDONDADOS — o que a promoção reconfere contra o gravado.
      centavosArredondados: arredondados,
    })
    faixas.push({ nome, min, max })
    diagnosticoArquivos.push({
      nome, linhas: titulos, linhasDeclaradas: contagemDeclarada,
      vencimentoMin: min, vencimentoMax: max, colunasNaoMapeadas: naoMapeados,
    })
  }

  const falhos = checksumsFalhos(checksums, 0)
  if (falhos.length > 0) {
    return erro('CHECKSUM_FALHOU',
      `CHECKSUM REPROVADO: ${falhos.length} de ${checksums.length} arquivo(s) não fecharam contra a ` +
      `linha de total que o próprio export traz (${falhos.map((f) => `"${f.chave[0]}"`).join(', ')}). ` +
      'A base NÃO foi alterada.',
      { falhos: falhos.slice(0, 10), total: falhos.length })
  }

  const avisos: string[] = []
  const rejeitadasDe = (campo: string): number => datasRejeitadas.filter((d) => d.campo === campo).length
  const nEmissao = rejeitadasDe('emissao')
  if (nEmissao > 0) {
    avisos.push(
      `${nEmissao} título(s) com Emissão inválida (data zero ou fora da faixa de datas) — a Emissão fica ` +
      'vazia e o título é gravado normalmente.',
    )
  }
  const nVencimento = rejeitadasDe('vencimento')
  if (nVencimento > 0) {
    avisos.push(
      `${nVencimento} título(s) com Vencimento inválido ou fora da faixa de datas — ficam SEM vencimento ` +
      'e não entram em prazo nem em atraso. Confira no Monde.',
    )
  }
  const nLiquidacao = rejeitadasDe('liquidacao')
  if (nLiquidacao > 0) {
    avisos.push(
      `${nLiquidacao} título(s) com Liquidação inválida ou fora da faixa de datas — são lidos como NÃO ` +
      'liquidados (em aberto). Confira no Monde.',
    )
  }
  const lacunas = lacunasDeVencimento(faixas)
  if (lacunas.length > 0) {
    avisos.push(
      `Lacuna entre as faixas de vencimento dos arquivos: ${lacunas.map(textoDaLacuna).join('; ')}. ` +
      'Títulos com vencimento nesse intervalo não estão em nenhum arquivo — o checksum não detecta isso ' +
      '(cada arquivo fecha sozinho). Se a lacuna não for intencional, exporte a faixa que falta.',
    )
  }

  return {
    ok: true,
    linhas,
    checksums,
    datasRejeitadas,
    diagnostico: {
      arquivos: diagnosticoArquivos,
      linhas: linhas.length,
      datasRejeitadas: datasRejeitadas.length,
      lacunas,
      avisos,
    },
  }
}
