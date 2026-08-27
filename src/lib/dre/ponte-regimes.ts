// ── Ponte Competência ↔ Caixa (v5.8.1) — módulo PURO ──────────────────────────
// O instrumento que responde à pergunta que a v5.8.0 criou ao pôr dois regimes na
// mesma página: **por que os dois resultados são diferentes?**
//
// A resposta é uma cascata: parte do resultado por COMPETÊNCIA (fato gerador =
// emissão) e chega ao resultado por CAIXA (fato gerador = movimentação realizada),
// um degrau por balde de conta. Cada degrau é `caixa − competência` daquele balde,
// de modo que `REX_comp + Σ degraus = REX_caixa`.
//
// ── Por que a identidade fecha (e não é um residual disfarçando erro) ────────
// Nos dois regimes o REX é a soma de TODAS as folhas da árvore (provado em álgebra e
// MEDIDO contra produção — ver o cabeçalho de `folhas.ts`). Se cada folha entra em
// exatamente um balde, então:
//
//   Σ degraus = Σ folhas_caixa − Σ folhas_comp = REX_caixa − REX_comp
//
// A identidade é uma CONSEQUÊNCIA do pareamento ser uma partição, não um ajuste. É por
// isso que o teste de totalidade importa mais que o de soma: se um dia alguém acrescentar
// uma folha à árvore e esquecer de pareá-la, o residual a recolhe e a identidade
// continua fechando — silenciosamente, mas correta. O que NÃO pode acontecer é uma
// folha entrar em dois baldes, e é isso que o teste crava.
//
// ── Vocabulário ─────────────────────────────────────────────────────────────
// Vem do anexo `docs/briefings/anexo-v5-8-1-ponte-vocabulario.csv`, com o lado CAIXA
// resolvido nas chaves vivas do repo (o anexo o descrevia por conceito, deixando a
// resolução para o código — "simular contra o dado vivo, nunca presumir"):
//
//   · `FIN ↔ FIN` — o `RFIN` do caixa ("Receitas e Rendimentos Financeiros") foi
//     dissolvido em `FIN` na v5.7.0 (`0251`), então hoje os dois regimes têm um único
//     bloco de Resultado Financeiro. O anexo já supunha isso, e está certo.
//   · `INV ↔ INV + IMOB` — o imobilizado desceu para o bloco de investimentos na
//     v5.7.0; a competência não tem `IMOB` separado.
//   · `DL ↔ DIST_LUCROS` — mesma conta, chaves diferentes nas duas árvores.
//   · `REPASSE` = `ENT_H + PAG_H` (a fórmula viva do bloco `REPASSE` no caixa).
//
// ⚠️ **Distribuição de Lucros tem degrau PRÓPRIO**, e não cai no residual como o anexo
// previa (decisão do Yan na abertura da v5.8.1). Ela existe limpa nos dois lados e
// costuma ser grande: no residual, viraria ruído exatamente no item mais explicável, e
// contaminaria o balde que deveria conter só descasamento de verdade.
//
// ── Narrativa ───────────────────────────────────────────────────────────────
// Gerada por (natureza, sinal) — nunca texto fixo por linha. Uma frase por combinação
// sobrevive a mudanças na árvore; quinze frases escritas à mão envelhecem na primeira
// conta que muda de bloco.

import type { DreMensalLike } from './schemas'
import { folhasPorGrupo, somarGrupos, totalFolhas } from './folhas'
import {
  agruparPequenos, montarCascata,
  type Cascata, type Degrau,
} from './cascata'

/** Como o balde se comporta economicamente — é o que escolhe a frase da narrativa. */
export type Natureza = 'receita' | 'despesa' | 'especial'

export interface ParPonte {
  rotulo: string
  /** Folhas do lado COMPETÊNCIA. Vazio = o balde não existe naquele regime. */
  comp: readonly string[]
  /** Folhas do lado CAIXA. Vazio = idem. */
  caixa: readonly string[]
  natureza: Natureza
  /** Frase fixa das linhas que não seguem a regra de sinal (as exclusivas de regime,
   *  onde "descasamento" não é a leitura certa — não há par a descasar). */
  nota?: string
}

/**
 * O pareamento. **A ordem é a do demonstrativo**, não a de |Δ|: a ponte é uma leitura
 * de conciliação, e o leitor a percorre com a estrutura da DRE na cabeça. (A outra
 * cascata, a da variação, ordena por magnitude — lá o que importa é o que mais pesou.)
 *
 * Toda folha viva das duas árvores aparece exatamente uma vez. O teste de totalidade
 * é o que garante que continue assim.
 */
