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

  return GRUPOS_PROPORCAO.map(chave => ({
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
}
