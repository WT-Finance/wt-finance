import 'server-only'

// Aplicação por base (v6.0.0, M4 — anexo `docs/briefings/anexo-v6-0-0-m4-desenho-da-rota.md`
// §1.1(b) e §2, entrada `aplicar.ts`).
//
// A M4 move o CAMINHO do parse (do navegador para o servidor) — não o pipeline. Este módulo
// roda, a partir das linhas `*Cru` que os parsers da M3 (`./parsers/*`) produzem, EXATAMENTE a
// mesma sequência de RPCs que `src/app/admin/uploads/actions.ts` já executava hoje: mesma
// ordem, mesmo tamanho de lote, mesmos efeitos colaterais, mesmos avisos não-bloqueantes. Cada
// aplicador traz o adaptador `*Cru` → payload da RPC (as RPCs de hoje esperam a forma antiga,
// documentada nos tipos `*Raw` de `@/lib/carga/*`).
//
// Tudo aqui roda com `service_role` (`getAdminClient`) — a MESMA credencial que as Server
// Actions já usavam. A M5 troca este aplicador pelo pipeline ATÔMICO `promover_carga_{base}`
// (quatro bases que ainda são truncar+inserir+regenerar em passos separados) — é lá que a
// credencial `ingestor` do contrato (`docs/contratos/ingestao-v1.md` §1) passa a ser quem
// aplica de fato. Hoje a allowlist da role `ingestor` NEGA `truncar_*` de propósito (migration
// 0274, provado pelo GATE 2) — `service_role` continua sendo a única credencial capaz de rodar
// o pipeline atual, e é por isso que este módulo ainda usa `getAdminClient`.

import { getAdminClient } from '@/lib/supabase/admin'
import { loadMetas } from '@/lib/carga/metas'
import {
  parseRpc, cargaValidacaoSchema, cargaPromocaoSchema,
  statusDemonstrativoCompetenciaSchema, provisionarDreCompParSchema,
} from '@/lib/schemas-rpc'
import { hojeSP } from '@/lib/fmt'
import { somaCentavos } from './parsers/comum'
import { statusDoLancamento } from './parsers/lancamentos-operacao'
import type { BaseIngestao } from './bases'
import type { VendaProdutoCru } from './parsers/vendas-produto'
import type { DemonstrativoCompetenciaCru } from './parsers/demonstrativo-competencia'
import type { LancamentoCategoriaCru } from './parsers/lancamentos-categoria'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Mesmo padrão de `actions.ts`: `.bind(supabase)` porque destacar o método (`const rpc =
 *  supabase.rpc`) perde o `this` e quebra em runtime (lição v5.3.5). */
function rpcDe(): BoundRpc {
  const supabase = getAdminClient()
  return (supabase.rpc as unknown as BoundRpc).bind(supabase)
}

export interface ResultadoAplicacao {
  readonly linhas: number
  readonly avisos: string[]
}

export interface OpcoesAplicacao {
  /**
   * Nome do arquivo de origem — exigido pelas bases que anexam `arquivo_origem` por linha
   * (Demonstrativo, Movimentação, Aberto; era o que a `action` já fazia). Vendas NÃO usa isto:
   * `VendaProdutoCru.arquivo_origem` já vem por linha do parser da M3 (a base aceita N
   * arquivos). Lançamentos por Operação também não usa: `analytics.fato_lancamento_operacao`
   * não tem essa coluna.
   *
   * Divergência do desenho do anexo: o esboço de `aplicarCarga` ali é `(base, linhas)`, sem
   * este campo — mas três dos cinco tipos `*Cru` não carregam `arquivo_origem` por linha, e as
   * RPCs dessas três bases exigem a coluna (migrations 0185/0186/0255). Extensão mínima e
   * documentada; ver o relato desta missão para o orquestrador.
   */
  readonly arquivoOrigem?: string
  /**
   * Chamado após cada lote gravado com sucesso, com o total CUMULATIVO de linhas já aplicadas
   * — é a forma de o chamador (a rota) acompanhar o progresso de uma carga grande sem esperar
   * o retorno final.
   */
  readonly onProgresso?: (linhasAplicadas: number) => void
}

