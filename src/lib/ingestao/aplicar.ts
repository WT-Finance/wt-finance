import 'server-only'

// Aplicação por base (v6.0.0, M5 — anexo `docs/briefings/anexo-v6-0-0-m5-desenho-da-atomicidade.md`).
//
// A M4 movia só o CAMINHO do parse (do navegador para o servidor), mantendo o pipeline antigo de
// cada base — truncar_* + inserir_lote_* + regenerar_*, em passos HTTP separados — exceto Vendas,
// que já era atômica desde a v4.15.0 (ADR-0111). A M5 troca ESSE pipeline pelo ATÔMICO que as
// migrations 0277/0278 criaram para as quatro bases restantes, e estende Vendas com uma
// sobrecarga nova. Toda base passa a seguir a MESMA forma:
//
//   `limpar_staging_{base}` (1x) → `inserir_lote_staging_{base}` (por lote) →
//   `validar_carga_{base}` (1x) → `promover_carga_{base}(p_checksums, p_carga_id)` (1x)
//
// `promover_carga_{base}` faz o TRUNCATE + INSERT + regeneração da base VIVA dentro de UMA
// transação, conferindo o checksum do parser CONTRA O QUE FICOU GRAVADO (contrato ingestao-v1
// §4; anexo M5 §4) — qualquer divergência dá `RAISE` e a transação inteira volta. Consequência
// direta: uma reprovação em QUALQUER etapa (staging ou promoção) agora SEMPRE deixa a base
// anterior de pé — diferente do pipeline antigo, em que um `TRUNCATE` direto na base viva podia
// deixá-la parcial se o lote seguinte falhasse (achado MÉDIO do `revisor` na M4, fechado aqui).
//
// Cada aplicador traz o adaptador `*Cru` → payload da RPC — as colunas agora são as da STAGING
// (conferidas coluna a coluna contra o `INSERT` real de cada `inserir_lote_staging_{base}`,
// migration 0278), não mais as da tabela viva ou (Operação) do fato.
//
// A credencial que aplica é o `ingestor` (contrato `docs/contratos/ingestao-v1.md` §1), não mais
// a chave-mestra `service_role`. É o ponto inteiro da versão: numa plataforma em que a RPC é a
// porta de escrita, quem ingere não pode alcançar o que não precisa — foi o `service_role` a
// superfície do incidente de 10/09/2026. A role tem `EXECUTE` só no pipeline das cinco bases
// (allowlist DERIVADA deste código por `scripts/credencial/derivar-allowlist.mjs`; GRANTs na
// migration 0279) e **nenhum acesso ao schema `raw`**.
//
// Medido em 22/09 assumindo a identidade real (`SET LOCAL ROLE ingestor` + claims do JWT, em
// transação revertida contra produção): a credencial limpa a staging, insere, RECUSA o checksum
// errado por CHECKSUM (não por permissão) e APLICA com o certo — enquanto um `SELECT` direto em
// `raw.*` na mesma sessão volta `permission denied for schema raw`.

import { getIngestorClient } from '@/lib/supabase/ingestor'
import { loadMetas } from '@/lib/carga/metas'
import { parseRpc, cargaValidacaoSchema, cargaPromocaoSchema } from '@/lib/schemas-rpc'
import { normalizeHeader, type Checksum } from './parsers/comum'
import type { BaseIngestao } from './bases'
import type { VendaProdutoCru } from './parsers/vendas-produto'
import type { DemonstrativoCompetenciaCru } from './parsers/demonstrativo-competencia'
import type { LancamentoCategoriaCru } from './parsers/lancamentos-categoria'
import type { LancamentoOperacaoCru } from './parsers/lancamentos-operacao'

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/**
 * A credencial que APLICA. Desde a M5 é o `ingestor` (role com EXECUTE só no pipeline das cinco
 * bases), não mais o `service_role` — que é chave-mestra e foi a superfície do incidente de
 * 10/09/2026. Ver `src/lib/supabase/ingestor.ts` para o porquê e para o comportamento
 * fail-closed quando a senha não está no ambiente.
 *
 * Assíncrona porque a credencial é um LOGIN (token de 1 h, cacheado no processo por
 * `tokenMaquina`), não uma chave estática.
 *
 * `.bind(supabase)` porque destacar o método (`const rpc = supabase.rpc`) perde o `this` e
 * quebra em runtime (lição v5.3.5).
 */
async function rpcDe(): Promise<BoundRpc> {
  const supabase = await getIngestorClient()
  return (supabase.rpc as unknown as BoundRpc).bind(supabase)
}

