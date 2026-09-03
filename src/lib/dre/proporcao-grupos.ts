// ── Proporção dos grupos sobre a Receita Bruta (v5.9.2) — módulo PURO ─────────
// A série ANUAL da Análise Vertical de cada grupo de despesa: quanto cada um consumiu da
// Receita Bruta, ano a ano. É a leitura que a página não tinha — ela mostrava valores e
// a AV de UM recorte, mas não a TENDÊNCIA da estrutura de custo.
//
// O que isso responde, e nenhum outro card respondia: RH saiu de 32,1% da receita em
// 2024 para 38,9% em 2026. O valor absoluto de RH também cresceu, mas isso é esperado
// numa empresa que fatura mais — o que a proporção mostra é que ele cresceu MAIS RÁPIDO
// que a receita, e é essa a informação de decisão.
//
// ── Por que ANUAL e não mensal ───────────────────────────────────────────────
// A proporção mensal foi MEDIDA na abertura da versão e não serve: um mês de receita
// fraca estoura o percentual e a linha vira serrote. O custo dos serviços, que tem média
// de −4%, marca −26% em abril de 2026 — não porque o custo explodiu, mas porque a receita
// daquele mês foi baixa. Num agregado anual esse efeito se dilui e a tendência aparece.
//
// ── Sinal algébrico, como na tabela ──────────────────────────────────────────
// A AV de despesa é NEGATIVA (−32,1%), e é assim que ela viaja aqui — a mesma convenção
// da coluna AV do demonstrativo. Mostrar o módulo (32,1%) faria a mesma grandeza aparecer
// de dois jeitos na mesma página, que é exatamente o defeito que a v5.7.2 corrigiu ao
// unificar a base da AV. Consequência para quem exibe: a linha DESCE quando o grupo passa
// a consumir mais receita.
//
// Derivada, nunca buscada: sai dos payloads de competência que a página já tem em mãos.

import type { DreMensalLike, DreLinha } from './schemas'
import { avPercentual, baseAv, CHAVE_BASE_AV } from './av'
import { folhasPorGrupo } from './folhas'
import { rotuloBloco, semCaixaAlta } from './rotulo-bloco'
import { passoRedondo } from '@/lib/escala-grafico'

/**
 * Os grupos da grade, na ordem da árvore de competência.
 *
 * Lista ESTÁTICA de chaves pelo mesmo motivo das linhas do Resumo Executivo: o payload não
 * carrega `formula`, e o `tipo` de um bloco é dado editável. O que NÃO é estático são os
 * rótulos e os valores — esses saem do payload vivo.
 *
 * `CUSTO` vem primeiro e é exibido ISOLADO (decisão do Yan): ele é custo direto do serviço
 * prestado, de natureza diferente das seis linhas de despesa que o seguem.
 */
export const GRUPOS_PROPORCAO = [
  'CUSTO', 'ADM', 'COM', 'MKT', 'ESTR', 'RH', 'RHB',
] as const

export interface PontoProporcao {
  ano: number
  /** AV em percentual, com sinal algébrico. `null` = sem base válida naquele ano
   *  (Receita Bruta ausente ou ≤ 0) — o ponto não é plotado, nunca vira zero. */
  av: number | null
  /** O ano não está inteiro na base (é o corrente, coberto até `mesesCobertos`). */
  parcial: boolean
  /** Quantos meses entraram no cálculo — o que permite ao card dizer "2026 · jan–ago". */
  mesesCobertos: number
}

export interface SerieProporcao {
  chave: string
  /** Rótulo VIVO do payload, sem prefixo contábil e sem caixa alta. */
  rotulo: string
  pontos: PontoProporcao[]
  /** Janela do eixo Y — a MESMA amplitude em todas as séries, posicionada no nível desta.
   *  É o que torna a inclinação comparável entre gráficos (ver `escalaComum`). */
  dominio: [number, number]
  /** Marcas do eixo, em múltiplos do passo. Andam junto com `dominio`: com domínio
   *  explícito o Recharts abandona o algoritmo de marcas "bonitas" e divide o intervalo
   *  cru (lição medida na v5.8.1). */
  ticks: number[]
  /** Variação em PONTOS PERCENTUAIS do PRIMEIRO ao ÚLTIMO ponto com AV — a tendência do
   *  período inteiro. `null` sem dois pontos calculáveis. Positivo = o grupo passou a
   *  consumir MENOS receita (melhorou). */
  deltaPp: number | null
  /** Variação do PENÚLTIMO ao ÚLTIMO ponto com AV — o movimento do último ano contra o
   *  anterior. Andam juntos de propósito: uma tendência de três anos pode esconder uma
   *  virada no último, e o contrário também (um salto recente some numa média longa). */
  deltaYoY: number | null
}