/**
 * Erro de carga: preserva EM QUAL ETAPA a aplicação falhou (`etapa`) e a mensagem ORIGINAL da
 * RPC/validação em `message` — nunca reescrita em prosa genérica. É o que o operador lê para
 * decidir se re-sobe o arquivo ou conserta a origem (skill `ingestao-planilhas` §5).
 */
export class CargaRejeitada extends Error {
  constructor(readonly etapa: string, mensagem: string) {
    super(mensagem)
    this.name = 'CargaRejeitada'
  }
}

// ── Tamanho de lote por base ─────────────────────────────────────────────────────────────────
// Os mesmos valores que o card de `/admin/uploads` já usava — `BASES` em
// `src/app/admin/uploads/page.tsx` (não em `actions.ts`: as Server Actions recebem o lote já
// fatiado pelo cliente e não têm opinião sobre o tamanho; quem decide é o loop do card).
const BATCH_VENDAS = 1000
const BATCH_LANCAMENTOS_OPERACAO = 1000
const BATCH_LANCAMENTOS_MOVIMENTACAO = 500
const BATCH_LANCAMENTOS_ABERTO = 500
const BATCH_DEMONSTRATIVO = 500

// ── Adaptadores `*Cru` → payload da RPC ──────────────────────────────────────────────────────
//
// Cada função abaixo é PURA (sem I/O) e devolve exatamente as chaves que a RPC correspondente
// lê do jsonb — conferidas coluna a coluna contra o `INSERT` real das migrations 0135 (Vendas),
// 0255 (Demonstrativo), 0185/0186 (Movimentação/Aberto) e 0026/0027 (Lançamentos por
// Operação), não contra suposição.

/** `valor_total`/`receitas` de Vendas viajam como STRING — o staging faz `::numeric` na
 *  chegada (skill `ingestao-planilhas` §4; não "corrigir" para `number`). `toFixed(2)`
 *  preserva as duas casas mesmo quando o valor é "redondo" (100 → `"100.00"`, não `"100"`,
 *  que é o que `String(100)` devolveria). */
function dinheiroComoString(v: number | null): string | null {
  return v === null ? null : v.toFixed(2)
}

/**
 * Vendas → `raw.vendas_excel_staging` via `inserir_lote_staging` (migration 0135/0118).
 *
 * Três adaptações que MUDAM dado (anexo M4 §2):
 *   - `data_inicio` (Cru) → `data_inicio_evento` (coluna);
 *   - `contrato`/`taxa_servico`: `0|1` (Cru) → `boolean` (a RPC casta `::boolean`, e o texto
 *     `'0'`/`'1'` também seria aceito pelo Postgres — mas o contrato explícito pede boolean);
 *   - `valor_total`/`receitas`: `number|null` (Cru) → string com 2 casas.
 *
 * `intermediario` do Cru **não tem coluna** em `raw.vendas_excel_staging` hoje — descartado de
 * propósito; a coluna nasce na M5 (decisão 7 do briefing da versão).
 *
 * 🔴 `situacao` do Cru é DELIBERADAMENTE descartada nesta missão, e isto precisa de decisão do
 * Yan antes de mudar. A coluna existe em `raw.vendas_excel` desde a 0038, mas o parser de
 * CLIENTE vivo (`vendas-parser.ts`) nunca a populou — a base recebe `situacao = NULL` em toda
 * carga feita pelo card. O parser da M3 lê a coluna do export e ela tem para onde ir, então
 * mapeá-la seria a coisa "óbvia" a fazer — e mudaria o que duas telas mostram:
 * `analytics.vw_vendas_agregadas` (0040) e `get_vendas_em_aberto`/`get_vendas_em_aberto_weddings`
 * (0114/0121) filtram `situacao = 'Aberta'` ESTRITO. Com a coluna nula, esse filtro não casa
 * nada; preenchê-la faria "Vendas em Aberto" deixar de ser uma lista vazia.
 *
 * Medido nos três anexos de 21/09 (48.865 linhas): `"Fechada"` 48.451, `"Aberta"` 411, e uma
 * célula vazia por arquivo (a linha de totais, que o parser já remove como checksum). Ou seja,
 * o `CHECK (situacao IS NULL OR situacao IN ('Aberta','Fechada'))` da 0038 não seria violado —
 * o risco aqui não é quebrar a carga, é MUDAR NÚMERO em tela.
 *
 * O invariante 1 da versão é "zero mudança de número em qualquer tela", e a lista de exceções
 * visíveis do briefing (sufixo "parcial", carimbo de data, `Intermediário` preenchido) não
 * inclui `situacao`. Pode muito bem ser defeito pré-existente — a coluna foi criada em 0038
 * exatamente para essa tela — mas "ligar uma tela que está apagada" é decisão de produto.
 * Virar isto é trocar `null` por `cru.situacao` nesta linha; o registro está no relato da M4.
 */