export interface ResultadoAplicacao {
  readonly linhas: number
  readonly avisos: string[]
  /**
   * Quantos checksums a promoção RECONFERIU contra o que ficou gravado no banco (contrato
   * ingestao-v1 §4, anexo M5 §4). Nem todo checksum é reconferível — dois dos quatro campos
   * somados de Vendas não têm coluna própria em `raw.vendas_excel`, e Lançamentos por Operação
   * não tem nenhum checksum monetário no arquivo. "Conferi 0 de N" e "conferi N de N" precisam
   * ter aparência DIFERENTE na resposta da carga — foi exatamente essa distinção que sumiu
   * (cobertura do cruzamento de Vencimento) na M4.
   */
  readonly checksumsConferidos: number
  /** Quantos checksums do lote a RPC RECEBEU mas não tinha como reconferir (sem coluna própria
   *  na base VIVA, ou base sem checksum monetário nenhum) — nunca contados como falha. */
  readonly checksumsNaoConferiveis: number
  /**
   * v6.0.0/M6: quantos PARES NOVOS `promover_carga_demonstrativo` devolveu — só o Demonstrativo
   * preenche isto (as demais bases não têm bandeja de pares); `undefined` nas outras quatro, e
   * `carga.ts` trata `undefined` como 0. Existe porque até a M6 esse número só virava PROSA
   * dentro de `avisos[]` (ver `aplicarDemonstrativo` abaixo) e `carga.ts` respondia sempre
   * `pares_novos: 0` na resposta estruturada — o alarme "par novo na bandeja" (anexo
   * v6.0.0/M6 §4) precisa do NÚMERO, não do texto, para decidir se dispara.
   */
  readonly paresNovos?: number
}

