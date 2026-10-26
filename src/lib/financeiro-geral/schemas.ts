import { z } from 'zod'

// ── Schemas Zod das RPCs de "Financeiro · Geral" (v6.4.0 · migrations 0296/0297) ────────────────
// Regra do projeto: o schema reflete o retorno REAL da RPC, não o tipo gerado — as RPCs devolvem
// `json` (database.ts tipa como `Json`), então o `tsc` não protege nada aqui: é este schema, via
// `parseRpc`, que impede um campo ausente de chegar à UI. A prova contra a RPC viva é o caso de
// contrato em `src/lib/rpc-contrato.test.ts` (M7); `schemas.test.ts` cobre o que dá para provar sem
// banco (o formato do contrato de `docs/briefings/spec-v6-4-0-contratos.md` §2/§3 e os estados
// limite: sem base, ano vazio, array vazio que o Postgres devolve como NULL).
//
// Convenções de tolerância (cada uma já custou caro em outra tela — skill `contrato-rpc-front`):
//  • `jsonb_agg` de conjunto vazio devolve NULL, não `[]` ⇒ todo array vira `lista(...)`, que
//    aceita NULL e entrega `[]`. "Sem linha" é estado normal, nunca drift.
//  • Objeto que a RPC devolve como `null` quando não há base (`carga`, `comparativo`, `atual`,
//    `maior_intervalo_ano`) é `.nullable()`; a CHAVE continua obrigatória (a RPC sempre a emite) —
//    chave que SOME é drift e tem de reprovar.
//  • `ano_anterior_ytd` é só a referência do Δ: `.nullable().optional()` — a falta dele tira o Δ,
//    nunca derruba a seção.
//  • Chave extra é descartada em silêncio (padrão do `z.object`), sem falsear um drift que não existe.
//  • Números: `numeric` do Postgres serializa como número JSON (`z.number()`, sem coerção).
//    Valores com o sinal da DRE (despesa negativa).

/** 'YYYY-MM-DD' (date puro, sem fuso). */
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
/** timestamptz serializado pelo Postgres: ISO COM offset. Exibição sempre por `fmtDataSP`. */
const carimbo = z.string()
const inteiro = z.number().int()
const meses12 = z.array(z.number()).length(12)
const relacao = z.enum(['fechado', 'corrente', 'futuro'])
const mesCorrente = z.number().int().min(1).max(12).nullable()

/** Array que o Postgres pode devolver como NULL (`jsonb_agg` de vazio) → sempre `[]` para a UI. */
function lista<T extends z.ZodType>(item: T) {
  return z.array(item).nullable().transform(v => v ?? [])
}

const serieMensal = z.object({ meses: meses12, total: z.number() })

// ── get_geral_prejuizos(p_ano) ──────────────────────────────────────────────────────────────────

// v6.5.0: a página é só BRUTO. `reversao`/`liquido` saem do contrato do front (a RPC ainda os emite
// até a poda do GATE 2 — chave extra é descartada pelo `z.object`). Entra `por_pessoa`: a lista
// COMPLETA do ano (sem corte), agregada pela pessoa do lançamento no Monde (`fato_fluxo.pessoa`,
// aparada de espaço/tab/CR/LF/`\xa0`); o corte "top N + demais" e a soma de vários anos são do módulo
// puro `prejuizos.ts`, para Σ por pessoa ≡ Σ da série valer por construção (inv. 2).
export const prejuizosSchema = z.object({
  ano: inteiro,
  relacao,
  mes_corrente: mesCorrente,
  prejuizo: serieMensal,
  ano_anterior_ytd: z.object({
    prejuizo: z.number().nullable(),
  }).nullable().optional(),
  por_pessoa: lista(z.object({
    // NULL = lançamento sem pessoa: a UI mostra "(sem pessoa)", nunca descarta (inv. 4).
    pessoa: z.string().nullable(),
    n: inteiro,
    valor: z.number(),
  })),
  bandeja: lista(z.object({
    categoria_id: inteiro,
    rotulo: z.string(),
    total: z.number(),
  })),
  atualizado_em: carimbo.nullable(),
})
export type Prejuizos = z.infer<typeof prejuizosSchema>
export type PrejuizoPessoa = Prejuizos['por_pessoa'][number]