export function adaptarVenda(cru: VendaProdutoCru): Record<string, unknown> {
  return {
    arquivo_origem:     cru.arquivo_origem,
    linha_origem:       cru.linha_origem,
    venda_numero:       cru.venda_numero,
    data_venda:         cru.data_venda,
    vendedor:           cru.vendedor,
    pagante:            cru.pagante,
    setor_macro:        cru.setor_macro,
    setor:              cru.setor,
    setor_micro:        cru.setor_micro,
    produto:            cru.produto,
    valor_total:        dinheiroComoString(cru.valor_total),
    receitas:           dinheiroComoString(cru.receitas),
    contrato:           cru.contrato === 1,
    taxa_servico:       cru.taxa_servico === 1,
    semana:             cru.semana,
    mes:                cru.mes,
    data_inicio_evento: cru.data_inicio,
    fornecedor:         cru.fornecedor,
    // 🔴 null de propósito, não esquecimento — ver a nota de `situacao` acima.
    situacao:           null,
    tipo_contrato:      cru.tipo_contrato,
    passageiros:        cru.passageiros,
    operacao_propria:   cru.operacao_propria,
  }
}

/**
 * Demonstrativo de Competência → `raw.demonstrativo_competencia` via
 * `inserir_lote_demonstrativo_competencia` (migration 0255).
 *
 * Única adaptação: `arquivo_origem` anexado por linha — o Cru não o carrega (é base de 1
 * arquivo só), a action já anexava assim.
 */
export function adaptarDemonstrativo(
  cru: DemonstrativoCompetenciaCru,
  arquivoOrigem: string,
): Record<string, unknown> {
  return {
    arquivo_origem: arquivoOrigem,
    tipo:           cru.tipo,
    grupo:          cru.grupo,
    descricao:      cru.descricao,
    ano:            cru.ano,
    mes:            cru.mes,
    mes_num:        cru.mes_num,
    competencia:    cru.competencia,
    valor:          cru.valor,
  }
}

/**
 * Lançamentos por Movimentação → `raw.lancamentos_movimentacao` via
 * `inserir_lote_lancamentos_movimentacao` (migration 0185).
 *
 * ⚠️ Achado que o anexo NÃO lista explicitamente (só cita "arquivo_origem anexado" para esta
 * base): a RPC lê `x->>'venda_no'` e `x->>'data_movimentacao'`, mas o Cru (parser único de
 * `lancamentos-categoria.ts`, compartilhado com Aberto) chama os mesmos campos
 * `venda_numero`/`movimentacao`. É RENOMEAÇÃO, não só anexo de arquivo — confirmado contra o
 * `INSERT` real da migration, não contra a prosa do anexo. O `LancamentoMovimentacaoRaw`
 * antigo (`parse-lancamentos-movimentacao.ts`) já usava `venda_no`/`data_movimentacao`; este
 * adaptador só reproduz o mesmo nome de destino.
 */
export function adaptarLancamentoMovimentacao(
  cru: LancamentoCategoriaCru,
  arquivoOrigem: string,
): Record<string, unknown> {
  return {
    arquivo_origem:      arquivoOrigem,
    numero:              cru.numero,
    venda_no:            cru.venda_numero,
    emissao:             cru.emissao,
    vencimento:          cru.vencimento,
    liquidacao:          cru.liquidacao,
    data_movimentacao:   cru.movimentacao,
    pessoa:              cru.pessoa,
    descricao:           cru.descricao,
    descricao_categoria: cru.descricao_categoria,
    valor:               cru.valor,
    categoria:           cru.categoria,
    grupo_categoria:     cru.grupo_categoria,
    conta:               cru.conta,
  }
}

/**
 * Títulos em Aberto → `raw.titulos_em_aberto` via `inserir_lote_titulos_em_aberto`
 * (migration 0186). Mesma renomeação `venda_numero` → `venda_no` da base irmã; SEM
 * `data_movimentacao` — a tabela não tem essa coluna (é o PREVISTO por vencimento; o campo
 * `movimentacao` do Cru já chega `null` nesta base, por construção do parser).
 */