export interface OpcoesAplicacao {
  /**
   * Nome do arquivo de origem — exigido pelas bases que anexam `arquivo_origem` por linha
   * (Demonstrativo, Movimentação, Aberto). Vendas NÃO usa isto: `VendaProdutoCru.arquivo_origem`
   * já vem por linha do parser da M3 (a base aceita N arquivos).
   *
   * 🔁 M5: Lançamentos por Operação PASSA a exigir isto também —
   * `raw.lancamentos_operacao_staging.arquivo_origem` é `NOT NULL` (migration 0277); na M4 a
   * base gravava direto no FATO, que não tem essa coluna, e por isso não precisava dele.
   * Divergência do desenho do anexo M4 (que não previa este campo para Operação), registrada no
   * relato desta missão.
   */
  readonly arquivoOrigem?: string
  /**
   * Chamado após cada lote gravado com sucesso, com o total CUMULATIVO de linhas já aplicadas
   * — é a forma de o chamador (a rota) acompanhar o progresso de uma carga grande sem esperar
   * o retorno final.
   */
  readonly onProgresso?: (linhasAplicadas: number) => void
  /**
   * `carga_id` que torna a promoção idempotente (`ingestao.promocao`, migration 0277) — a partir
   * da M5, TODA base chama `promover_carga_{base}(p_checksums, p_carga_id)`, e repetir a chamada
   * com o MESMO `carga_id` devolve o resultado guardado sem repetir o efeito. Exigido em runtime
   * por `exigirCargaId` (no molde de `exigirArquivoOrigem`).
   */
  readonly cargaId?: string
  /**
   * Checksums que o PARSE apurou desta carga — o que `serializarChecksums*` traduz para o jsonb
   * que `promover_carga_{base}` confere contra o GRAVADO (contrato ingestao-v1 §4, cabeçalho da
   * migration 0278). Ausente vira `[]`: Lançamentos por Operação nunca envia checksum monetário
   * (a RPC dela nem lê este parâmetro — contrato §4).
   */
  readonly checksums?: readonly Checksum[]
  /**
   * Só a base "demonstrativo-competencia": os campos do pivot na ORDEM em que apareceram no
   * arquivo (`ParseOk.diagnostico.campos`, `parsers/demonstrativo-competencia.ts`) — é o que
   * permite a `serializarChecksumsDemonstrativo` remontar a `chave` POSICIONAL do parser em
   * objeto por NOME de coluna, já que nesta base a ordem dos campos é descoberta, não fixa.
   */
  readonly camposPivotDemonstrativo?: readonly string[]
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
// lê do jsonb — conferidas coluna a coluna contra o `INSERT` real de cada `inserir_lote_staging_
// {base}` (migration 0278; Vendas em 0135/0118 + o `CREATE OR REPLACE` da 0278), não contra
// suposição.

/** `valor_total`/`receitas` de Vendas viajam como STRING — o staging faz `::numeric` na
 *  chegada (skill `ingestao-planilhas` §4; não "corrigir" para `number`). `toFixed(2)`
 *  preserva as duas casas mesmo quando o valor é "redondo" (100 → `"100.00"`, não `"100"`,
 *  que é o que `String(100)` devolveria). */
function dinheiroComoString(v: number | null): string | null {
  return v === null ? null : v.toFixed(2)
}

/**
 * Vendas → `raw.vendas_excel_staging` via `inserir_lote_staging` (migration 0135/0118, com o
 * `CREATE OR REPLACE` da 0278 acrescentando `intermediario` ao INSERT).
 *
 * Adaptações que MUDAM dado (anexo M4 §2, mais a de M5 abaixo):
 *   - `data_inicio` (Cru) → `data_inicio_evento` (coluna);
 *   - `contrato`/`taxa_servico`: `0|1` (Cru) → `boolean` (a RPC casta `::boolean`, e o texto
 *     `'0'`/`'1'` também seria aceito pelo Postgres — mas o contrato explícito pede boolean);
 *   - `valor_total`/`receitas`: `number|null` (Cru) → string com 2 casas;
 *   - `intermediario`: a partir da M5 a coluna EXISTE (`raw.vendas_excel.intermediario`,
 *     migration 0277) e passa a ser GRAVADA — decisão 7 do briefing da versão ("Intermediário
 *     volta a ser carregado"; o script R legado zerava a coluna — `mutate(Intermediário = NA)` —,
 *     resíduo, não regra de negócio). Antes da M5 não havia coluna de destino e o campo era
 *     descartado aqui de propósito; o parser da M3 já preservava o dado, só faltava para onde ir.
 *
 * `situacao` PASSA A SER GRAVADA — decisão do Yan em 22/09, e é mudança VISÍVEL de propósito.
 * A coluna existe em `raw.vendas_excel` desde a 0038, criada exatamente para a tela "Vendas em
 * Aberto", mas o parser de CLIENTE que ficou vivo (`vendas-parser.ts`) nunca a populou — a base
 * recebia `situacao = NULL` em toda carga feita pelo card. E `analytics.vw_vendas_agregadas`
 * (0040) e `get_vendas_em_aberto`/`get_vendas_em_aberto_weddings` (0114/0121) filtram
 * `situacao = 'Aberta'` ESTRITO: com a coluna nula, esse filtro não casa nada. A tela existia e
 * não mostrava nada, e ninguém tinha como saber pela tela.
 *
 * Medido nos três anexos de 21/09 (48.865 linhas): `"Fechada"` 48.451, `"Aberta"` 411, e uma
 * célula vazia por arquivo (a linha de totais, que o parser já remove como checksum). Os dois
 * únicos valores cabem no `CHECK (situacao IS NULL OR situacao IN ('Aberta','Fechada'))` da
 * 0038 — não há risco de a carga quebrar por conta disto.
 *
 * ⚠️ É EXCEÇÃO AO INVARIANTE 1 da versão ("zero mudança de número em qualquer tela"), e está
 * registrada como tal: depois da primeira carga de Vendas, "Vendas em Aberto" deixa de ser uma
 * lista vazia e passa a listar as vendas realmente abertas. Quem olhar a tela vai ver número
 * onde não havia — o que é o conserto, não o defeito. Somar-se-á à lista de exceções visíveis
 * (sufixo "parcial", carimbo de data, `Intermediário` preenchido) no out-briefing.
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
    situacao:           cru.situacao,
    tipo_contrato:      cru.tipo_contrato,
    passageiros:        cru.passageiros,
    operacao_propria:   cru.operacao_propria,
    intermediario:      cru.intermediario,
  }
}

/**
 * Demonstrativo de Competência → `raw.demonstrativo_competencia_staging` via
 * `inserir_lote_staging_demonstrativo` (migration 0278; mesmas colunas de
 * `inserir_lote_demonstrativo_competencia`, 0255).
 *
 * Única adaptação: `arquivo_origem` anexado por linha — o Cru não o carrega (é base de 1
 * arquivo só).
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
 * Lançamentos por Movimentação → `raw.lancamentos_movimentacao_staging` via
 * `inserir_lote_staging_movimentacao` (migration 0278; mesmas colunas de
 * `raw.lancamentos_movimentacao`, 0185 — a staging é `LIKE ... INCLUDING DEFAULTS`).
 *
 * ⚠️ Achado que o anexo NÃO lista explicitamente (só cita "arquivo_origem anexado" para esta
 * base): a RPC lê `x->>'venda_no'` e `x->>'data_movimentacao'`, mas o Cru (parser único de
 * `lancamentos-categoria.ts`, compartilhado com Aberto) chama os mesmos campos
 * `venda_numero`/`movimentacao`. É RENOMEAÇÃO, não só anexo de arquivo — confirmado contra o
 * `INSERT` real da migration, não contra a prosa do anexo.
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
 * Títulos em Aberto → `raw.titulos_em_aberto_staging` via `inserir_lote_staging_aberto`
 * (migration 0278; mesmas colunas de `raw.titulos_em_aberto`, 0186). Mesma renomeação
 * `venda_numero` → `venda_no` da base irmã; SEM `data_movimentacao` — a tabela não tem essa
 * coluna (é o PREVISTO por vencimento; o campo `movimentacao` do Cru já chega `null` nesta
 * base, por construção do parser).
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
 * Lançamentos por Operação → `raw.lancamentos_operacao_staging` via
 * `inserir_lote_staging_operacao` (migration 0277/0278) — MUDANÇA DE FORMA da M5 (anexo §6): até
 * a M4 este adaptador gravava DIRETO em `analytics.fato_lancamento_operacao`; a partir da M5 a
 * cadeia passa a ser staging → raw → fato, e as colunas aqui são as da STAGING/RAW, não mais as
 * do fato.
 *
 * `status`/`mes_ano`/`data_final` NÃO são mais calculados neste adaptador — dependem de "hoje" e
 * passam a ser DERIVADOS dentro de `promover_carga_operacao`, em SQL, com "hoje" de São Paulo
 * lido no banco (anexo M5 §6; a regra do R — `TRUE ~ Tipo` — e o `hojeSP()` que este adaptador
 * usava até a M4 migraram para lá). `linha_origem` agora TEM destino (a staging a guarda; o
 * fato antigo não tinha essa coluna).
 *
 * Nenhum FILTRO acontece aqui: TODAS as linhas do arquivo vão para a staging, inclusive as
 * placeholder do scrape (valor nulo, tipo fora de Entrada/Saída, operação nula) que até a M4
 * eram descartadas em silêncio por este adaptador (via `lancamentoOperacaoAplicavel`). Com
 * `raw.lancamentos_operacao` própria elas passam a ser AUDITÁVEIS (decisão do anexo M5 §6) — é
 * `promover_carga_operacao`, em SQL, quem aplica o mesmo critério de `lancamentoOperacaoAplicavel`
 * ao derivar o fato.
 */
export function adaptarLancamentoOperacao(
  cru: LancamentoOperacaoCru,
  arquivoOrigem: string,
): Record<string, unknown> {
  return {
    arquivo_origem:     arquivoOrigem,
    linha_origem:       cru.linha_origem,
    lancamento_numero:  cru.lancamento_numero,
    venda_numero:       cru.venda_numero,
    pessoa:             cru.pessoa,
    descricao:          cru.descricao,
    liquidacao:         cru.liquidacao,
    vencimento:         cru.vencimento,
    valor:              cru.valor,
    operacao:           cru.operacao,
    tipo:               cru.tipo,
  }
}

/**
 * Só linhas com o mínimo que `analytics.fato_lancamento_operacao` exige: `valor`, `tipo`
 * (`CHECK IN ('Entrada','Saída')`) e `operacao` são `NOT NULL` (migration 0026). As linhas
 * placeholder do scrape (`"nada para mostrar"`, `"carregando..."` — ver
 * `parsers/lancamentos-operacao.ts`) têm `valor: null` por construção do parser.
 *
 * 🔁 M5: este critério NÃO filtra mais o que vai para a STAGING (ver `adaptarLancamentoOperacao`
 * acima) — quem o aplica agora é `promover_carga_operacao`, em SQL, ao derivar o fato a partir de
 * `raw.lancamentos_operacao`. A função continua exportada e em uso: `carga.ts` a usa para prever
 * quantas linhas a base terá DEPOIS da carga (o "depois" do diff, §2.3 passo 8) — a mesma
 * grandeza que a promoção vai gravar de fato.
 */
export function lancamentoOperacaoAplicavel(cru: LancamentoOperacaoCru): boolean {
  return cru.valor !== null && cru.operacao !== null && (cru.tipo === 'Entrada' || cru.tipo === 'Saída')
}

// ── Checksums: parser → jsonb da RPC (contrato do checksum, cabeçalho da migration 0278) ──────
//
// `Checksum.chave` (parser) é POSICIONAL (`readonly string[]`); a RPC quer um OBJETO chaveado
// pelo NOME REAL da coluna — nunca array por posição (o cabeçalho da 0278 explica o motivo: no
// Demonstrativo a ordem dos campos do pivot é DESCOBERTA, e um array posicional exigiria o SQL
// saber essa ordem, que ele não tem como saber).

/**
 * Garante `centavos` (SEMPRE `centavosArredondados`, NUNCA `centavosApurados` — é o único que
 * corresponde ao que a coluna `NUMERIC(x,2)` guarda depois do INSERT, cabeçalho da migration
 * 0278) e preserva `linhas` como `null` quando o arquivo não declarou contagem — "não declarou"
 * não é "declarou zero". Falha ALTO e CEDO se o checksum não tiver `centavosArredondados`: um
 * checksum assim chegando à RPC faria a conferência abortar por alguns centavos, em toda carga —
 * melhor não deixar sair daqui.
 */
function checksumParaRpc(c: Checksum, chave: Record<string, unknown>): Record<string, unknown> {
  if (c.centavosArredondados === undefined) {
    throw new CargaRejeitada(
      'serializar_checksum',
      `Checksum sem "centavosArredondados" (escopo "${c.escopo}") — o parser precisa calculá-lo ` +
      'para a promoção poder conferir contra o gravado (cabeçalho da migration 0278).',
    )
  }
  return {
    escopo: c.escopo,
    chave,
    campo: c.campo,
    linhas: c.linhasDeclaradas,
    centavos: c.centavosArredondados,
  }
}

/** Vendas: `chave` do parser é `[arquivo_origem]` — mesmo nome de coluna da tabela, tradução
 *  trivial (contrato do checksum, cabeçalho da migration 0278). */
export function serializarChecksumsVendas(checksums: readonly Checksum[]): Record<string, unknown>[] {
  return checksums.map((c) => checksumParaRpc(c, { arquivo_origem: c.chave[0] }))
}

/**
 * Movimentação/Aberto: `chave` do parser já usa os MESMOS nomes de coluna
 * (`grupo_categoria`/`categoria`) — sem remapeamento de posição (cabeçalho da migration 0278).
 * Escopo desconhecido PARA em vez de assumir "sem filtro": um escopo que não seja nenhum dos três
 * que `parsers/lancamentos-categoria.ts` produz faria a chave sair vazia em silêncio, e um
 * checksum de grupo/categoria sem filtro soma a tabela inteira — a mesma classe de erro que
 * "não declarou ≠ declarou zero".
 */
export function serializarChecksumsLancamentoCategoria(checksums: readonly Checksum[]): Record<string, unknown>[] {
  return checksums.map((c) => {
    let chave: Record<string, unknown>
    if (c.escopo === 'grupo') {
      chave = { grupo_categoria: c.chave[0] }
    } else if (c.escopo === 'categoria') {
      chave = { grupo_categoria: c.chave[0], categoria: c.chave[1] }
    } else if (c.escopo === 'total-arquivo') {
      chave = {} // soma a tabela inteira, sem filtro — é o que o total do arquivo precisa
    } else {
      throw new CargaRejeitada(
        'serializar_checksum',
        `Checksum de Lançamentos com escopo desconhecido: "${c.escopo}" — só "grupo", "categoria" ` +
        'e "total-arquivo" são esperados nesta base (parsers/lancamentos-categoria.ts).',
      )
    }
    return checksumParaRpc(c, chave)
  })
}

/**
 * Demonstrativo: a ÚNICA base em que a ORDEM dos campos do pivot é DESCOBERTA no arquivo, não
 * fixa (`parsers/demonstrativo-competencia.ts`) — `Checksum.chave[k]` corresponde à POSIÇÃO `k`
 * do pivot, e o campo que ocupa essa posição é `camposPivot[k]`, normalizado pelo MESMO
 * `normalizeHeader` que o parser usa para casar contra `tipo|grupo|descricao|ano|mes` (cabeçalho
 * da migration 0278, "CONTRATO DO CHECKSUM"). `camposPivot` PRECISA vir de
 * `ParseOk.diagnostico.campos` — é o parser quem descobre a ordem; remontá-la por fora seria
 * reinventar essa descoberta, e por isso ela é um parâmetro EXPLÍCITO, não um valor fixo aqui.
 *
 * Posição da chave sem campo correspondente em `camposPivot` PARA em vez de adivinhar — chave
 * incompleta significa "não há como saber a que coluna esta posição corresponde", e prosseguir
 * geraria um filtro que ignora essa coluna em silêncio (o checksum passaria a somar um conjunto
 * mais amplo do que o arquivo declarou).
 */
export function serializarChecksumsDemonstrativo(
  checksums: readonly Checksum[],
  camposPivot: readonly string[],
): Record<string, unknown>[] {
  const camposNorm = camposPivot.map((c) => normalizeHeader(c))
  return checksums.map((c) => {
    const chave: Record<string, unknown> = {}
    c.chave.forEach((valor, i) => {
      const campo = camposNorm[i]
      if (campo === undefined) {
        throw new CargaRejeitada(
          'serializar_checksum',
          `Checksum do Demonstrativo (escopo "${c.escopo}") tem chave na posição ${i}, mas ` +
          `"camposPivot" só declara ${camposPivot.length} campo(s) — não há como saber a que ` +
          'coluna essa posição corresponde. A carga não pode ser promovida sem essa informação.',
        )
      }
      chave[campo] = valor
    })
    return checksumParaRpc(c, chave)
  })
}

// ── Leitura do retorno de `promover_carga_{base}` ────────────────────────────────────────────
//
// Superfície INTERNA (service_role-only, sem consumidor de UI — mesma classe de `ingestao.carga`
// em `log.ts`, que usa o mesmo padrão de guard manual em vez de `parseRpc`/Zod). Fora do escopo
// desta missão tocar `schemas-rpc.ts`/`rpc-contrato.test.ts` (skill `contrato-rpc-front` §3) —
// registrado no relato desta missão para o orquestrador decidir se formaliza com Zod depois.
// Degrada para 0/[] em vez de lançar: um shape que divergisse aqui não pode derrubar uma carga
// que JÁ foi promovida (o dado já está no banco) — só a CONTAGEM exibida ficaria conservadora.

function lerRetornoPromocao(data: unknown): {
  readonly checksumsConferidos: number
  readonly checksumsNaoConferiveis: number
  readonly avisos: string[]
} {
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  const avisosRaw = o.avisos
  return {
    checksumsConferidos: typeof o.checksums_conferidos === 'number' ? o.checksums_conferidos : 0,
    checksumsNaoConferiveis: typeof o.checksums_nao_conferiveis === 'number' ? o.checksums_nao_conferiveis : 0,
    avisos: Array.isArray(avisosRaw) ? avisosRaw.filter((a): a is string => typeof a === 'string') : [],
  }
}

function lerNumeroOuNulo(data: unknown, campo: string): number | null {
  const o = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>
  return typeof o[campo] === 'number' ? (o[campo] as number) : null
}

// ── Infra de aplicação em lotes ──────────────────────────────────────────────────────────────

interface ParamsAplicacaoEmLotes {
  readonly rpc: BoundRpc
  /** `limpar_staging_{base}`, chamada uma vez, ANTES do primeiro lote — mesma semântica do
   *  `isFirst` das Server Actions antigas. A partir da M5 esta RPC só limpa a área de STAGING
   *  (nunca a base viva) em TODAS as bases — Vendas já era assim desde a v4.15.0. */
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
 * PRIMEIRO lote — e só se houver ao menos uma linha, replicando o comportamento do card antigo:
 * como o loop nunca roda com `payload.length === 0`, o truncate também nunca disparava para
 * upload vazio.
 */
async function aplicarEmLotes(p: ParamsAplicacaoEmLotes): Promise<void> {
  let aplicadas = 0
  for (let i = 0; i < p.payload.length; i += p.tamanhoDoLote) {
    if (i === 0 && p.truncar) {
      const { error } = await p.rpc(p.truncar)
      if (error) {
        throw new CargaRejeitada(
          p.truncar,
          `${p.mensagemTruncar ?? 'Erro ao preparar a carga'}: ${error.message}. A base atual ` +
          '(viva) não foi tocada — esta etapa só limpa a área de STAGING.',
        )
      }
    }
    const lote = p.payload.slice(i, i + p.tamanhoDoLote)
    const { error } = await p.rpc(p.inserir, { p_linhas: lote })
    if (error) {
      // Com o pipeline ATÔMICO (M5) toda base tem staging própria: um erro aqui NUNCA toca a
      // base VIVA (só a staging), e o swap real só acontece dentro de `promover_carga_*`, numa
      // transação — reprovar ali sempre deixa a base anterior de pé. A ressalva antiga ("base
      // incompleta, reimporte antes de usar os números") valia só enquanto quatro das cinco
      // bases faziam TRUNCATE direto na tabela viva neste mesmo passo (achado MÉDIO do
      // `revisor` na M4); com a M5 essa janela deixou de existir para todas as bases.
      throw new CargaRejeitada(
        p.etapaInserir,
        `Erro ao inserir lote: ${error.message}. A base atual (viva) foi preservada — esta etapa ` +
        'só grava na STAGING.',
      )
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
      'linha grava o arquivo que a originou.',
    )
  }
  return opcoes.arquivoOrigem
}

/** `carga_id` é obrigatório a partir da M5: é o que torna `promover_carga_{base}` idempotente
 *  (`ingestao.promocao`, migration 0277). Mesmo molde de `exigirArquivoOrigem`. */
function exigirCargaId(opcoes: OpcoesAplicacao, base: BaseIngestao): string {
  if (!opcoes.cargaId) {
    throw new CargaRejeitada(
      'carga_id',
      `A base "${base}" precisa do carga_id (opcoes.cargaId) para promover a carga — é o que ` +
      'torna a promoção idempotente (ingestao.promocao, migration 0277).',
    )
  }
  return opcoes.cargaId
}

// ── Aplicadores por base ─────────────────────────────────────────────────────────────────────

/**
 * Vendas — pipeline ATÔMICO (ADR-0111/v4.15.0), estendido na M5 com checksum conferido no banco
 * e idempotência por `carga_id`:
 *
 *   `limpar_staging_vendas` (1x) → `inserir_lote_staging` (por lote) → `validar_carga_staging`
 *   → `loadMetas(false)` → `promover_carga_vendas(p_checksums, p_carga_id)`
 *
 * `loadMetas` roda ENTRE a validação e a promoção — fora da transação do swap, só depois de a
 * carga ter passado na validação (é fácil de esquecer, e o anexo M4 §2 nomeia isto
 * explicitamente). A chamada de promoção passa a usar a sobrecarga NOVA `(jsonb, uuid)` da
 * migration 0278 — a versão zero-arg (0116/0269) fica órfã de propósito (GATE 3, M10) e não é
 * mais chamada por este módulo.
 */
async function aplicarVendas(
  linhas: readonly VendaProdutoCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = await rpcDe()
  const cargaId = exigirCargaId(opcoes, 'vendas-produto')
  const payload = linhas.map(adaptarVenda)

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_vendas',
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
      `Erro na validação da carga: ${valRes.error.message}. A base anterior foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_staging')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_staging',
      'A validação retornou em formato inesperado. A base anterior foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_staging', `${msgs.join(' ')} A base anterior foi preservada.`)
  }

  try {
    await loadMetas(false)
  } catch (e) {
    throw new CargaRejeitada('metas', `Erro ao carregar metas: ${e instanceof Error ? e.message : String(e)}`)
  }

  const checksumsRpc = serializarChecksumsVendas(opcoes.checksums ?? [])
  const promRes = await rpc('promover_carga_vendas', { p_checksums: checksumsRpc, p_carga_id: cargaId })
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_vendas',
      `Erro ao promover a carga (a base anterior foi preservada — o pipeline é uma transação ` +
      `única): ${promRes.error.message}`,
    )
  }
  const promocao = parseRpc(cargaPromocaoSchema, promRes, 'promover_carga_vendas')
  if (!promocao) {
    throw new CargaRejeitada('promover_carga_vendas', 'A promoção retornou em formato inesperado.')
  }
  const retorno = lerRetornoPromocao(promRes.data)

  // op_propria (v4.17.0): aviso não-bloqueante que `validar_carga_staging` já devolvia.
  return {
    linhas: linhas.length,
    avisos: validacao.avisos ?? [],
    checksumsConferidos: retorno.checksumsConferidos,
    checksumsNaoConferiveis: retorno.checksumsNaoConferiveis,
  }
}

/**
 * Demonstrativo de Competência — pipeline ATÔMICO (M5):
 *
 *   `limpar_staging_demonstrativo` (1x) → `inserir_lote_staging_demonstrativo` (por lote) →
 *   `validar_carga_demonstrativo` → `promover_carga_demonstrativo(p_checksums, p_carga_id)`.
 *
 * A conferência do checksum contra o gravado e a chamada a `provisionar_dre_comp_par` (depois da
 * conferência — nunca antes: se a carga não fecha, não se mexe na curadoria) agora acontecem
 * DENTRO da RPC, na mesma transação — o `status_demonstrativo_competencia` + a chamada solta a
 * `provisionar_dre_comp_par` que este aplicador fazia até a M4 saem daqui.
 */
async function aplicarDemonstrativo(
  linhas: readonly DemonstrativoCompetenciaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = await rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'demonstrativo-competencia')
  const cargaId = exigirCargaId(opcoes, 'demonstrativo-competencia')
  const payload = linhas.map((l) => adaptarDemonstrativo(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_demonstrativo',
    inserir: 'inserir_lote_staging_demonstrativo',
    payload,
    tamanhoDoLote: BATCH_DEMONSTRATIVO,
    etapaInserir: 'inserir_lote_staging_demonstrativo',
    onProgresso: opcoes.onProgresso,
  })

  const valRes = await rpc('validar_carga_demonstrativo')
  if (valRes.error) {
    throw new CargaRejeitada(
      'validar_carga_demonstrativo',
      `Erro na validação da carga: ${valRes.error.message}. A base anterior foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_demonstrativo')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_demonstrativo',
      'A validação retornou em formato inesperado. A base anterior foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_demonstrativo', `${msgs.join(' ')} A base anterior foi preservada.`)
  }

