import { z, type ZodType } from 'zod'
import type { RpcLike } from './rpc'

// Validação de SHAPE das respostas de RPCs críticas (F7, v4.12). Complementa o
// unwrapRpc (F5): além de logar erro de RPC, valida o formato do retorno com Zod
// e loga drift (RPC mudou e o tipo não) — falha degrada para null (não quebra a
// tela; alimenta o mesmo "estado de erro" do F5). RPCs novas devem nascer tipadas.
//
// A SEMENTE foi get_mix_produto (v4.12). v4.12.1/M2 estendeu o padrão às 8 RPCs
// críticas: get_mix_produto, get_executiva_kpis, get_tendencia_margem,
// get_ranking_vendedores_range, get_vendas_em_aberto, get_vendas_receita_negativa,
// get_operacoes_weddings e get_carteira_weddings. Cada schema ESPELHA o tipo TS
// correspondente (z.infer estruturalmente compatível); o objeto raiz usa
// .passthrough() para tolerar colunas extras vindas do banco sem falsear o drift.

export function parseRpc<T>(schema: ZodType<T>, res: RpcLike, contexto: string): T | null {
  if (res.error) {
    console.error(`[RPC ${contexto}] ${res.error.message ?? 'erro desconhecido'}`)
    return null
  }
  const parsed = schema.safeParse(res.data)
  if (!parsed.success) {
    console.error(`[RPC ${contexto}] shape inesperado (contrato divergiu?): ${parsed.error.message}`)
    return null
  }
  return parsed.data
}

// ── Schemas das RPCs críticas ────────────────────────────────────────────────

const mixProdutoItem = z.object({
  produto_nome:    z.string(),
  faturamento:     z.number(),
  receita:         z.number(),
  margem_pct:      z.number().nullable(),
  pct_faturamento: z.number(),
})

/** get_mix_produto → { produtos[], outros } */
export const mixProdutoSchema = z.object({
  produtos: z.array(mixProdutoItem),
  outros:   mixProdutoItem.extend({ quantidade_produtos: z.number() }),
}).passthrough() // M13 (v4.17.0): tolera campos extras do retorno real (era o único sem)

/** get_minhas_permissoes → shape REAL da RPC (0119/0125). Movido de sessao.ts (M13)
 *  para o módulo de schemas, p/ o teste de contrato (F7) importá-lo sem puxar server-only. */
export const minhasPermissoesSchema = z.object({
  registrado:           z.boolean(),
  ativo:                z.boolean(),
  permissoes:           z.array(z.string()),
  user_id:              z.string().optional(),
  email:                z.string().nullable().optional(),
  nome:                 z.string().nullable().optional(),
  role_id:              z.number().nullable().optional(),
  role:                 z.string().nullable().optional(),
  precisa_trocar_senha: z.boolean().optional(),
}).passthrough()

// ── get_executiva_kpis → ExecutivaKpis ───────────────────────────────────────

const periodoRef = z.object({
  from: z.string(),
  to:   z.string(),
})

const kpiMetrica = z.object({
  valor:             z.number().nullable(),
  variacao_anterior: z.number().nullable(),
  variacao_yoy:      z.number().nullable(),
  is_pp:             z.boolean().optional(),
})

/** get_executiva_kpis → { periodo, periodo_anterior, periodo_yoy, 6× KpiMetrica } */
export const executivaKpisSchema = z.object({
  periodo:          periodoRef,
  periodo_anterior: periodoRef,
  periodo_yoy:      periodoRef,
  faturamento:      kpiMetrica,
  receita:          kpiMetrica,
  margem_pct:       kpiMetrica,
  vendas:           kpiMetrica,
  ticket_medio:     kpiMetrica,
  receita_media:    kpiMetrica,
}).passthrough()

// ── Metas por Setor (v5.0.0) ─────────────────────────────────────────────────

const metaMensalItem = z.object({
  setor_macro_id: z.number(),
  setor_nome:     z.string(),
  setor_display:  z.string(),
  mes:            z.number(),
  valor_meta:     z.number(),
  pct_receita:    z.number().nullable(),
})