export function adaptarTituloEmAberto(
  cru: LancamentoCategoriaCru,
  arquivoOrigem: string,
): Record<string, unknown> {
  return {
    arquivo_origem:      arquivoOrigem,
    numero:              cru.numero,
    venda_no:            cru.venda_numero,
    emissao:             cru.emissao,
    vencimento:          cru.vencimento,
    liquidacao:          cru.liquidacao,
    pessoa:              cru.pessoa,
    descricao:           cru.descricao,
    descricao_categoria: cru.descricao_categoria,
    valor:               cru.valor,
    categoria:           cru.categoria,
    grupo_categoria:     cru.grupo_categoria,
    conta:               cru.conta,
  }
}

/**
 * Lançamentos por Operação → direto em `analytics.fato_lancamento_operacao` via
 * `inserir_lote_lancamentos` (migrations 0026/0027) — "sem `raw` própria" (anexo M4 §2); a
 * `raw.lancamentos_operacao` é M5.
 *
 * ⚠️ `status` e `mes_ano` TÊM de continuar sendo gravados nesta missão — e a primeira versão
 * deste adaptador os deixava `null`, o que teria **zerado números em tela**. O Cru não os traz
 * (o CSV do scrape não tem essas colunas; quem as derivava era o script R
 * `docs/legado/scripts-r/analise_casamentos2.R`, e o parser de CLIENTE antigo as lia já
 * prontas do CSV tratado), mas do outro lado há leitor vivo:
 * `SUM(CASE WHEN status = 'Entrada' … 'A Receber Futuro' … 'Saída' … 'A Pagar Futuro')` nas
 * RPCs de Carteira/Próximos/Hotel de Weddings, e `'status', status` no drill-down da operação.
 * Coluna nula ali não dá erro: dá **zero**, em quatro somas que a diretoria lê.
 *
 * O briefing manda calcular `Status` na LEITURA (§5-C) — e é para lá que ele vai, na **M7**,
 * junto com a mudança dos leitores. Enquanto os leitores lerem a coluna, a coluna é escrita:
 * a M4 move o caminho, não a semântica (invariante 1 da versão).
 *
 * As duas derivações são as do R, ao pé da letra:
 *   • `Mes_Ano = format(Data_Final, "%Y-%m")` — `NA` quando não há `Data_Final`.
 *   • `Status  = case_when(Tipo=='Entrada' & Data_Final > hoje ~ 'A Receber Futuro',
 *                          Tipo=='Saída'   & Data_Final > hoje ~ 'A Pagar Futuro',
 *                          TRUE ~ Tipo)`.
 * O `?? cru.tipo` abaixo **é** esse `TRUE ~ Tipo`, e não é detalhe: em R, `NA > data` avalia
 * para `NA`, então a linha sem `Data_Final` nunca casava os dois primeiros ramos e caía no
 * último, nascendo como "Entrada"/"Saída". `statusDoLancamento` (M3) devolve `null` nesse caso
 * de propósito — "a ausência tem nome próprio" —, e é a decisão certa para quando a leitura
 * mudar; aqui ela ainda precisa do fallback, senão os lançamentos sem data final (os 3
 * conhecidos, que não estão nem em Aberto nem em Movimentação) sumiriam das somas de
 * realizado. `hojeSP()` porque "hoje" nesta plataforma é sempre o de São Paulo.
 *
 * `linha_origem` do Cru não tem destino: a tabela não tem essa coluna.
 */
export function adaptarLancamentoOperacao(
  cru: LancamentoOperacaoCru,
  hojeIso: string = hojeSP(),
): Record<string, unknown> {
  return {
    lancamento_n:  cru.lancamento_numero,
    venda_n:       cru.venda_numero,
    pessoa:        cru.pessoa,
    descricao:     cru.descricao,
    liquidacao_dt: cru.liquidacao,
    vencimento_dt: cru.vencimento,
    valor:         cru.valor,
    tipo:          cru.tipo,
    operacao:      cru.operacao,
    status:        statusDoLancamento(cru.tipo, cru.data_final, hojeIso) ?? cru.tipo,
    data_final:    cru.data_final,
    mes_ano:       cru.data_final === null ? null : cru.data_final.slice(0, 7),
  }
}