  const checksumsRpc = serializarChecksumsDemonstrativo(opcoes.checksums ?? [], opcoes.camposPivotDemonstrativo ?? [])
  const promRes = await rpc('promover_carga_demonstrativo', { p_checksums: checksumsRpc, p_carga_id: cargaId })
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_demonstrativo',
      `Erro ao promover a carga (a base anterior foi preservada — o pipeline é uma transação ` +
      `única): ${promRes.error.message}`,
    )
  }
  const retorno = lerRetornoPromocao(promRes.data)
  const paresNovos = lerNumeroOuNulo(promRes.data, 'pares_novos')
  const avisos = [...retorno.avisos]
  if (paresNovos !== null && paresNovos > 0) {
    avisos.push(
      `${paresNovos} par(es) novo(s) do arquivo entraram como "Não classificadas" — classifique-os ` +
      'em Editar estrutura para que entrem no demonstrativo.',
    )
  }

  return {
    linhas: linhas.length,
    avisos,
    paresNovos: paresNovos ?? 0,
    checksumsConferidos: retorno.checksumsConferidos,
    checksumsNaoConferiveis: retorno.checksumsNaoConferiveis,
  }
}

/**
 * Lançamentos por Movimentação — pipeline ATÔMICO (M5):
 *
 *   `limpar_staging_movimentacao` (1x) → `inserir_lote_staging_movimentacao` (por lote) →
 *   `validar_carga_movimentacao` → `promover_carga_movimentacao(p_checksums, p_carga_id)`.
 *
 * `regenerar_fluxo_caixa()` (lê esta base + Aberto) agora roda DENTRO da RPC, sob o lock
 * compartilhado das duas bases — o aviso de conta nova não classificada chega em
 * `retorno.avisos`, já formatado pelo SQL; a chamada solta a `regenerar_fluxo_caixa` que este
 * aplicador fazia até a M4 sai daqui.
 */