/** metas_listar(p_ano) → { ano, metas[], ultima_alteracao } */
export const metasListarSchema = z.object({
  ano:   z.number(),
  metas: z.array(metaMensalItem),
  ultima_alteracao: z.object({
    alterado_em:  z.string(),
    alterado_por: z.string().nullable(),
  }).nullable(),
}).passthrough()

/** get_contratos_casamento_mes (0249, v5.6.2) — contagem para a "Meta de Assessorias". */
export const contratosCasamentoMesSchema = z.object({
  n_contratos: z.number(),
}).passthrough()

const ritmoDiaItem = z.object({
  data:        z.string(),
  valor_total: z.number(),
  receitas:    z.number(),
})

/** metas_ritmo_diario(p_from,p_to,p_setor) → { serie[], ultima_venda } */
export const metasRitmoDiarioSchema = z.object({
  serie:        z.array(ritmoDiaItem),
  ultima_venda: z.string().nullable(),
}).passthrough()

// ── get_tendencia_margem → TendenciaMargem ───────────────────────────────────

const tendenciaMargemPonto = z.object({
  label:       z.string(),
  data_inicio: z.string(),
  faturamento: z.number(),
  receita:     z.number(),
  margem_pct:  z.number().nullable(),
})

/** get_tendencia_margem → { granularidade, pontos[] } */
export const tendenciaMargemSchema = z.object({
  granularidade: z.enum(['diaria', 'semanal', 'mensal']),
  pontos:        z.array(tendenciaMargemPonto),
}).passthrough()

// ── get_ranking_vendedores_range → RankingVendedorItem[] ─────────────────────

const rankingVendedorItem = z.object({
  vendedor_id: z.number(),
  nome:        z.string(),
  valor_total: z.number(),
  receitas:    z.number(),
  vendas_count: z.number(),
}).passthrough()

/** get_ranking_vendedores_range → RankingVendedorItem[] (array) */
export const rankingVendedoresRangeSchema = z.array(rankingVendedorItem)

// ── get_vendas_em_aberto → VendasEmAberto ────────────────────────────────────

const vendaEmAberto = z.object({
  venda_no:    z.string(),
  data_venda:  z.string(),
  valor_total: z.number(),
  vendedor:    z.string(),
  idade_dias:  z.number(),
}).passthrough()

/** get_vendas_em_aberto → { total, vendas[] } */
export const vendasEmAbertoSchema = z.object({
  total:  z.number(),
  vendas: z.array(vendaEmAberto),
}).passthrough()

// ── get_vendas_receita_negativa → VendasReceitaNegativa ──────────────────────

const vendaReceitaNegativaItem = z.object({
  venda_no:    z.string(),
  data_venda:  z.string(),
  valor_total: z.number(),
  receita:     z.number(),
  vendedor:    z.string(),
}).passthrough()

/** get_vendas_receita_negativa → { total, vendas[] } */
export const vendasReceitaNegativaSchema = z.object({
  total:  z.number(),
  vendas: z.array(vendaReceitaNegativaItem),
}).passthrough()

// ── get_operacoes_weddings → ListaOperacoes ──────────────────────────────────

const operacaoFlag = z.enum(['margem_negativa', 'ncg_alto', 'outlier'])

const operacaoItem = z.object({
  operacao:            z.string(),
  nome_casal:          z.string().nullable(),
  data_evento:         z.string().nullable(),
  situacao:            z.enum(['passado', 'futuro', 'sem_data']),
  faturamento:         z.number(),
  receita:             z.number(),
  margem_pct:          z.number(),
  entradas_total:      z.number(),
  saidas_total:        z.number(),
  resultado_caixa:     z.number(),
  ncg:                 z.number(),
  flags:               z.array(operacaoFlag),
  hotel:               z.string().nullable(),
  custos_internos:     z.number(),
  margem_liquida_pct:  z.number(),
  data_venda_contrato: z.string().nullable(),
  tipo_contrato:       z.string().nullable(),
  // get_operacoes_weddings NÃO emite passageiros_raw (o tipo TS o declarava, mas a
  // RPC nunca o retornou; o componente também não o lê). `.optional()` reflete o
  // contrato real — sem ele, `.nullable()` rejeita o campo ausente (undefined) e a
  // Lista de Operações retornava HTTP 500. (v4.12.1, fix pós-M2.)
  passageiros_raw:     z.string().nullable().optional(),
  convidados:          z.number().nullable(),
  // v5.5.0 — Rendimento potencial do float (R$). `.optional()` pelo mesmo motivo do
  // `passageiros_raw` acima: o campo só existe a partir da migration 0241, e um
  // ambiente que ainda não a tenha aplicado devolveria a chave AUSENTE — que
  // `.nullable()` sozinho rejeita, derrubando a Lista inteira com 500 em vez de
  // apenas não mostrar a coluna.
  rend_float:          z.number().nullable().optional(),
  // v5.5.1 — margem teórica (%), já arredondada a 1 casa pelo SQL. `.optional()`
  // pelo mesmo motivo dos vizinhos: só existe a partir da migration 0246.
  margem_teorica_pct:  z.number().nullable().optional(),
}).passthrough()