/**
 * Só linhas com o mínimo que `analytics.fato_lancamento_operacao` exige: `valor`, `tipo`
 * (`CHECK IN ('Entrada','Saída')`) e `operacao` são `NOT NULL` (migration 0026). As linhas
 * placeholder do scrape (`"nada para mostrar"`, `"carregando..."` — ver
 * `parsers/lancamentos-operacao.ts`) têm `valor: null` por construção do parser e caem fora
 * aqui.
 *
 * Achado desta missão, não coberto explicitamente pelo anexo: o parser de CLIENTE antigo
 * (`parse-lancamentos.ts`) aplicava exatamente este filtro ANTES de montar `LancamentoRaw`
 * (pulava linha sem `Operacao`, sem `Valor` coercível, ou com `Tipo` fora de Entrada/Saída) —
 * então a RPC nunca via essas linhas. Hoje, sem `raw.lancamentos_operacao` própria (M5), não
 * há onde a linha rejeitada ficar visível — é aqui, no aplicador, que o filtro precisa
 * acontecer, ou o `INSERT` inteiro do lote falharia por violação de `NOT NULL`/`CHECK` assim
 * que tocasse a primeira linha-placeholder (e, medido no anexo de 21/09, TODO arquivo real
 * tem pelo menos uma).
 */
export function lancamentoOperacaoAplicavel(cru: LancamentoOperacaoCru): boolean {
  return cru.valor !== null && cru.operacao !== null && (cru.tipo === 'Entrada' || cru.tipo === 'Saída')
}

// ── Infra de aplicação em lotes ──────────────────────────────────────────────────────────────

interface ParamsAplicacaoEmLotes {
  readonly rpc: BoundRpc
  /** RPC de truncar/limpar, chamada uma vez, ANTES do primeiro lote — mesma semântica do
   *  `isFirst` das Server Actions (`inserirLoteXAction(lote, isFirst)`). Omitida quando a base
   *  não faz truncate próprio nesta etapa. */
  readonly truncar?: string
  readonly mensagemTruncar?: string
  readonly inserir: string
  readonly payload: readonly Record<string, unknown>[]
  readonly tamanhoDoLote: number
  readonly etapaInserir: string
  readonly onProgresso?: (linhasAplicadas: number) => void
}

/**
 * Aplica `payload` em lotes de `tamanhoDoLote`, chamando `truncar` (se houver) antes do
 * PRIMEIRO lote — e só se houver ao menos uma linha, replicando o comportamento do card: como
 * o loop `for (i=0; i<rows.length; i+=BATCH)` nunca roda com `rows.length === 0`, o truncate
 * também nunca disparava para upload vazio.
 */
async function aplicarEmLotes(p: ParamsAplicacaoEmLotes): Promise<void> {
  let aplicadas = 0
  for (let i = 0; i < p.payload.length; i += p.tamanhoDoLote) {
    if (i === 0 && p.truncar) {
      const { error } = await p.rpc(p.truncar)
      if (error) {
        throw new CargaRejeitada(p.truncar, `${p.mensagemTruncar ?? 'Erro ao limpar tabela'}: ${error.message}`)
      }
    }
    const lote = p.payload.slice(i, i + p.tamanhoDoLote)
    const { error } = await p.rpc(p.inserir, { p_linhas: lote })
    if (error) {
      // A frase sobre a base NÃO é enfeite, e ela muda conforme onde se falhou. O contrato §2.3
      // promete "a base anterior fica intacta", e isso só vale nestas quatro bases enquanto a
      // falha acontece ANTES do TRUNCATE. Depois dele, a base está parcial — e o operador que lê
      // "Erro ao inserir lote" sem essa ressalva pode ir embora achando que não precisa fazer
      // nada. Vendas já dizia "a base atual foi preservada" porque lá é verdade (staging +
      // promoção atômica). Some quando a M5 trouxer `promover_carga_*` para as quatro.
      // Achado MÉDIO do `revisor`.
      const ressalva = p.truncar
        ? ' ⚠️ A base já havia sido limpa quando a falha ocorreu, então está INCOMPLETA: ' +
          'reimporte este arquivo antes de usar os números.'
        : ' A base atual foi preservada.'
      throw new CargaRejeitada(p.etapaInserir, `Erro ao inserir lote: ${error.message}.${ressalva}`)
    }
    aplicadas += lote.length
    p.onProgresso?.(aplicadas)
  }
}