// ── get_geral_recebiveis() ──────────────────────────────────────────────────────────────────────

// v6.5.0 (contrato da "Recebíveis e inadimplência"): o funil em aberto ⊃ vencido ⊃ inadimplente, todos
// da MESMA foto (a última carga), com `valor_final`:
//  • em aberto    = `liquidacao IS NULL`;
//  • vencido      = em aberto com `vencimento < data_posicao`;
//  • inadimplente = em aberto com `conferido = 'Inadimplente'` (a MARCAÇÃO, não o atraso). Marcado com
//    vencimento futuro CONTINUA contando (inv. 3): cai na faixa 'nao_vencido' (rótulo "a vencer"), e a
//    seção avisa. Por isso o funil não é forçado: inadimplente ⊂ vencido vale só fora dessa faixa.
// As chaves da v6.4.0 que a página deixou de usar (`a_vencer`, `marcacao_em_aberto`, `concentracao`,
// `recuperado_ano`, `comparativo`, `evolucao` mensal) saem do contrato do front; a RPC as emite até a
// poda do GATE 2.

export const FAIXAS_ATRASO = ['nao_vencido', '1-30', '31-60', '61-90', '90+'] as const

const contagem = z.object({ n: inteiro, valor: z.number() })

export const recebiveisSchema = z.object({
  // `null` = a base nova ainda não teve carga (estado normal, não erro).
  carga: z.object({
    carga_id: z.string(),
    data_posicao: dataIso,
    gravado_em: carimbo,
  }).nullable(),
  em_aberto: contagem,
  vencido: contagem,
  inadimplente: z.object({
    n: inteiro,
    valor: z.number(),
    // Sobre os INADIMPLENTES; dias = data_posicao − vencimento. Σ faixas ≡ inadimplente (inv. 2).
    faixas: lista(z.object({
      faixa: z.enum(FAIXAS_ATRASO),
      n: inteiro,
      valor: z.number(),
    })),
  }),
  // Inadimplentes agregados por DEVEDOR (`pessoa` aparada de espaço/tab/CR/LF/`\xa0`; NULL = sem nome),
  // em valor decrescente. `top` traz no máximo 10; `demais` fecha a conta: Σ top + demais ≡ inadimplente.
  devedores: z.object({
    top: lista(z.object({
      pessoa: z.string().nullable(),
      n: inteiro,
      valor: z.number(),
      // Maior atraso entre os títulos do devedor, em dias (≤ 0 = ainda não venceu; NULL = sem vencimento).
      maior_atraso: inteiro.nullable(),
    })),
    demais: z.object({ devedores: inteiro, n: inteiro, valor: z.number() }),
  }),
  // Referência do Δ dos três cards: a ÚLTIMA foto ANTERIOR à semana (seg–dom) da posição atual. Se a
  // semana passada não teve carga, é a mais recente antes dela — a tela diz "vs DD/MM", nunca finge que
  // é a semana anterior. `null` = não há foto anterior (o Δ some; não é erro).
  referencia_semana: z.object({
    data_posicao: dataIso,
    em_aberto: contagem,
    vencido: contagem,
    inadimplente: contagem,
  }).nullable(),
  // Última foto de CADA semana com carga (seg–dom), crescente. Semana SEM carga não vem — a UI a mostra
  // como lacuna, nunca zero (inv. 4). A semana da posição atual é parcial (a UI marca).
  evolucao_semanal: lista(z.object({
    semana: dataIso,        // a segunda-feira da semana
    data_posicao: dataIso,  // a foto que representa a semana
    inadimplente_n: inteiro,
    inadimplente_valor: z.number(),
    vencido_valor: z.number(),
  })),
  // Data da 1ª foto (o histórico começa na v6.4 — nunca fabrica zero antes dela).
  historico_desde: dataIso.nullable(),
})
export type Recebiveis = z.infer<typeof recebiveisSchema>
export type FaixaAtraso = (typeof FAIXAS_ATRASO)[number]
export type Devedor = Recebiveis['devedores']['top'][number]
export type SemanaInadimplente = Recebiveis['evolucao_semanal'][number]

// ── get_geral_antecipacoes(p_ano) ───────────────────────────────────────────────────────────────