/** get_operacoes_weddings → { total, pagina, por_pagina, operacoes[] } (ListaOperacoes) */
export const operacoesWeddingsSchema = z.object({
  total:      z.number(),
  pagina:     z.number(),
  por_pagina: z.number(),
  operacoes:  z.array(operacaoItem),
  // v5.5.0 — último mês FECHADO do CDI, para o sinal de staleness no tooltip.
  taxa_vigente_mes: z.string().nullable().optional(),
}).passthrough()

// ── get_carteira_weddings → CarteiraWeddings ─────────────────────────────────

const carteiraLinha = z.object({
  ano_venda: z.string(),
  valores:   z.record(z.string(), z.number()),  // CarteiraValores: { [ano]: number }
  total:     z.number(),
}).passthrough()

/** get_carteira_weddings → { metrica, anos_casamento[], linhas[] } */
export const carteiraWeddingsSchema = z.object({
  metrica:        z.string(),
  anos_casamento: z.array(z.string()),
  linhas:         z.array(carteiraLinha),
}).passthrough()

// ── Pipeline ATÔMICO de Vendas (v4.15.0/F2-real) — staging → validação → swap ──
// O caminho real da UI (Server Actions de /admin/uploads) passa a consumir o
// pipeline 0116/0118 (ADR-0104). Estes schemas validam o SHAPE dos dois retornos
// jsonb antes de a Action confiar nos campos.

/** validar_carga_staging → pré-validação NÃO-destrutiva. Com staging vazia o retorno
 *  é {ok:false,total:0,erros:[…]} (sem range/contagem) → os extras são .optional()
 *  (reflete o contrato real; .nullable() sozinho reprovaria o campo ausente). */
export const cargaValidacaoSchema = z.object({
  ok:            z.boolean(),
  total:         z.number(),
  erros:         z.array(z.string()),
  data_min:      z.string().nullable().optional(),
  data_max:      z.string().nullable().optional(),
  dim_min:       z.string().nullable().optional(),
  dim_max:       z.string().nullable().optional(),
  fora_do_range: z.number().optional(),
  setor_fora:    z.number().optional(), // v4.16.2: linhas c/ setor/setor_micro fora das dims
  avisos:        z.array(z.string()).optional(), // v4.17.0: avisos não-bloqueantes (queda de operacao_propria)
}).passthrough()
export type CargaValidacao = z.infer<typeof cargaValidacaoSchema>

/** promover_carga_vendas → retorna o jsonb do transform (swap atômico bem-sucedido). */
export const cargaPromocaoSchema = z.object({
  vendas_count:          z.number(),
  fato_venda_item_count: z.number(),
}).passthrough()
export type CargaPromocao = z.infer<typeof cargaPromocaoSchema>

/** status_demonstrativo_competencia (v5.8.0, migration 0255) → contagem, soma em
 *  CENTAVOS INTEIROS, pares distintos e cobertura da base do regime de competência.
 *
 *  Este schema existe com mais rigor que os outros `status_*` de upload (que são lidos
 *  por cast direto) por um motivo concreto: `soma_centavos` alimenta um GATE — o alarme
 *  de ingestão confronta a soma do arquivo com a da base e BLOQUEIA a declaração de
 *  sucesso do upload se divergirem. Um contrato que mudasse em silêncio aqui desarmaria
 *  o alarme em vez de disparar. Com `parseRpc`, shape divergente vira `null` e o alarme
 *  falha FECHADO. (Achado MÉDIO do `revisor` na v5.8.0.) */
