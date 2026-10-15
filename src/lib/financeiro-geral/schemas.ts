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

// ── get_geral_custos_financeiros(p_ano) ─────────────────────────────────────────────────────────

export const GRUPOS_CUSTO = ['cartao', 'antecipacao', 'juros_iof', 'tarifas'] as const
export const GRUPOS_OUTROS = ['cambio', 'receitas_financeiras', 'nao_classificado'] as const

export const custosFinanceirosSchema = z.object({
  ano: inteiro,
  relacao,
  mes_corrente: mesCorrente,
  grupos: lista(z.object({
    // `string`, não enum: um grupo que a UI não conhece cai no rótulo cru em vez de derrubar a seção.
    grupo: z.string(),
    tipo: z.enum(['custo', 'outros']),
    meses: meses12,
    total: z.number(),
    categorias: lista(z.object({
      categoria_id: inteiro,
      rotulo: z.string(),
      meses: meses12,
      total: z.number(),
    })),
  })),
  custos: serieMensal,
  fin: serieMensal,
  receita_bruta: serieMensal,
  ano_anterior_ytd: z.object({
    custos: z.number().nullable(),
    fin: z.number().nullable(),
    receita_bruta: z.number().nullable(),
  }).nullable().optional(),
  atualizado_em: carimbo.nullable(),
})
export type CustosFinanceiros = z.infer<typeof custosFinanceirosSchema>
export type GrupoCustos = CustosFinanceiros['grupos'][number]

// ── get_geral_prejuizos(p_ano) ──────────────────────────────────────────────────────────────────

export const prejuizosSchema = z.object({
  ano: inteiro,
  relacao,
  mes_corrente: mesCorrente,
  prejuizo: serieMensal,
  reversao: serieMensal,
  liquido: serieMensal,
  ano_anterior_ytd: z.object({
    prejuizo: z.number().nullable(),
    reversao: z.number().nullable(),
    liquido: z.number().nullable(),
  }).nullable().optional(),
  bandeja: lista(z.object({
    categoria_id: inteiro,
    rotulo: z.string(),
    total: z.number(),
  })),
  atualizado_em: carimbo.nullable(),
})
export type Prejuizos = z.infer<typeof prejuizosSchema>

// ── get_geral_recebiveis() ──────────────────────────────────────────────────────────────────────

export const FAIXAS_ATRASO = ['nao_vencido', '1-30', '31-60', '61-90', '90+'] as const
/** Na ordem em que a RPC os devolve (0297): Inadimplente, Pendente, Enviado para o banco, Sim (e null por último). */
export const MARCACOES = ['Inadimplente', 'Pendente', 'Enviado para o banco', 'Sim'] as const

export const recebiveisSchema = z.object({
  // `null` = a base nova ainda não teve carga (estado normal, não erro).
  carga: z.object({
    carga_id: z.string(),
    data_posicao: dataIso,
    gravado_em: carimbo,
  }).nullable(),
  a_vencer: z.object({ n: inteiro, valor: z.number() }),
  inadimplente: z.object({
    n: inteiro,
    valor: z.number(),
    faixas: lista(z.object({
      faixa: z.enum(FAIXAS_ATRASO),
      n: inteiro,
      valor: z.number(),
    })),
  }),
  marcacao_em_aberto: lista(z.object({
    // CHECK do banco: vazio→NULL, Sim, Pendente, Enviado para o banco, Inadimplente.
    conferido: z.enum(MARCACOES).nullable(),
    n: inteiro,
    valor: z.number(),
  })),
  concentracao: z.object({
    top: lista(z.object({
      // `pessoa` é texto NULLABLE no raw (célula vazia no export): a UI mostra "(sem nome)".
      pessoa: z.string().nullable(),
      n: inteiro,
      valor: z.number(),
    })),
    valor_top: z.number(),
    // NULL quando não há inadimplente (denominador zero).
    pct_top: z.number().nullable(),
  }),
  recuperado_ano: z.object({
    ano: inteiro.nullable(),
    n: inteiro,
    valor: z.number(),
  }),
  comparativo: z.object({
    data_posicao: dataIso,
    inadimplente_n: inteiro,
    inadimplente_valor: z.number(),
    a_vencer_valor: z.number(),
  }).nullable(),
  evolucao: lista(z.object({
    mes: z.string().regex(/^\d{4}-\d{2}$/),
    data_posicao: dataIso,
    inadimplente_n: inteiro,
    inadimplente_valor: z.number(),
    a_vencer_valor: z.number(),
  })),
  // Data da 1ª foto (o histórico começa na v6.4 — nunca fabrica zero antes dela).
  historico_desde: dataIso.nullable(),
})
export type Recebiveis = z.infer<typeof recebiveisSchema>
export type FaixaAtraso = (typeof FAIXAS_ATRASO)[number]
export type Marcacao = (typeof MARCACOES)[number]

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
  maior_intervalo_ano: z.object({
    dias: inteiro,
    de: dataIso,
    ate: dataIso,
  }).nullable(),
  atualizado_em: carimbo.nullable(),
})
export type Antecipacoes = z.infer<typeof antecipacoesSchema>

// ── get_geral_prazos() ──────────────────────────────────────────────────────────────────────────

export const prazosSchema = z.object({
  // `null` = nenhuma foto de prazos ainda (a migration grava uma inicial, então é raro).
  atual: z.object({
    data: dataIso,
    saldo_receber: z.number(),
    saldo_pagar: z.number(),
    entrada_12m: z.number(),
    pagamento_12m: z.number(),
    janela_de: dataIso,
    janela_ate: dataIso,
    // NULL quando o denominador (entrada/pagamento dos 12 meses) é zero.
    pmr: z.number().nullable(),
    pmp: z.number().nullable(),
    folga: z.number().nullable(),
  }).nullable(),
  serie: lista(z.object({
    data: dataIso,
    pmr: z.number().nullable(),
    pmp: z.number().nullable(),
    folga: z.number().nullable(),
  })),
  historico_desde: dataIso.nullable(),
})
export type Prazos = z.infer<typeof prazosSchema>

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