async function aplicarLancamentosMovimentacao(
  linhas: readonly LancamentoCategoriaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = await rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'lancamentos-movimentacao')
  const cargaId = exigirCargaId(opcoes, 'lancamentos-movimentacao')
  const payload = linhas.map((l) => adaptarLancamentoMovimentacao(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_movimentacao',
    inserir: 'inserir_lote_staging_movimentacao',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_MOVIMENTACAO,
    etapaInserir: 'inserir_lote_staging_movimentacao',
    onProgresso: opcoes.onProgresso,
  })

  const valRes = await rpc('validar_carga_movimentacao')
  if (valRes.error) {
    throw new CargaRejeitada(
      'validar_carga_movimentacao',
      `Erro na validação da carga: ${valRes.error.message}. A base anterior foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_movimentacao')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_movimentacao',
      'A validação retornou em formato inesperado. A base anterior foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_movimentacao', `${msgs.join(' ')} A base anterior foi preservada.`)
  }

  const checksumsRpc = serializarChecksumsLancamentoCategoria(opcoes.checksums ?? [])
  const promRes = await rpc('promover_carga_movimentacao', { p_checksums: checksumsRpc, p_carga_id: cargaId })
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_movimentacao',
      `Erro ao promover a carga (a base anterior foi preservada — o pipeline é uma transação ` +
      `única): ${promRes.error.message}`,
    )
  }
  const retorno = lerRetornoPromocao(promRes.data)
  return {
    linhas: linhas.length,
    avisos: retorno.avisos,
    checksumsConferidos: retorno.checksumsConferidos,
    checksumsNaoConferiveis: retorno.checksumsNaoConferiveis,
  }
}

/**
 * Títulos em Aberto — pipeline ATÔMICO (M5), simétrico à irmã Movimentação:
 *
 *   `limpar_staging_aberto` (1x) → `inserir_lote_staging_aberto` (por lote) →
 *   `validar_carga_aberto` → `promover_carga_aberto(p_checksums, p_carga_id)`.
 */
async function aplicarTitulosEmAberto(
  linhas: readonly LancamentoCategoriaCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = await rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'lancamentos-aberto')
  const cargaId = exigirCargaId(opcoes, 'lancamentos-aberto')
  const payload = linhas.map((l) => adaptarTituloEmAberto(l, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_aberto',
    inserir: 'inserir_lote_staging_aberto',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_ABERTO,
    etapaInserir: 'inserir_lote_staging_aberto',
    onProgresso: opcoes.onProgresso,
  })

  const valRes = await rpc('validar_carga_aberto')
  if (valRes.error) {
    throw new CargaRejeitada(
      'validar_carga_aberto',
      `Erro na validação da carga: ${valRes.error.message}. A base anterior foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_aberto')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_aberto',
      'A validação retornou em formato inesperado. A base anterior foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_aberto', `${msgs.join(' ')} A base anterior foi preservada.`)
  }

  const checksumsRpc = serializarChecksumsLancamentoCategoria(opcoes.checksums ?? [])
  const promRes = await rpc('promover_carga_aberto', { p_checksums: checksumsRpc, p_carga_id: cargaId })
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_aberto',
      `Erro ao promover a carga (a base anterior foi preservada — o pipeline é uma transação ` +
      `única): ${promRes.error.message}`,
    )
  }
  const retorno = lerRetornoPromocao(promRes.data)
  return {
    linhas: linhas.length,
    avisos: retorno.avisos,
    checksumsConferidos: retorno.checksumsConferidos,
    checksumsNaoConferiveis: retorno.checksumsNaoConferiveis,
  }
}