export const statusDemonstrativoCompetenciaSchema = z.object({
  total:              z.number(),
  soma_centavos:      z.number(),
  pares:              z.number(),
  cobertura_de:       z.string().nullable(),
  cobertura_ate:      z.string().nullable(),
  ultima_atualizacao: z.string().nullable(),
}).passthrough()
// Sem `export type` do z.infer aqui de propósito: o tipo que os consumidores usam é a
// interface EXPLÍCITA de `src/app/admin/uploads/actions.ts`, sem o índice `unknown` que
// o `.passthrough()` arrasta. Dois tipos com o mesmo nome só confundiriam.

/** provisionar_dre_comp_par (v5.8.0, migration 0260) → quantos pares NOVOS do arquivo
 *  entraram no de-para editável (com destino em branco), e como ficou o total/bandeja.
 *  Validado com Zod, e não por cast, porque `novos` decide se o card avisa o usuário que
 *  há linha nova para classificar — número que não chega é aviso que não aparece. */
export const provisionarDreCompParSchema = z.object({
  novos:   z.number(),
  total:   z.number(),
  bandeja: z.number(),
}).passthrough()

/** cruzar_vendas_setor (v4.28.0, migration 0159) → pares ENCONTRADOS venda→setor.
 *  Array (pode ser vazio). setor_macro é o valor REAL da base ('Lazer', não 'Trips'). */
export const cruzarVendasSetorSchema = z.array(z.object({
  venda_no:    z.string(),
  setor_macro: z.string(),
}).passthrough())
export type CruzarVendasSetor = z.infer<typeof cruzarVendasSetorSchema>

/** buscar_pessoas (v4.29.0 migration 0160; gate estendido 0161) → cadastros (sem
 *  carregado_em). Array (pode ser vazio). Campos TEXT; nome sempre presente (a RPC só
 *  devolve linhas cujo nome casou). Usado pelo Faturamento Corporativo (v4.30.0). */
export const buscarPessoasSchema = z.array(z.object({
  nome:                z.string(),
  razao_social:        z.string().nullable(),
  cnpj:                z.string().nullable(),
  cpf:                 z.string().nullable(),
  cep:                 z.string().nullable(),
  endereco:            z.string().nullable(),
  numero:              z.string().nullable(),
  complemento:         z.string().nullable(),
  bairro:              z.string().nullable(),
  cidade:              z.string().nullable(),
  uf:                  z.string().nullable(),
  pais:                z.string().nullable(),
  inscricao_estadual:  z.string().nullable(),
  inscricao_municipal: z.string().nullable(),
  email:               z.string().nullable(),
  telefone:            z.string().nullable(),
  celular:             z.string().nullable(),
}).passthrough())
export type BuscarPessoas = z.infer<typeof buscarPessoasSchema>

/** Acervo de Documentos (v4.34.0, migration 0165) — item de acervo_listar/acervo_criar.
 *  NUNCA inclui storage_path/criado_por (a RPC não os expõe). */
export const acervoDocSchema = z.object({
  id:            z.number(),
  titulo:        z.string(),
  descricao:     z.string(),
  nome_arquivo:  z.string(),
  mime:          z.string(),
  tamanho_bytes: z.number(),
  criado_em:     z.string(),
}).passthrough()
export type AcervoDocumento = z.infer<typeof acervoDocSchema>

/** acervo_listar → array de documentos, ordenado por título. */
export const acervoListaSchema = z.array(acervoDocSchema)

// ── Inventário de Ativos (v5.6.0, migration 0248) ────────────────────────────
// Os schemas ESPELHAM o `jsonb_build_object` de cada RPC, não o tipo TS (o TS pode prometer
// campo que a função não emite). Raiz com `.passthrough()` pela regra da casa: coluna extra
// vinda do banco não deve falsear um drift que não existe.
//
// `data_movimentacao` e `data_aquisicao` são `date` puro no banco → chegam como 'YYYY-MM-DD'
// (exibir com `fmtDate`, NUNCA com `fmtDataSP`, que aplicaria fuso a um dia sem hora).
// `criado_em` é `timestamptz` → `fmtDataHoraSP`.