export const antecipacoesSchema = z.object({
  ano: inteiro,
  relacao,
  mes_corrente: mesCorrente,
  meses: z.array(z.object({
    volume: z.number(),
    liquido: z.number(),
    desconto: z.number(),
    n: inteiro,
  })).length(12),
  total: z.object({
    volume: z.number(),
    liquido: z.number(),
    desconto: z.number(),
    n: inteiro,
    // NULL quando o volume do ano é zero.
    desconto_pct: z.number().nullable(),
  }),
  ano_anterior_ytd: z.object({
    volume: z.number().nullable(),
    desconto: z.number().nullable(),
    n: inteiro.nullable(),
  }).nullable().optional(),
  por_conta: lista(z.object({
    conta: z.string(),
    volume: z.number(),
    desconto: z.number(),
    n: inteiro,
  })),
  // GLOBAL (todas as contas, todos os anos): a RPC devolve o mesmo valor em cada ano lido.
  ultima_data: dataIso.nullable(),
  dias_desde_ultima: inteiro.nullable(),
  // v6.5.0: maior intervalo entre antecipações que TERMINA dentro do ano — inclui o que atravessa a
  // virada (última do ano anterior → primeira do ano) e, no ano corrente, o intervalo EM CURSO (última →
  // hoje). Assim o card nunca mostra um "maior intervalo" menor que os dias sem antecipação.
  maior_intervalo_ano: z.object({
    dias: inteiro,
    de: dataIso,
    ate: dataIso,
  }).nullable(),
  atualizado_em: carimbo.nullable(),
})
export type Antecipacoes = z.infer<typeof antecipacoesSchema>

// ── Gestão das antecipações (0296): antecipacao_listar / antecipacao_historico ────────────────

export const registroAntecipacaoSchema = z.object({
  id: inteiro,
  conta_id: inteiro,
  conta: z.string(),
  data: dataIso,
  valor_antecipado: z.number(),
  valor_liquido: z.number(),
  desconto: z.number(),
  atualizado_em: carimbo.nullable(),
})
export type RegistroAntecipacao = z.infer<typeof registroAntecipacaoSchema>

export const antecipacaoListarSchema = z.object({
  contas: lista(z.object({ id: inteiro, nome: z.string() })),
  registros: lista(registroAntecipacaoSchema),
})
export type ListaAntecipacoes = z.infer<typeof antecipacaoListarSchema>

/** Só os campos de NEGÓCIO do registro (o diário não devolve criado_por/atualizado_em nesta RPC). */
const camposDoRegistro = z.object({
  conta_id: inteiro,
  conta: z.string(),
  data: dataIso,
  valor_antecipado: z.number(),
  valor_liquido: z.number(),
  desconto: z.number(),
})
export type CamposRegistro = z.infer<typeof camposDoRegistro>

export const entradaHistoricoSchema = z.object({
  diario_id: inteiro,
  // I = INSERT, U = UPDATE, D = DELETE. `string` (não enum): um código novo cai no rótulo genérico.
  operacao: z.string(),
  registro_id: inteiro.nullable(),
  usuario_nome: z.string().nullable(),
  quando: carimbo,
  // true = a própria entrada é um "desfazer" (reversão de outra) — não se desfaz um desfazer na tela.
  e_desfazer: z.boolean(),
  antes: camposDoRegistro.nullable(),
  depois: camposDoRegistro.nullable(),
})
export type EntradaHistorico = z.infer<typeof entradaHistoricoSchema>

/** `antecipacao_historico` devolve um ARRAY (NULL quando não há entrada → `[]`). */
export const antecipacaoHistoricoSchema = lista(entradaHistoricoSchema)

/** Retorno de `antecipacao_salvar`: `alterada=false` quando o UPDATE era idêntico (nada gravado). */
export const salvarAntecipacaoSchema = z.object({
  ok: z.boolean(),
  id: inteiro,
  criada: z.boolean(),
  alterada: z.boolean(),
  registro: registroAntecipacaoSchema,
})
export type ResultadoSalvar = z.infer<typeof salvarAntecipacaoSchema>

/** Retorno de `antecipacao_desfazer`: `revertidos=0` ⇒ "nada a desfazer". */
export const desfazerAntecipacaoSchema = z.object({
  revertidos: inteiro,
  total: inteiro,
})
