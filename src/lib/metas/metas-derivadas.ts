import type { MetaMensal } from '@/lib/metas/ritmo'

// ── Agregação e derivação de metas mensais (v5.4.4) ──────────────────────────
// Módulo PURO — sem I/O, sem React. Duas responsabilidades:
//
//  1. `somarPorMes` — a soma de metas de várias linhas num mês, com o alvo de
//     % Rec em MÉDIA PONDERADA pela meta de faturamento. Já existia inline no
//     ramo 'todos' de `metasDoSetor` (Group); virou função porque a v5.4.4 passou
//     a precisar da MESMA conta em dois outros lugares (Weddings derivada e o
//     Total do quadro de Cadastro). Uma definição só, para as três não divergirem.
//
//  2. `aplicarRampaWeddings` — a meta de Weddings deixou de ser entrada direta e
//     passou a ser a SOMA das metas dos subsetores (decisão do Yan, v5.4.4).
//
// ONDE a rampa é aplicada importa, e é contraintuitivo. `metasDoSetor(rows,'todos')`
// — o Group — soma `valor_meta` de TODAS as linhas por (ano,mês), sem olhar setor.
// Então derivar Weddings "dentro" da função, num `if (key === 'Weddings')`, faria o
// card de Weddings mostrar a soma dos subsetores enquanto o Group continuaria
// somando a linha CRUA de `app.meta_setor` — dois números discordando na mesma
// tela. Por isso a derivação acontece UMA vez, sobre o array de linhas, ANTES de
// qualquer painel ser montado: todos passam a ler o mesmo dado já corrigido e
// `metasDoSetor` não precisa saber que a rampa existe.

/** Linha de meta por setor macro, como `metas_listar` devolve. */
export interface MetaSetorRow {
  ano: number
  setor_nome: string
  mes: number
  valor_meta: number
  pct_receita: number | null
}

/** Linha de meta por subsetor de Weddings, como `metas_subsetor_listar` devolve. */
export interface MetaSubsetorRow {
  subsetor: string
  ano: number
  mes: number
  valorMeta: number
  /** Só COMERCIAL tem (constraint no banco). Não entra em soma de R$ nenhuma. */
  metaContratos: number | null
  pctReceita: number | null
}

/** Nome interno do setor no banco (`analytics.dim_setor_macro.nome`). */
export const SETOR_WEDDINGS = 'Weddings'

const chaveMes = (ano: number, mes: number) => `${ano}-${mes}`

/**
 * Soma as metas por (ano,mês). `valorMeta` soma direto; `pctReceita` é a média
 * ponderada pela própria meta de faturamento (Σ VT·pct / Σ VT), considerando só
 * as linhas COM alvo cadastrado — assim um mês grande pesa mais e mês sem alvo
 * não achata a média. `null` enquanto nenhuma linha do mês tiver alvo.
 */
export function somarPorMes(
  itens: readonly { ano: number; mes: number; valorMeta: number; pctReceita: number | null }[],
): MetaMensal[] {
  const porMes = new Map<string, { ano: number; mes: number; vt: number; vtComPct: number; recAlvo: number }>()
  for (const it of itens) {
    const k = chaveMes(it.ano, it.mes)
    const acc = porMes.get(k) ?? { ano: it.ano, mes: it.mes, vt: 0, vtComPct: 0, recAlvo: 0 }
    acc.vt += it.valorMeta
    if (it.pctReceita != null) {
      acc.vtComPct += it.valorMeta
      acc.recAlvo += it.valorMeta * (it.pctReceita / 100)
    }
    porMes.set(k, acc)
  }
  return [...porMes.values()].map(a => ({
    ano: a.ano,
    mes: a.mes,
    valorMeta: a.vt,
    pctReceita: a.vtComPct > 0 ? (a.recAlvo / a.vtComPct) * 100 : null,
  }))
}

export interface ResultadoRampa {
  /** As linhas de meta com Weddings já derivada onde a rampa manda. */
  rows: MetaSetorRow[]
  /** Chaves `ano-mes` cuja meta de Weddings veio da SOMA dos subsetores. */
  mesesDerivados: Set<string>
}

/**
 * A RAMPA. Regra, determinística por mês:
 *
 *   mês COM ao menos uma linha de subsetor → meta de Weddings = soma dos subsetores
 *   mês SEM nenhuma linha de subsetor      → meta de Weddings = a linha de app.meta_setor
 *
 * O segundo ramo existe porque havia R$ 23,8 Mi de metas de Weddings cadastradas
 * para 2026 quando o eixo de subsetor nasceu; e como o Group é a soma dos três
 * setores, travar Weddings sem esse fallback derrubaria também a meta do Group até
 * o último mês ser preenchido à mão. Nada zera na tela, nada é apagado da base, e o
 * Cadastro mostra em qual regime cada mês está — a rampa tem fim VISÍVEL. Quando
 * 2026 estiver distribuído, o segundo ramo pode sair (e o teste que o cobre também).
 *
 * ⚠️ ACOPLAMENTO com o Cadastro: "mês com ao menos uma linha" é o gatilho, então o
 * quadro de subsetores tem de gravar SÓ as células que o usuário tocou. Se ele
 * gravasse zeros para as 12×5 células ao salvar, todo mês passaria a derivado com
 * soma 0 e a meta de Weddings iria a zero de uma vez. Não trocar este gatilho por
 * "soma > 0": isso tornaria impossível cadastrar um mês legitimamente zerado, e o
 * usuário não entenderia por que o valor antigo ressuscitou.
 */
export function aplicarRampaWeddings(
  rows: readonly MetaSetorRow[],
  subs: readonly MetaSubsetorRow[],
): ResultadoRampa {
  const derivada = new Map(somarPorMes(subs).map(m => [chaveMes(m.ano, m.mes), m]))

  const out: MetaSetorRow[] = rows.map(r => {
    if (r.setor_nome !== SETOR_WEDDINGS) return r
    const d = derivada.get(chaveMes(r.ano, r.mes))
    return d ? { ...r, valor_meta: d.valorMeta, pct_receita: d.pctReceita ?? null } : r
  })

  // Mês derivado que ainda NÃO tem linha de Weddings em `app.meta_setor` (subsetor
  // cadastrado para um mês que nunca teve meta de setor): a linha nasce aqui, senão
  // a meta derivada não apareceria nem no card nem no Group.
  const comLinhaDeSetor = new Set(
    rows.filter(r => r.setor_nome === SETOR_WEDDINGS).map(r => chaveMes(r.ano, r.mes)),
  )
  for (const [k, d] of derivada) {
    if (!comLinhaDeSetor.has(k)) {
      out.push({
        ano: d.ano,
        setor_nome: SETOR_WEDDINGS,
        mes: d.mes,
        valor_meta: d.valorMeta,
        pct_receita: d.pctReceita ?? null,
      })
    }
  }

  return { rows: out, mesesDerivados: new Set(derivada.keys()) }
}

/** `true` se a meta de Weddings daquele mês veio da soma (para o Cadastro rotular o regime). */
export function mesDerivado(mesesDerivados: Set<string>, ano: number, mes: number): boolean {
  return mesesDerivados.has(chaveMes(ano, mes))
}