/** Um ano de entrada: o payload e quantos meses dele estão cobertos pela base. */
export interface AnoProporcao {
  ano: number
  payload: DreMensalLike
  /** 12 num ano fechado; a janela da cobertura no ano corrente
   *  (ver `janelaYtdCompetencia`). */
  meses: number
}

function acharLinha(p: DreMensalLike, chave: string): DreLinha | undefined {
  return p.linhas.find(l => l.t !== 'cat' && l.chave === chave)
}

/** Soma da linha na janela, em centavos inteiros — a mesma aritmética de `folhas.ts`. */
function ytdCentavos(l: DreLinha, ateMes: number): number {
  let s = 0
  for (const v of l.meses.slice(0, ateMes)) s += Math.round(v * 100)
  return s
}

/**
 * Monta uma série por grupo. `anos` deve vir ASCENDENTE — a ordem do array é a ordem do
 * eixo, e quem exibe não reordena.
 *
 * Ano cujo payload não traz a Receita Bruta (ou a traz ≤ 0) entra com `av: null`: sem
 * denominador não há proporção, e a razão inverteria de sinal com base negativa, dizendo
 * o contrário do que o leitor entende. É a mesma regra do `baseAv`, reusada e não
 * reimplementada.
 */
export function montarProporcaoGrupos(anos: readonly AnoProporcao[]): SerieProporcao[] {
  // Base da AV por ano, calculada UMA vez: é o mesmo denominador para os sete grupos.
  const basePorAno = new Map<number, number | null>()
  const folhasPorAno = new Map<number, Map<string, number>>()

  for (const a of anos) {
    const rb = acharLinha(a.payload, CHAVE_BASE_AV)
    basePorAno.set(a.ano, rb ? baseAv(ytdCentavos(rb, a.meses) / 100) : null)
    folhasPorAno.set(a.ano, folhasPorGrupo(a.payload, a.meses))
  }

  // Rótulos vivos: o ano mais recente que conhecer a chave manda (é o nome vigente).
  const rotulos = new Map<string, string>()
  for (const a of [...anos].reverse()) {
    for (const l of a.payload.linhas) {
      if (l.t === 'cat' || !l.chave) continue
      if (!rotulos.has(l.chave)) rotulos.set(l.chave, semCaixaAlta(rotuloBloco(l.rotulo)))
    }
  }

  const semEscala = GRUPOS_PROPORCAO.map(chave => ({
    chave,
    rotulo: rotulos.get(chave) ?? chave,
    pontos: anos.map(a => ({
      ano: a.ano,
      av: avPercentual(
        (folhasPorAno.get(a.ano)?.get(chave) ?? 0) / 100,
        basePorAno.get(a.ano) ?? null,
      ),
      parcial: a.meses < 12,
      mesesCobertos: a.meses,
    })),
  }))

  // A escala é propriedade do CONJUNTO — por isso é calculada aqui, e não no componente.
  const amplitude = amplitudeComum(semEscala.map(s => s.pontos))

  return semEscala.map(s => ({
    ...s,
    ...janela(s.pontos, amplitude),
    deltaPp: deltaEmPontos(s.pontos, 0),
    deltaYoY: deltaEmPontos(s.pontos, -2),
  }))
}

// ── Escala COMPARÁVEL entre os sete gráficos (v5.9.2) ────────────────────────
// O problema que isto resolve, medido contra a base viva: com o eixo auto-escalado, RH
// (que varia 10,16 p.p.) e Despesas Comerciais (0,36 p.p.) desenhavam a MESMA inclinação,
// porque cada gráfico esticava a própria série até preencher o card. Uma razão de 28×
// desaparecia da tela, e a leitura visual dizia o oposto do dado.
//
// A saída é dar a todos a MESMA ALTURA EM PONTOS PERCENTUAIS, cada janela posicionada no
// nível da própria série. Assim a inclinação vira comparável (mesmos p.p. por pixel) e o
// eixo continua mostrando o nível real — RH em −42%, Comerciais em −16,5%.
//
// ⚠️ O custo, aceito: grupo que varia pouco fica quase reto. Isso é a VERDADE sobre ele,
// e é justamente o que se queria enxergar — mas surpreende quem esperava uma curva, então
// o card anota o Δ em p.p. ao lado do rótulo e o "?" avisa que a escala é comum.

/** Quanto a série de fato varia, em p.p. `0` quando não há dois pontos calculáveis. */
function amplitudeDe(pontos: readonly PontoProporcao[]): number {
  const vs = pontos.map(p => p.av).filter((v): v is number => v !== null)
  if (vs.length < 2) return 0
  return Math.max(...vs) - Math.min(...vs)
}