function exigirArquivoOrigem(opcoes: OpcoesAplicacao, base: BaseIngestao): string {
  if (!opcoes.arquivoOrigem) {
    throw new CargaRejeitada(
      'arquivo_origem',
      `A base "${base}" precisa do nome do arquivo de origem (opcoes.arquivoOrigem) — cada ` +
      'linha grava o arquivo que a originou, como a Server Action já fazia.',
    )
  }
  return opcoes.arquivoOrigem
}

/** `regenerar_fluxo_caixa` lê `raw.lancamentos_movimentacao` + `raw.titulos_em_aberto` juntas
 *  — chamada no fim dos finalizar das DUAS bases (era um helper compartilhado em
 *  `actions.ts`). Surfaceia conta nova não classificada como aviso não-bloqueante. */
async function regenerarFluxoCaixa(rpc: BoundRpc): Promise<string[]> {
  const { data, error } = await rpc('regenerar_fluxo_caixa')
  if (error) {
    throw new CargaRejeitada('regenerar_fluxo_caixa', `Erro ao regenerar fluxo de caixa: ${error.message}`)
  }
  const meta = data as { contas_novas?: string[]; contas_novas_n?: number } | null
  const avisos: string[] = []
  if (meta?.contas_novas_n && meta.contas_novas_n > 0) {
    avisos.push(
      `Atenção: ${meta.contas_novas_n} conta(s) nova(s) não classificada(s) automaticamente: ` +
      `${(meta.contas_novas ?? []).join(', ')}. Confira a classificação de cartão em dim_conta_bancaria.`,
    )
  }
  return avisos
}

// ── Aplicadores por base ─────────────────────────────────────────────────────────────────────

/**
 * Vendas — pipeline ATÔMICO (ADR-0111/v4.15.0), sequência exata de
 * `inserirLoteVendasAction`/`finalizarVendasAction`:
 *
 *   `limpar_staging_vendas` (1x) → `inserir_lote_staging` (por lote) → `validar_carga_staging`
 *   → `loadMetas(false)` → `promover_carga_vendas`
 *
 * `loadMetas` roda ENTRE a validação e a promoção — fora da transação do swap, só depois de a
 * carga ter passado na validação (é fácil de esquecer, e o anexo M4 §2 nomeia isto
 * explicitamente).
 */