/**
 * Lançamentos por Operação — pipeline ATÔMICO (M5), mudança de FORMA (anexo §6):
 *
 *   `limpar_staging_operacao` (1x) → `inserir_lote_staging_operacao` (por lote, TODAS as linhas)
 *   → `validar_carga_operacao` → `promover_carga_operacao(p_checksums, p_carga_id)`.
 *
 * Esta base não tem checksum monetário no arquivo (contrato §4) — envia-se `p_checksums: []` de
 * propósito; a RPC nem lê esse parâmetro (só valida que é um array). O cruzamento de Vencimento
 * (ALARME, nunca bloqueio) é recalculado DENTRO da promoção e chega em `retorno.avisos`; a
 * chamada solta a `regenerar_dim_operacao_weddings` que este aplicador fazia até a M4 sai daqui
 * (a RPC já a chama internamente).
 */
async function aplicarLancamentosOperacao(
  linhas: readonly LancamentoOperacaoCru[],
  opcoes: OpcoesAplicacao,
): Promise<ResultadoAplicacao> {
  const rpc = await rpcDe()
  const arquivoOrigem = exigirArquivoOrigem(opcoes, 'lancamentos-operacao')
  const cargaId = exigirCargaId(opcoes, 'lancamentos-operacao')
  const payload = linhas.map((cru) => adaptarLancamentoOperacao(cru, arquivoOrigem))

  await aplicarEmLotes({
    rpc,
    truncar: 'limpar_staging_operacao',
    inserir: 'inserir_lote_staging_operacao',
    payload,
    tamanhoDoLote: BATCH_LANCAMENTOS_OPERACAO,
    etapaInserir: 'inserir_lote_staging_operacao',
    onProgresso: opcoes.onProgresso,
  })

  const valRes = await rpc('validar_carga_operacao')
  if (valRes.error) {
    throw new CargaRejeitada(
      'validar_carga_operacao',
      `Erro na validação da carga: ${valRes.error.message}. A base anterior foi preservada.`,
    )
  }
  const validacao = parseRpc(cargaValidacaoSchema, valRes, 'validar_carga_operacao')
  if (!validacao) {
    throw new CargaRejeitada(
      'validar_carga_operacao',
      'A validação retornou em formato inesperado. A base anterior foi preservada.',
    )
  }
  if (!validacao.ok) {
    const msgs = validacao.erros.length ? validacao.erros : ['Validação da carga falhou.']
    throw new CargaRejeitada('validar_carga_operacao', `${msgs.join(' ')} A base anterior foi preservada.`)
  }

  const promRes = await rpc('promover_carga_operacao', { p_checksums: [], p_carga_id: cargaId })
  if (promRes.error) {
    throw new CargaRejeitada(
      'promover_carga_operacao',
      `Erro ao promover a carga (a base anterior foi preservada — o pipeline é uma transação ` +
      `única): ${promRes.error.message}`,
    )
  }
  const retorno = lerRetornoPromocao(promRes.data)
  const gravadas = lerNumeroOuNulo(promRes.data, 'linhas') ?? linhas.filter(lancamentoOperacaoAplicavel).length

  return {
    linhas: gravadas,
    avisos: retorno.avisos,
    checksumsConferidos: retorno.checksumsConferidos,
    checksumsNaoConferiveis: retorno.checksumsNaoConferiveis,
  }
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
