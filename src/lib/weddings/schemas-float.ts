import { z } from 'zod'

// Schemas Zod para as duas RPCs do Rendimento potencial do float (v5.5.0), que
// hoje são lidas por CAST direto — sem `parseRpc`, um shape divergente vazaria um
// objeto malformado para a UI em vez de degradar. Os schemas ESPELHAM o
// `jsonb_build_object` real das funções (migration de número mais alto de cada
// uma: `get_rendimento_float` → 0240 `CREATE OR REPLACE`; `get_taxas_cdi` → 0240
// idem — a 0243 só tocou a VIEW, não a assinatura da função), não o tipo TS
// (`RendimentoFloatOperacao` em `src/types/api.ts`), que pode prometer mais do que
// a função de fato emite.

/**
 * Uma operação do `get_rendimento_float`. As quatro métricas (`rendimento`,
 * `rendimento_positivo`, `custo_negativo`, `saldo_medio`) são `.nullable()` — a
 * 0243 fez a view devolver NULL (não zero) quando `dim_taxa_cdi` não tem NENHUM
 * mês fechado (invariante 5 do briefing: NULL vira travessão na UI, nunca "R$
 * 0,00", que mentiria "esta operação não rendeu"). `meses_positivos`/`meses_total`
 * são `COUNT(*)`, sempre não-nulos; `mes_inicio`/`mes_fim` vêm de MIN/MAX(mes) do
 * agrupamento — a operação só aparece no array se tiver ao menos uma linha, então
 * nunca são NULL nesse ponto.
 */
const operacaoFloatItem = z.object({
  operacao:            z.string(),
  rendimento:          z.number().nullable(),
  rendimento_positivo: z.number().nullable(),
  custo_negativo:      z.number().nullable(),
  saldo_medio:         z.number().nullable(),
  meses_positivos:     z.number(),
  meses_total:         z.number(),
  mes_inicio:          z.string().nullable(),
  mes_fim:             z.string().nullable(),
}).passthrough()

/**
 * `get_rendimento_float(p_operacao?)` → { taxa_vigente_mes, operacoes[] }.
 * `taxa_vigente_mes` é `to_char(MAX(mes) FROM dim_taxa_cdi WHERE mes < mês
 * corrente)` — pode ser NULL em teoria, mas a própria RPC lança exceção
 * ('no_data_found') antes de chegar aqui se não houver NENHUM mês fechado; por
 * isso o schema aceita `.nullable()` sem exigir, sem contradizer o guard do SQL.
 * `operacoes` vem de `COALESCE(jsonb_agg(...), '[]'::jsonb)` — nunca ausente.
 */
export const rendimentoFloatSchema = z.object({
  taxa_vigente_mes: z.string().nullable(),
  operacoes:        z.array(operacaoFloatItem),
}).passthrough()

/**
 * Um mês da série do `get_taxas_cdi`. `taxa` é `.nullable()` pelo mesmo motivo do
 * item acima (tabela vazia → `COALESCE(t.taxa, b.taxa_carregada,
 * b.taxa_primeira_serie)` resolve para NULL). `origem` é sempre uma string —
 * 'projetada' quando o mês não bate com nenhuma linha de `dim_taxa_cdi`, senão o
 * valor da coluna `origem` da tabela (`NOT NULL DEFAULT 'bacen_sgs'`, migration
 * 0238).
 */
const mesCdiItem = z.object({
  mes:    z.string(),
  taxa:   z.number().nullable(),
  origem: z.string(),
}).passthrough()

/**
 * `get_taxas_cdi(p_meses_passados?, p_meses_futuros?)` → { taxa_vigente_mes,
 * meses[] }. Ao contrário de `get_rendimento_float`, esta RPC NÃO lança quando a
 * tabela está vazia — `taxa_vigente_mes` fica genuinamente NULL nesse caso
 * (`to_char(MAX(mes) ...)` sobre um conjunto vazio), por isso `.nullable()` aqui
 * é o contrato real, não só uma cautela.
 */
export const taxasCdiSchema = z.object({
  taxa_vigente_mes: z.string().nullable(),
  meses:            z.array(mesCdiItem),
}).passthrough()