const ativoFichaCampos = {
  id:                 z.number(),
  codigo:             z.string(),
  categoria_id:       z.number(),
  categoria_nome:     z.string(),
  descricao:          z.string(),
  numero_serie:       z.string().nullable(),
  fornecedor:         z.string().nullable(),
  data_aquisicao:     z.string().nullable(),
  valor_aquisicao:    z.number().nullable(),
  nota_fiscal:        z.string().nullable(),
  estado_conservacao: z.enum(['novo', 'bom', 'regular', 'ruim']).nullable(),
  obs:                z.string().nullable(),
}

const statusAtivo = z.enum(['em_uso', 'em_estoque', 'em_manutencao', 'emprestado', 'baixado'])

/** patrimonio_listar_ativos → linhas com o estado DERIVADO da última movimentação. */
export const patrimonioAtivosSchema = z.array(z.object({
  ...ativoFichaCampos,
  status:                 statusAtivo,
  area_atual_nome:        z.string().nullable(),
  detentor_atual_nome:    z.string().nullable(),
  local_atual_texto:      z.string().nullable(),
  ultima_movimentacao_em: z.string().nullable(),
}).passthrough())

/** Uma linha do razão, como `detalhe_ativo`/`listar_movimentacoes` a emitem.
 *  `ativo_codigo`/`ativo_descricao` só vêm do razão global — daí `.optional()`, não
 *  `.nullable()`: a chave AUSENTE reprovaria um schema apenas nullable. */
export const patrimonioMovimentacaoSchema = z.object({
  id:                    z.number(),
  ativo_id:              z.number(),
  ativo_codigo:          z.string().optional(),
  ativo_descricao:       z.string().optional(),
  tipo: z.enum([
    'cadastro', 'transferencia', 'devolucao_estoque', 'envio_manutencao',
    'retorno_manutencao', 'emprestimo', 'baixa', 'reativacao',
  ]),
  data_movimentacao:     z.string(),
  area_destino_id:       z.number().nullable(),
  area_destino_nome:     z.string().nullable(),
  detentor_destino_id:   z.number().nullable(),
  detentor_destino_nome: z.string().nullable(),
  destino_texto:         z.string().nullable(),
  motivo_baixa:          z.enum(['venda', 'descarte', 'perda', 'doacao', 'sinistro']).nullable(),
  obs:                   z.string().nullable(),
  registrado_por_rotulo: z.string(),
  criado_em:             z.string(),
}).passthrough()

/** patrimonio_listar_movimentacoes → razão completo (mais recente primeiro). */
export const patrimonioMovimentacoesSchema = z.array(patrimonioMovimentacaoSchema)

/** patrimonio_detalhe_ativo → ficha + histórico, lidos numa única transação (invariante 10). */
export const patrimonioDetalheSchema = z.object({
  ficha:     z.object(ativoFichaCampos).passthrough(),
  historico: z.array(patrimonioMovimentacaoSchema),
}).passthrough()

/** patrimonio_catalogos → o que os formulários precisam para montar seus combos. */
export const patrimonioCatalogosSchema = z.object({
  categorias: z.array(z.object({ id: z.number(), nome: z.string() })),
  areas:      z.array(z.object({ id: z.number(), nome: z.string() })),
  detentores: z.array(z.object({ id: z.number(), nome: z.string(), ativo: z.boolean() })),
  locais:     z.array(z.string()),
}).passthrough()

/** patrimonio_resumo → agregados da Visão geral.
 *  ⚠️ `custo_historico_aquisicao` é CUSTO HISTÓRICO de aquisição dos não-baixados — não é
 *  "valor imobilizado", não tem depreciação e não entra em DRE nem em Fluxo de Caixa
 *  (invariante 9). `sem_valor` conta os não-baixados sem valor informado, que ficam FORA
 *  do somatório em vez de virarem zero. */
export const patrimonioResumoSchema = z.object({
  cadastrados:   z.number(),
  em_uso:        z.number(),
  em_estoque:    z.number(),
  em_manutencao: z.number(),
  emprestados:   z.number(),
  baixados:      z.number(),
  custo_historico_aquisicao: z.number(),
  sem_valor:     z.number(),
  por_categoria: z.array(z.object({ nome: z.string(), n: z.number() })),
  por_area:      z.array(z.object({ nome: z.string(), n: z.number() })),
}).passthrough()