async function aplicarVendas(
  linhas: readonly VendaProdutoCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = rpcDe()
  const payload = linhas.map(adaptarVenda)

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_vendas',
    mensagemTruncar: 'Erro ao preparar a carga',
    inserir: 'inserir_lote_staging',
    payload,
    tamanhoDoLote: BATCH_VENDAS,
    etapaInserir: 'inserir_lote_staging',
    onProgresso: opcoes.onProgresso,
  })

  const valRes = await rpc('validar_carga_staging')
  if (valRes.error) {
    throw new CargaRejeitada(
      'validar_carga_staging',
      `Erro na validação da carga: ${valRes.error.message}. A base atual foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_staging')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_staging',
      'A validação retornou em formato inesperado. A base atual foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_staging', `${msgs.join(' ')} A base atual foi preservada.`)
  }

  try {
    await loadMetas(false)
  } catch (e) {
    throw new CargaRejeitada('metas', `Erro ao carregar metas: ${e instanceof Error ? e.message : String(e)}`)
  }

  const promRes = await rpc('promover_carga_vendas')
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_vendas',
      `Erro ao promover a carga (base preservada): ${promRes.error.message}`,
    )
  }
  const promocao = parseRpc(cargaPromocaoSchema, promRes, 'promover_carga_vendas')
  if (!promocao) {
    throw new CargaRejeitada('promover_carga_vendas', 'A promoção retornou em formato inesperado.')
  }

  // op_propria (v4.17.0): aviso não-bloqueante que `validar_carga_staging` já devolvia.
  return { linhas: linhas.length, avisos: validacao.avisos ?? [] }
}

/**
 * Demonstrativo de Competência — sequência exata de
 * `inserirLoteDemonstrativoCompetenciaAction`/`finalizarDemonstrativoCompetenciaAction`:
 *
 *   `truncar_demonstrativo_competencia` (1x) → `inserir_lote_demonstrativo_competencia` (por
 *   lote) → `status_demonstrativo_competencia` (ALARME DE INGESTÃO: contagem e soma do
 *   arquivo × gravadas) → `provisionar_dre_comp_par` (depois da conferência — nunca antes: se
 *   a carga não fecha, não se mexe na curadoria).
 */
async function aplicarDemonstrativo(
  linhas: readonly DemonstrativoCompetenciaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'demonstrativo-competencia')
  const payload = linhas.map((l) => adaptarDemonstrativo(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'truncar_demonstrativo_competencia',
    inserir: 'inserir_lote_demonstrativo_competencia',
    payload,
    tamanhoDoLote: BATCH_DEMONSTRATIVO,
    etapaInserir: 'inserir_lote_demonstrativo_competencia',
    onProgresso: opcoes.onProgresso,
  })

  // Alarme de ingestão (v5.8.0): a soma do ARQUIVO é medida pela MESMA função que o teste do
  // parser prova (`somaCentavos`, de `./parsers/comum`) — nunca reimplementada aqui.
  const somaArquivo = somaCentavos(linhas.map((l) => l.valor))
  const statusRes = await rpc('status_demonstrativo_competencia')
  if (statusRes.error) {
    throw new CargaRejeitada(
      'status_demonstrativo_competencia',
      `Erro ao conferir a carga: ${statusRes.error.message}`,
    )
  }
  const status = parseRpc(statusDemonstrativoCompetenciaSchema, statusRes, 'status_demonstrativo_competencia')
  if (!status) {
    throw new CargaRejeitada(
      'status_demonstrativo_competencia',
      'não foi possível ler o status da base de competência (erro na RPC ou contrato divergente — ver log do servidor)',
    )
  }

  const problemas: string[] = []
  if (status.total !== linhas.length) {
    problemas.push(`o arquivo tinha ${linhas.length} linha(s) e a base gravou ${status.total}`)
  }
  if (status.soma_centavos !== somaArquivo) {
    const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    problemas.push(`a soma do arquivo é ${fmt(somaArquivo)} e a da base é ${fmt(status.soma_centavos)}`)
  }
  if (problemas.length > 0) {
    throw new CargaRejeitada(
      'status_demonstrativo_competencia',
      `A carga NÃO fecha com o arquivo: ${problemas.join(' e ')}. A base ficou com o conteúdo ` +
      'enviado, mas confira o arquivo e recarregue antes de usar os números.',
    )
  }

  const avisos: string[] = []
  const prov = await rpc('provisionar_dre_comp_par')
  if (prov.error) {
    avisos.push(
      'A base foi carregada e conferida, mas não foi possível atualizar o de-para editável ' +
      `(${prov.error.message}). Pares novos aparecem como "Não classificadas" no demonstrativo; ` +
      'abrir "Editar estrutura" provisiona de novo.',
    )
  } else {
    const p = parseRpc(provisionarDreCompParSchema, prov, 'provisionar_dre_comp_par')
    if (p && p.novos > 0) {
      avisos.push(
        `${p.novos} par(es) novo(s) do arquivo entraram como "Não classificadas" — classifique-os ` +
        'em Editar estrutura para que entrem no demonstrativo.',
      )
    }
  }

  return { linhas: linhas.length, avisos }
}

/**
 * Lançamentos por Movimentação — sequência exata de
 * `inserirLoteLancamentosMovimentacaoAction`/`finalizarLancamentosMovimentacaoAction`:
 *
 *   `truncar_lancamentos_movimentacao` (1x) → `inserir_lote_lancamentos_movimentacao` (por
 *   lote) → `regenerar_fluxo_caixa` (lê esta base + Aberto).
 */
async function aplicarLancamentosMovimentacao(
  linhas: readonly LancamentoCategoriaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'lancamentos-movimentacao')
  const payload = linhas.map((l) => adaptarLancamentoMovimentacao(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'truncar_lancamentos_movimentacao',
    inserir: 'inserir_lote_lancamentos_movimentacao',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_MOVIMENTACAO,
    etapaInserir: 'inserir_lote_lancamentos_movimentacao',
    onProgresso: opcoes.onProgresso,
  })

  const avisos = await regenerarFluxoCaixa(rpc)
  return { linhas: linhas.length, avisos }
}

/**
 * Títulos em Aberto — sequência exata de
 * `inserirLoteTitulosEmAbertoAction`/`finalizarTitulosEmAbertoAction`:
 *
 *   `truncar_titulos_em_aberto` (1x) → `inserir_lote_titulos_em_aberto` (por lote) →
 *   `regenerar_fluxo_caixa` (lê esta base + Movimentação).
 */
async function aplicarTitulosEmAberto(
  linhas: readonly LancamentoCategoriaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'lancamentos-aberto')
  const payload = linhas.map((l) => adaptarTituloEmAberto(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'truncar_titulos_em_aberto',
    inserir: 'inserir_lote_titulos_em_aberto',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_ABERTO,
    etapaInserir: 'inserir_lote_titulos_em_aberto',
    onProgresso: opcoes.onProgresso,
  })

  const avisos = await regenerarFluxoCaixa(rpc)
  return { linhas: linhas.length, avisos }
}

/**
 * Lançamentos por Operação — sequência exata de
 * `inserirLoteLancamentosAction`/`finalizarLancamentosAction` (o card rotula "Lançamentos por
 * Operação"):
 *
 *   `truncar_lancamentos` (1x) → `inserir_lote_lancamentos` (por lote, só linhas
 *   `lancamentoOperacaoAplicavel`) → `regenerar_dim_operacao_weddings`.
 */
async function aplicarLancamentosOperacao(
  linhas: readonly LancamentoOperacaoCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = rpcDe()
  const aplicaveis = linhas.filter(lancamentoOperacaoAplicavel)
  // "Hoje" é medido UMA vez para a carga inteira, não por linha: `status` compara `data_final`
  // com hoje, e uma carga que atravessasse a virada do dia classificaria as primeiras linhas
  // por um dia e as últimas por outro. O `.map` também exige a lambda explícita — passar a
  // função direto entregaria o ÍNDICE do array no lugar da data (o `tsc` pegou).
  const hoje = hojeSP()
  const payload = aplicaveis.map((cru) => adaptarLancamentoOperacao(cru, hoje))

  await aplicarEmLotes({
    rpc,
    truncar: 'truncar_lancamentos',
    inserir: 'inserir_lote_lancamentos',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_OPERACAO,
    etapaInserir: 'inserir_lote_lancamentos',
    onProgresso: opcoes.onProgresso,
  })

  const { error } = await rpc('regenerar_dim_operacao_weddings')
  if (error) {
    throw new CargaRejeitada('regenerar_dim_operacao_weddings', `Erro ao regenerar operações: ${error.message}`)
  }

  const avisos: string[] = []
  const descartadas = linhas.length - aplicaveis.length
  if (descartadas > 0) {
    avisos.push(
      `${descartadas} linha(s) do arquivo sem operação, valor ou tipo utilizável (placeholder do ` +
      'scrape ou célula vazia) não foram gravadas — mesmo critério que o parser de cliente anterior aplicava.',
    )
  }

  return { linhas: aplicaveis.length, avisos }
}

/**
 * Ponto de entrada único: dado a base e as linhas `*Cru` já parseadas pela M3, aplica até o
 * fim ou falha com `CargaRejeitada` (etapa + mensagem original da RPC).
 */
export async function aplicarCarga(
  base: BaseIngestao,
  linhas: readonly unknown[],
  opcoes: OpcoesAplicacao = {},
): Promise<ResultadoAplicacao> {
  switch (base) {
    case 'vendas-produto':
      return aplicarVendas(linhas as readonly VendaProdutoCru[], opcoes)
    case 'demonstrativo-competencia':
      return aplicarDemonstrativo(linhas as readonly DemonstrativoCompetenciaCru[], opcoes)
    case 'lancamentos-movimentacao':
      return aplicarLancamentosMovimentacao(linhas as readonly LancamentoCategoriaCru[], opcoes)
    case 'lancamentos-aberto':
      return aplicarTitulosEmAberto(linhas as readonly LancamentoCategoriaCru[], opcoes)
    case 'lancamentos-operacao':
      return aplicarLancamentosOperacao(linhas as readonly LancamentoOperacaoCru[], opcoes)
    default: {
      const exaustivo: never = base
      throw new CargaRejeitada('base_desconhecida', `Base de ingestão não reconhecida: ${String(exaustivo)}`)
    }
  }
}