/** Quantas divisões a régua tem. Quatro dá cinco marcas (as duas pontas e três no meio),
 *  que é o que cabe legível na altura de um mini-gráfico. */
const DIVISOES = 4

/**
 * A altura de eixo que serve a TODAS as séries.
 *
 * Deriva do PASSO, não da amplitude: escolhe-se o passo redondo que divide a maior
 * amplitude em `DIVISOES`, e a janela é `passo × DIVISOES`. Fazer o contrário — arredondar
 * a amplitude e depois dividir — produz passos quebrados (15 / 4 = 3,75) e marcas de eixo
 * ilegíveis.
 *
 * A folga sai de graça do arredondamento: com a maior amplitude em 10,2 p.p., o passo vira
 * 3 e a janela 12, então a maior série usa ~85% da altura e não encosta nas bordas.
 *
 * O piso de 1 p.p. cobre o caso degenerado (todas as séries constantes): sem ele a janela
 * teria altura zero e o eixo colapsaria.
 */
function amplitudeComum(todas: readonly (readonly PontoProporcao[])[]): number {
  const maior = Math.max(1, ...todas.map(amplitudeDe))
  const passo = passoRedondo(maior / DIVISOES)
  // O arredondamento do passo quase sempre cobre a amplitude; quando não cobrir (série
  // que cai exatamente numa fronteira de mantissa), uma divisão a mais resolve.
  return passo * DIVISOES >= maior ? passo * DIVISOES : passo * (DIVISOES + 1)
}

/**
 * A janela desta série: `amplitude` de altura, centrada nos valores dela.
 *
 * ⚠️ O DOMÍNIO não é encaixado na grade do passo — só os TICKS são. A primeira versão
 * alinhava as duas pontas a múltiplos do passo, e isso empurrava a janela para fora da
 * série: com RH (−32,06 a −42,2), a base alinhada em −45 levava o topo a −33 e o ponto de
 * 2024 saía do eixo, sumindo do gráfico. Manter o domínio exato e escolher os ticks DENTRO
 * dele dá as duas coisas — altura idêntica em todas as séries e marcas redondas.
 * (Quem pegou isso foi o caso de contrato contra a base VIVA; os dados sintéticos do teste
 * de módulo não tinham a borda.)
 *
 * O topo nunca passa de 0: são despesas, e acima de zero não há série possível. Quando o
 * limite morde, a janela desce inteira para preservar a altura.
 */
function janela(
  pontos: readonly PontoProporcao[],
  amplitude: number,
): { dominio: [number, number]; ticks: number[] } {
  const passo = amplitude / DIVISOES
  const vs = pontos.map(p => p.av).filter((v): v is number => v !== null)

  // Sem ponto nenhum, uma janela padrão logo abaixo de zero — o gráfico fica vazio, mas
  // com um eixo coerente em vez de `[NaN, NaN]`.
  const centro = vs.length > 0 ? (Math.max(...vs) + Math.min(...vs)) / 2 : -amplitude / 2

  let topo = Math.min(0, centro + amplitude / 2)
  let base = topo - amplitude

  // Se o teto em zero empurrou a base acima do menor valor, desce a janela inteira: a
  // ALTURA é a invariante que não pode ceder — é ela que torna as inclinações comparáveis.
  if (vs.length > 0 && Math.min(...vs) < base) {
    base = Math.min(...vs)
    topo = Math.min(0, base + amplitude)
  }

  const ticks: number[] = []
  for (let t = Math.ceil(base / passo) * passo; t <= topo + 1e-9; t += passo) {
    ticks.push(Number(t.toFixed(6)))
  }

  return { dominio: [base, topo], ticks }
}

/**
 * Variação até o último ponto COM AV, em p.p. Positivo = passou a consumir MENOS receita.
 *
 * `de` escolhe a outra ponta: `0` é o primeiro ponto da série (tendência do período
 * inteiro) e `-2` é o penúltimo (o ano contra o anterior). Índice negativo conta do fim,
 * como `Array.at`.
 *
 * `null` sem dois pontos calculáveis — nunca 0, que afirmaria estabilidade onde só falta
 * medida. Anos sem base saem da conta antes, então o Δ sempre liga dois pontos que
 * existem no gráfico.
 */
function deltaEmPontos(pontos: readonly PontoProporcao[], de: number): number | null {
  const vs = pontos.map(p => p.av).filter((v): v is number => v !== null)
  if (vs.length < 2) return null
  const inicio = vs.at(de)
  if (inicio === undefined) return null
  return vs[vs.length - 1] - inicio
}