export const PAREAMENTO_PONTE: readonly ParPonte[] = [
  { rotulo: 'Receita de Vendas',           comp: ['RV'],           caixa: ['RV'],             natureza: 'receita' },
  { rotulo: 'Reembolsos',                  comp: ['REEMB'],        caixa: [],                 natureza: 'especial',
    nota: 'só na competência — excluídos da visão caixa da DRE' },
  { rotulo: 'Repasse',                     comp: [],               caixa: ['ENT_H', 'PAG_H'], natureza: 'especial',
    nota: 'só existe no caixa — float da intermediação: entrada de clientes − pagamento ao fornecedor' },
  { rotulo: 'Impostos e Deduções',         comp: ['IMP_H'],        caixa: ['IMP_H'],          natureza: 'despesa' },
  { rotulo: 'Custo dos Serviços',          comp: ['CUSTO'],        caixa: ['CUSTO'],          natureza: 'despesa' },
  { rotulo: 'Desp. Administrativas',       comp: ['ADM'],          caixa: ['ADM'],            natureza: 'despesa' },
  { rotulo: 'Desp. Comerciais',            comp: ['COM'],          caixa: ['COM'],            natureza: 'despesa' },
  { rotulo: 'Marketing',                   comp: ['MKT'],          caixa: ['MKT'],            natureza: 'despesa' },
  { rotulo: 'Estrutura',                   comp: ['ESTR'],         caixa: ['ESTR'],           natureza: 'despesa' },
  { rotulo: 'RH',                          comp: ['RH'],           caixa: ['RH'],             natureza: 'despesa' },
  { rotulo: 'RH Benefícios',               comp: ['RHB'],          caixa: ['RHB'],            natureza: 'despesa' },
  { rotulo: 'Resultado Financeiro',        comp: ['FIN'],          caixa: ['FIN'],            natureza: 'despesa' },
  { rotulo: 'Rec./Desp. Não Operacionais', comp: ['RNOP', 'DNOP'], caixa: ['RNOP', 'DNOP'],   natureza: 'receita' },
  { rotulo: 'Investimentos/Empréstimos',   comp: ['INV'],          caixa: ['INV', 'IMOB'],    natureza: 'despesa' },
  { rotulo: 'Distribuição de Lucros',      comp: ['DL'],           caixa: ['DIST_LUCROS'],    natureza: 'despesa' },
]

/**
 * A frase do degrau, por (natureza, sinal). Δ = caixa − competência.
 *
 * Despesa (valor negativo nos dois lados): Δ<0 significa que o caixa saiu MAIS negativo
 * que a competência, isto é, pagou-se mais do que se incorreu no período. Δ>0 é o
 * contrário — incorrido que ainda não foi pago.
 *
 * Receita: Δ>0 é caixa acima do reconhecido (recebimento de emissão anterior);
 * Δ<0 é reconhecido que ainda não entrou.
 *
 * `RV` ganha o caso próprio pedido no briefing: em Δ>0 a leitura de negócio é conversão
 * de backlog, e dizer só "recebido além do reconhecido" perderia o nome do fenômeno.
 */
export function narrativaDegrau(par: ParPonte, delta: number): string {
  if (par.nota) return par.nota
  if (delta === 0) return 'sem descasamento no período'

  if (par.natureza === 'receita') {
    if (par.comp[0] === 'RV' && delta > 0) return 'recebido > emitido: conversão de backlog'
    return delta > 0 ? 'recebido além do reconhecido' : 'reconhecido ainda não recebido'
  }

  return delta < 0 ? 'pago além do incorrido no período' : 'incorrido ainda não pago'
}

export interface Ponte extends Cascata {
  /** Folhas que nenhum par reivindicou, por lado — o que alimentou o residual
   *  estrutural. Vazio hoje; existe para o teste e para diagnóstico futuro. */
  naoPareadas: { competencia: string[]; caixa: string[] }
}

/**
 * Monta a ponte na janela `jan..ateMes` (a MESMA nos dois lados — nunca "até hoje" de
 * um lado e "até o mês coberto" do outro, que é o erro que o briefing nomeia).
 */
export function montarPonte(
  comp: DreMensalLike,
  caixa: DreMensalLike,
  ateMes: number,
): Ponte {
  const fComp  = folhasPorGrupo(comp,  ateMes)
  const fCaixa = folhasPorGrupo(caixa, ateMes)

  const rexComp  = totalFolhas(fComp)
  const rexCaixa = totalFolhas(fCaixa)

  const usadasComp  = new Set<string>()
  const usadasCaixa = new Set<string>()
  const degraus: Degrau[] = []

  for (const par of PAREAMENTO_PONTE) {
    for (const k of par.comp)  usadasComp.add(k)
    for (const k of par.caixa) usadasCaixa.add(k)

    const delta = somarGrupos(fCaixa, par.caixa) - somarGrupos(fComp, par.comp)
    degraus.push({ rotulo: par.rotulo, delta, narrativa: narrativaDegrau(par, delta) })
  }

  // Residual ESTRUTURAL: folhas vivas que o pareamento não menciona. Zero com a árvore
  // de hoje; deixa de ser zero no dia em que alguém criar um bloco novo no editor —
  // e nesse dia a ponte continua fechando, com o valor visível num balde nomeado em vez
  // de desaparecer.
  const sobraComp  = [...fComp ].filter(([k]) => !usadasComp .has(k))
  const sobraCaixa = [...fCaixa].filter(([k]) => !usadasCaixa.has(k))
  const residualEstrutural =
    sobraCaixa.reduce((s, [, v]) => s + v, 0) - sobraComp.reduce((s, [, v]) => s + v, 0)

  const base = montarCascata(
    { rotulo: 'Resultado por competência', valor: rexComp },
    agruparPequenos(degraus, residualEstrutural),
    {
      rotulo: 'Resultado por caixa',
      valor:  rexCaixa,
      nota:   `Δ capital de giro: ${rexCaixa - rexComp >= 0 ? '+' : '−'}${
        Math.abs((rexCaixa - rexComp) / 100).toLocaleString('pt-BR', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        })
      }`,
    },
  )

  return {
    ...base,
    naoPareadas: {
      competencia: sobraComp .map(([k]) => k),
      caixa:       sobraCaixa.map(([k]) => k),
    },
  }
}
