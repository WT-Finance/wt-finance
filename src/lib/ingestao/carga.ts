import 'server-only'

// Fluxo do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §2.3) — o que as duas
// rotas de `src/app/api/ingestao/[base]/` chamam. Este módulo é o único lugar onde os códigos
// de rejeição do contrato (§2.4) nascem: quem parseia/valida/reconciliou já fala a língua do
// contrato quando devolve para a rota.
//
// Ordem do §2.3 preservada tal como escrita: autentica (rota) → lock da base (§4 abaixo) →
// grafo de dependência (`checarDependenciaDeCarga`, anexo v6.0.0/M7a §1 — ANTES da
// idempotência/`abrirCarga` de propósito, ver a função) → baixa + sha256 + parse + checksum
// (dentro do parser da M3) → reconciliação do conjunto → diff → aplica (só se `confirmar`) →
// conclui/loga.

import { ROTULO_BASE, type BaseIngestao } from './bases'
import { preRequisitosBloqueantes, avaliarDependenciaDeCarga } from './grafo'
import { hojeSP } from '@/lib/fmt'
import {
  LIMITE_BYTES_ARQUIVO, LIMITE_BYTES_CARGA,
  ehCaminhoDaCarga, baixarCru, sha256Confere, ErroIngestaoStorage,
} from './storage'
import { formatoPeloNome, lerMatriz, type FormatoArquivo } from './matriz'
import type { Matriz, Checksum, ParseErro } from './parsers/comum'
import { somaCentavos } from './parsers/comum'
import { parseVendasProdutoRows, type ArquivoVendas, type VendaProdutoCru } from './parsers/vendas-produto'
import { parseDemonstrativoCruRows, type DemonstrativoCompetenciaCru } from './parsers/demonstrativo-competencia'
import { parseLancamentosCategoriaRows } from './parsers/lancamentos-categoria'
import { parseLancamentosOperacaoRows } from './parsers/lancamentos-operacao'
import { aplicarCarga, CargaRejeitada, lancamentoOperacaoAplicavel, type ResultadoAplicacao } from './aplicar'
import { getAdminClient } from '@/lib/supabase/admin'
import { autenticarChamada, type ChaveResolvida } from '@/lib/api-externa/http'
import { requireAreaApi, type Sessao } from '@/lib/auth/sessao'
import { abrirCarga, concluirCarga, lerUltimaCargaAplicada } from './log'
import {
  somaPorAno, calcularDiffPorAno, anoCorrenteSP, ehRejeicaoDeConteudo, precisaAlarmarParNovo,
  dispararAlarmeDeEvento,
} from './alarme'
import type { AlarmeIngestao } from '@/lib/email/template'

// ── Envelope de erro do contrato (§2.4) ──────────────────────────────────────────────────────

/** Os códigos nomeados do contrato §2.4, mais os que a CAMADA HTTP precisa para dizer "corpo
 *  malformado" — o contrato não lista um código para isso, e `FORMATO_INVALIDO` (usado pelo
 *  §2.3 passo 5 para o PARSE) é o mais próximo em espírito: os dois são "o que chegou não tem a
 *  forma que a rota exige", só que um é o arquivo e o outro é o JSON do corpo. Decisão registrada
 *  no relato desta missão — não há cobertura literal no contrato para este código específico. */
export type CodigoErroCarga =
  | 'AUTH_AUSENTE' | 'AUTH_INVALIDA' | 'ESCOPO_INSUFICIENTE' | 'BASE_DESCONHECIDA'
  | 'CARGA_EM_ANDAMENTO' | 'DEPENDENCIA_AUSENTE' | 'ACIMA_DO_LIMITE'
  | 'SHA256_DIVERGE' | 'ARQUIVO_AUSENTE' | 'FORMATO_INVALIDO' | 'ESTRUTURA_INESPERADA'
  | 'CHECKSUM_FALHOU' | 'CONJUNTO_NAO_RECONCILIA' | 'VENDA_REPETIDA_ENTRE_ARQUIVOS'
  | 'ERRO_INTERNO'

/** `{ ok:false, erro:{codigo,mensagem,detalhe?} }` — o MESMO envelope da API externa
 *  (`src/lib/api-externa/http.ts#respostaErro`), com `detalhe` opcional a mais: o contrato de
 *  ingestão declara `detalhe` no formato do erro (§2.4) e a API externa não usa esse campo hoje
 *  — por isso uma função local, em vez de estender a de lá (fora do escopo desta missão tocar
 *  `http.ts`). */
export function respostaErroCarga(codigo: CodigoErroCarga, mensagem: string, http: number, detalhe?: unknown): Response {
  const corpo: { ok: false; erro: { codigo: string; mensagem: string; detalhe?: unknown } } =
    detalhe === undefined
      ? { ok: false, erro: { codigo, mensagem } }
      : { ok: false, erro: { codigo, mensagem, detalhe } }
  return Response.json(corpo, { status: http })
}

/** Erro tipado do fluxo de carga — carrega o HTTP e o código do contrato juntos, para a rota só
 *  precisar chamar `.resposta()` no `catch`. */
export class ErroCarga extends Error {
  readonly codigo: CodigoErroCarga
  readonly http: number
  readonly detalhe?: unknown

  constructor(codigo: CodigoErroCarga, http: number, mensagem: string, detalhe?: unknown) {
    super(mensagem)
    this.name = 'ErroCarga'
    this.codigo = codigo
    this.http = http
    this.detalhe = detalhe
  }

  resposta(): Response {
    return respostaErroCarga(this.codigo, this.message, this.http, this.detalhe)
  }
}

/** `ParseErro.codigo` (`FORMATO_INVALIDO` | `ESTRUTURA_INESPERADA` | `CHECKSUM_FALHOU`) já É um
 *  dos códigos do contrato §2.4 — os parsers da M3 foram desenhados falando essa língua. Tradução
 *  1:1, sem reescrever a mensagem (ela já é a que o operador precisa, skill `ingestao-planilhas` §5). */
export function traduzirFalhaParse(falha: ParseErro): ErroCarga {
  return new ErroCarga(falha.codigo, 422, falha.mensagem, falha.detalhe)
}

// ── Passo 1 do contrato (§2.1) — validação ANTES de emitir qualquer URL ─────────────────────
//
// Sem estado por decisão (anexo M4 §1.1a): nada é gravado aqui. `validarArquivosDeclarados` é
// pura — é o que a permite ser testada sem rede.

export interface ArquivoDeclarado {
  readonly nome: string
  readonly bytes: number
  readonly sha256: string
}

/** Extensão aceita por base (contrato §2.1: ".xlsx; .csv só em lancamentos-operacao" — a
 *  tabela §3 confirma que Operação é "1 csv", isto é, SÓ csv, não as duas). */
const EXTENSAO_POR_BASE: Record<BaseIngestao, FormatoArquivo> = {
  'demonstrativo-competencia': 'xlsx',
  'vendas-produto': 'xlsx',
  'lancamentos-movimentacao': 'xlsx',
  'lancamentos-aberto': 'xlsx',
  'lancamentos-operacao': 'csv',
}

const REGEX_SHA256_HEX = /^[0-9a-f]{64}$/i

/** `null` quando a lista de arquivos declarada respeita o §2.1; senão, o `ErroCarga` pronto
 *  para a rota devolver. Cobre: contagem (só Vendas aceita >1), extensão por base, `bytes`
 *  positivo, `sha256` no formato esperado, teto por arquivo e teto por carga (soma). */
export function validarArquivosDeclarados(
  base: BaseIngestao,
  arquivos: readonly ArquivoDeclarado[],
): ErroCarga | null {
  if (arquivos.length === 0) {
    return new ErroCarga('FORMATO_INVALIDO', 422, 'Informe ao menos um arquivo em "arquivos".')
  }
  if (base !== 'vendas-produto' && arquivos.length > 1) {
    return new ErroCarga(
      'FORMATO_INVALIDO', 422,
      `A base "${base}" aceita exatamente 1 arquivo por carga (recebidos: ${arquivos.length}).`,
      { base, recebidos: arquivos.length },
    )
  }

  const extensaoEsperada = EXTENSAO_POR_BASE[base]
  let somaBytes = 0
  for (const arq of arquivos) {
    const formato = formatoPeloNome(arq.nome)
    if (formato !== extensaoEsperada) {
      return new ErroCarga(
        'FORMATO_INVALIDO', 422,
        `A base "${base}" só aceita arquivo .${extensaoEsperada} — "${arq.nome}" não tem essa extensão.`,
        { base, nome: arq.nome, extensaoEsperada },
      )
    }
    if (!Number.isFinite(arq.bytes) || arq.bytes <= 0) {
      return new ErroCarga('FORMATO_INVALIDO', 422, `"${arq.nome}": "bytes" precisa ser um inteiro positivo.`, { nome: arq.nome })
    }
    if (arq.bytes > LIMITE_BYTES_ARQUIVO) {
      return new ErroCarga(
        'ACIMA_DO_LIMITE', 413,
        `"${arq.nome}" (${arq.bytes} bytes) excede o limite de ${LIMITE_BYTES_ARQUIVO} bytes por arquivo.`,
        { nome: arq.nome, bytes: arq.bytes, limite: LIMITE_BYTES_ARQUIVO },
      )
    }
    if (!REGEX_SHA256_HEX.test(arq.sha256.trim())) {
      return new ErroCarga('FORMATO_INVALIDO', 422, `"${arq.nome}": "sha256" precisa ser hex de 64 caracteres.`, { nome: arq.nome })
    }
    somaBytes += arq.bytes
  }
  if (somaBytes > LIMITE_BYTES_CARGA) {
    return new ErroCarga(
      'ACIMA_DO_LIMITE', 413,
      `A carga soma ${somaBytes} bytes, acima do limite de ${LIMITE_BYTES_CARGA} bytes por carga.`,
      { somaBytes, limite: LIMITE_BYTES_CARGA },
    )
  }
  return null
}

// ── Autenticação — duas portas para a mesma rota (anexo M4 §4) ──────────────────────────────

export type AutenticacaoIngestao =
  | { readonly ok: true; readonly via: 'chave'; readonly chave: ChaveResolvida }
  | { readonly ok: true; readonly via: 'sessao'; readonly sessao: Sessao }
  // `viaChave` distingue "a chamada TROUXE x-api-key" (mesmo que a chave não tenha resolvido —
  // `chaveId` fica `null` nesse caso) de "não trouxe nenhuma credencial de chave" (fallback para
  // sessão, que também falhou). É o que a rota usa para decidir SE registra em
  // `api_chamada_log` (contrato §1: "toda chamada [por chave], inclusive negada" — a tentativa
  // pela sessão do card nunca vai para esse log, resolvida ou não).
  | { readonly ok: false; readonly resposta: Response; readonly viaChave: boolean; readonly chaveId: number | null }

/**
 * `x-api-key` presente ⇒ só essa porta conta (a RPA nunca tem sessão; um header errado não cai
 * para "tentar como card"). `x-api-key` ausente ⇒ tenta sessão via `requireAreaApi('admin/uploads')`.
 *
 * Sem NENHUMA das duas, o contrato pede o VOCABULÁRIO dele (`AUTH_AUSENTE`), não o 401/403
 * genérico de `requireAreaApi` (anexo §4: "Sem chave e sem sessão ⇒ 401 AUTH_AUSENTE"). Decisão
 * registrada no relato: o anexo cobre explicitamente só o caso "nenhuma das duas" — quando HÁ
 * sessão mas ela não tem a área (ou precisa trocar senha), o status HTTP original de
 * `requireAreaApi` é preservado e o código sai `ESCOPO_INSUFICIENTE` (a família 403 do contrato),
 * para a resposta nunca fugir do envelope `{ok:false,erro:{...}}` também neste ramo.
 */
export async function autenticarIngestao(req: Request, base: BaseIngestao): Promise<AutenticacaoIngestao> {
  const temChave = (req.headers.get('x-api-key') ?? '').trim() !== ''
  if (temChave) {
    const auth = await autenticarChamada(req)
    if (!auth.ok) return { ok: false, resposta: auth.resposta, viaChave: true, chaveId: null }
    if (!auth.chave.escopo_bases.includes(base)) {
      return {
        ok: false,
        resposta: respostaErroCarga('ESCOPO_INSUFICIENTE', `A chave não cobre a base "${base}".`, 403, { base }),
        viaChave: true,
        chaveId: auth.chave.id,
      }
    }
    return { ok: true, via: 'chave', chave: auth.chave }
  }

  const sessaoOuResp = await requireAreaApi('admin/uploads')
  if (sessaoOuResp instanceof Response) {
    const codigo: CodigoErroCarga = sessaoOuResp.status === 401 ? 'AUTH_AUSENTE' : 'ESCOPO_INSUFICIENTE'
    // O 403 de `requireAreaApi` tem DOIS motivos, e dizer o motivo errado manda o operador
    // procurar no lugar errado: quem precisa trocar a senha TEM sessão e TEM a área — falar em
    // "credencial não informada" para ele é mentira. Achado MÉDIO do `revisor`.
    let corpo: { error?: string } = {}
    try { corpo = (await sessaoOuResp.clone().json()) as { error?: string } } catch { /* resposta sem JSON */ }
    const mensagem =
      corpo.error === 'TROCA_SENHA_OBRIGATORIA'
        ? 'A sessão existe, mas a senha precisa ser trocada no primeiro acesso antes de usar esta rota.'
        : sessaoOuResp.status === 401
          ? 'Nem "x-api-key" nem uma sessão foram informados.'
          : 'A sessão informada não tem a área "admin/uploads".'
    return {
      ok: false,
      resposta: respostaErroCarga(codigo, mensagem, sessaoOuResp.status),
      viaChave: false,
      chaveId: null,
    }
  }
  return { ok: true, via: 'sessao', sessao: sessaoOuResp }
}

// ── 409 CARGA_EM_ANDAMENTO — lock (ver limitação abaixo) ─────────────────────────────────────
//
// O contrato (§2.3 passo 2) pede um lock de BASE. O lock DE VERDADE (`pg_advisory_xact_lock`)
// só nasce dentro de `promover_carga_*` na M5 (anexo M4 §4). Hoje a rota não tem de onde ler
// "existe outra carga ABERTA desta base agora" pelo banco: das quatro RPCs da migration 0276,
// `ingestao_carga_ultima` só enxerga `status='aplicada'` (é o insumo do DIFF e, desde a M7a, do
// grafo de dependência — não um lock) e
// `ingestao_carga_obter`/`ingestao_carga_abrir` só leem pelo `carga_id` que o PRÓPRIO chamador
// já precisa conhecer — nenhuma lista "outras cargas abertas da base" sem um id em mãos. Pedir
// essa leitura exigiria uma quinta RPC — fora do escopo desta missão (a 0276 já foi escrita por
// outro agente e não deve ser tocada).
//
// CRITÉRIO ADOTADO: mutex EM MEMÓRIA, por PROCESSO, com TTL. `cargasEmAndamento` guarda
// `base → {cargaId, desde}` enquanto `processarCarga` está entre o início e o `finally`.
//
// O QUE ISTO NÃO COBRE (repetido no relato desta missão, para o orquestrador/Yan):
//  • Duas invocações em instâncias serverless DIFERENTES (cold start, escala horizontal) NÃO se
//    veem — cada uma carrega seu próprio módulo, logo seu próprio Map. É EXATAMENTE o cenário em
//    que o lock de verdade (M5) faz diferença; até lá, duas cargas da MESMA base em instâncias
//    diferentes podem rodar em paralelo sem 409.
//  • Cobre o caso de hoje mais provável na prática (chamada duplicada/duplo-clique batendo na
//    MESMA instância quente) e cobre 100% dos testes/dev (sempre um processo só).
//  • TTL (10 min) é rede contra vazamento se o `finally` nunca rodar (processo que sobrevive a
//    uma exceção não capturada antes dele — incomum, mas barato de blindar): sem TTL, um critério
//    puramente "está marcado" travaria a base PARA SEMPRE se algo morresse no meio. Prefere
//    falhar para "deixa passar" (o lock expira) a "trava a plataforma" — a mesma régua que o
//    anexo pede para este critério.
const TTL_LOCK_MS = 10 * 60 * 1000
const cargasEmAndamento = new Map<BaseIngestao, { cargaId: string; desde: number }>()

/**
 * `true` quando conseguiu o lock da base; `false` quando alguém já o tem.
 *
 * ⚠️ Bloqueia **qualquer** segunda chamada enquanto a base está marcada — inclusive uma com o
 * MESMO `carga_id`. A primeira versão abria exceção para o próprio `carga_id` ("não bloquear o
 * dono"), e isso deixava passar exatamente o caso que o lock existe para pegar: chamada
 * duplicada é, por definição, o mesmo `carga_id` (retry de rede, duplo-clique, RPA reenviando o
 * passo 3 depois de um timeout do lado dela). As duas entravam em `aplicarCarga` para a mesma
 * base, e nas quatro bases não-Vendas não há lock nenhum no banco: dois `TRUNCATE`+`INSERT`
 * intercalados deixam a base com a mistura de duas cargas. Achado ALTO do `revisor`.
 *
 * O caminho feliz não sofre: conferência e aplicação do mesmo clique são sequenciais, e o
 * `finally` de `processarCarga` libera o lock antes de a próxima chamada começar.
 */
export function tentarTravarBase(base: BaseIngestao, cargaId: string): boolean {
  const atual = cargasEmAndamento.get(base)
  if (atual && Date.now() - atual.desde < TTL_LOCK_MS) return false
  cargasEmAndamento.set(base, { cargaId, desde: Date.now() })
  return true
}

/** Libera o lock — só se `cargaId` for quem o tomou (uma carga nunca destrava a de outra). */
export function destravarBase(base: BaseIngestao, cargaId: string): void {
  const atual = cargasEmAndamento.get(base)
  if (atual && atual.cargaId === cargaId) cargasEmAndamento.delete(base)
}

// ── Reconciliação do conjunto de Vendas (§2.3 passo 7) ───────────────────────────────────────

/** `null` quando não há `Venda Nº` repetido entre DOIS arquivos diferentes da mesma carga —
 *  repetir DENTRO do mesmo arquivo é normal (grão é item de venda; uma venda tem várias linhas).
 *  Pura, sem I/O: é a peça de "reconcilia o conjunto" que dá para testar sem rede. */
export function reconciliarVendas(
  linhas: readonly Pick<VendaProdutoCru, 'venda_numero' | 'arquivo_origem'>[],
): ErroCarga | null {
  const arquivosPorVenda = new Map<string, Set<string>>()
  for (const l of linhas) {
    if (l.venda_numero === null) continue
    const conjunto = arquivosPorVenda.get(l.venda_numero) ?? new Set<string>()
    conjunto.add(l.arquivo_origem)
    arquivosPorVenda.set(l.venda_numero, conjunto)
  }
  const repetidas: { venda_numero: string; arquivos: string[] }[] = []
  for (const [venda, conjunto] of arquivosPorVenda) {
    if (conjunto.size > 1) repetidas.push({ venda_numero: venda, arquivos: [...conjunto] })
  }
  if (repetidas.length === 0) return null
  return new ErroCarga(
    'VENDA_REPETIDA_ENTRE_ARQUIVOS', 422,
    `${repetidas.length} "Venda Nº" aparece(m) em mais de um arquivo da carga — os arquivos se ` +
    'sobrepõem no período coberto. A base não foi alterada.',
    { repetidas: repetidas.slice(0, 20), total: repetidas.length },
  )
}

// ── Diff contra o estado ATUAL da base (§2.3 passo 8) ────────────────────────────────────────
//
// Medido contra a base VIVA (as RPCs `status_*`/`get_upload_status` que o card já lia — anexo
// M4 §2), não contra a linha da carga anterior. Só `linhas` (contagem) está disponível para
// TODAS as bases; `soma` só existe para o Demonstrativo, porque é a única `status_*` que expõe
// soma hoje — as demais (`get_upload_status`, `status_lancamentos_movimentacao`,
// `status_titulos_em_aberto`) só devolvem `total`/`ultima_atualizacao`. `por_ano` e
// `anos_fechados_alterados` do exemplo do contrato (§2.3) exigem `ingestao.baseline` — isso é
// M6 (anexo §1) e não está disponível na M4; por isso ficam de fora do diff aqui, não fingidos.
//
// Nomes de campo ("soma", não "soma_centavos") seguem o contrato literalmente — internamente a
// SUBTRAÇÃO roda em centavos inteiros (mesma cautela da skill `ingestao-planilhas` contra erro
// de float) e só vira reais (`/100`) no fim, em `calcularDiff`.

export interface DiffCarga {
  readonly linhas: number | null
  readonly soma: number | null
  /**
   * v6.0.0/M6: delta de LINHAS por ano (contrato ingestao-v1 §2.3 — `{"2024": 0, "2026": 210}`).
   * Medido comparando `ingestao_soma_por_ano(base)` ANTES e DEPOIS da promoção — só existe
   * quando a carga foi de fato APLICADA (`confirmar:true`); a CONFERÊNCIA não promove nada,
   * então não há "depois" para medir, e este campo sai `null` (mesmo tratamento que o contrato
   * já dava a este campo até a M6 existir).
   */
  readonly por_ano: Record<string, number> | null
  /** Anos ANTERIORES ao corrente (fuso São Paulo) cuja contagem OU soma mudou nesta carga — é
   *  o que dispara o alarme "ano fechado alterado" (anexo v6.0.0/M6 §4). `null` nas mesmas
   *  condições de `por_ano`. */
  readonly anos_fechados_alterados: number[] | null
}

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

function rpc(): BoundRpc {
  const supabase = getAdminClient()
  return (supabase.rpc as unknown as BoundRpc).bind(supabase)
}

/**
 * `Número` → `Vencimento` nas bases vizinhas, via `ingestao_vencimentos_por_numero` (0276).
 * Aberto vence Movimentação — a mesma precedência de `indiceDeVencimentos` no parser.
 *
 * Falha de RPC **aborta a carga** e não degrada para índice vazio, ao contrário do diff: aqui
 * o índice não é enfeite de relatório, é a origem de `vencimento` e, por tabela, de
 * `data_final`. Aplicar com índice vazio gravaria ~4 mil lançamentos com data final nula e
 * zeraria as colunas de previsto da Carteira — uma carga silenciosamente errada é pior que uma
 * carga que não acontece (o contrato §2.3 já manda a base anterior ficar intacta).
 */
async function vencimentosPorNumero(
  numeros: readonly string[],
): Promise<Map<string, string> | ErroCarga> {
  if (numeros.length === 0) return new Map()
  const { data, error } = await rpc()('ingestao_vencimentos_por_numero', { p_numeros: numeros })
  if (error) {
    return new ErroCarga(
      'ERRO_INTERNO', 500,
      `Não foi possível resolver o Vencimento nas bases vizinhas: ${error.message}. ` +
      'A base atual foi preservada.',
    )
  }
  const mapa = new Map<string, string>()
  if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
    for (const [numero, vencimento] of Object.entries(data as Record<string, unknown>)) {
      if (typeof vencimento === 'string' && vencimento !== '') mapa.set(numero, vencimento)
    }
  }
  return mapa
}

/** Lê o total (e a soma, quando disponível) que a base VIVA tem agora — `null` em falha de RPC
 *  (nunca lança: o diff degrada, a carga não aborta por causa de uma LEITURA auxiliar). */
export async function statusAtualDaBase(base: BaseIngestao): Promise<{ linhas: number; somaCentavos: number | null } | null> {
  try {
    switch (base) {
      case 'vendas-produto': {
        const { data, error } = await rpc()('get_upload_status')
        if (error) throw new Error(error.message)
        const s = (data as { vendas?: { total?: number } } | null)?.vendas
        return { linhas: s?.total ?? 0, somaCentavos: null }
      }
      case 'lancamentos-operacao': {
        const { data, error } = await rpc()('get_upload_status')
        if (error) throw new Error(error.message)
        const s = (data as { lancamentos?: { total?: number } } | null)?.lancamentos
        return { linhas: s?.total ?? 0, somaCentavos: null }
      }
      case 'lancamentos-movimentacao': {
        const { data, error } = await rpc()('status_lancamentos_movimentacao')
        if (error) throw new Error(error.message)
        const s = data as { total?: number } | null
        return { linhas: s?.total ?? 0, somaCentavos: null }
      }
      case 'lancamentos-aberto': {
        const { data, error } = await rpc()('status_titulos_em_aberto')
        if (error) throw new Error(error.message)
        const s = data as { total?: number } | null
        return { linhas: s?.total ?? 0, somaCentavos: null }
      }
      case 'demonstrativo-competencia': {
        const { data, error } = await rpc()('status_demonstrativo_competencia')
        if (error) throw new Error(error.message)
        const s = data as { total?: number; soma_centavos?: number } | null
        return { linhas: s?.total ?? 0, somaCentavos: s?.soma_centavos ?? null }
      }
      default: {
        const exaustivo: never = base
        throw new Error(`Base não reconhecida: ${String(exaustivo)}`)
      }
    }
  } catch (err) {
    console.error(`[ingestao/carga] falha ao ler o status atual da base "${base}" (diff degradado):`, err)
    return null
  }
}

/** `aviso` não-nulo quando o diff teve de degradar (RPC de status indisponível) — quem chama
 *  decide se propaga isso como alarme na resposta (nunca aborta a carga por causa disto). */
export async function calcularDiff(
  base: BaseIngestao,
  totalLinhasNovo: number,
  somaCentavosNovo: number | null,
): Promise<{ diff: DiffCarga; aviso: string | null }> {
  const atual = await statusAtualDaBase(base)
  if (!atual) {
    return {
      diff: { linhas: null, soma: null, por_ano: null, anos_fechados_alterados: null },
      aviso: 'Não foi possível medir o diff contra a base atual (falha ao ler o status) — confira os números manualmente.',
    }
  }
  const diffCentavos =
    somaCentavosNovo !== null && atual.somaCentavos !== null ? somaCentavosNovo - atual.somaCentavos : null
  return {
    // `por_ano`/`anos_fechados_alterados` NÃO nascem aqui: esta função mede contra o TOTAL da
    // base viva (as RPCs `status_*`/`get_upload_status`, que não quebram por ano). A medição
    // por ano usa `ingestao_soma_por_ano` e só roda quando a carga é de fato APLICADA — quem
    // preenche esses dois campos (ou os deixa `null`, na conferência) é `processarCarga`.
    diff: {
      linhas: totalLinhasNovo - atual.linhas, soma: diffCentavos === null ? null : diffCentavos / 100,
      por_ano: null, anos_fechados_alterados: null,
    },
    aviso: null,
  }
}

// ── Parse por base (§2.3 passos 4-7, dentro do que cada `parse*Rows` da M3 já faz) ──────────

interface ArquivoLido {
  readonly nome: string
  readonly matriz: Matriz
}

interface ResumoArquivo {
  readonly nome: string
  readonly linhas: number
  readonly checksumsConferidos: number
}

interface ParseNormalizado {
  readonly linhasParaAplicar: readonly unknown[]
  readonly totalLinhas: number
  readonly checksums: readonly Checksum[]
  readonly datasRejeitadasN: number
  readonly diagnostico: Record<string, unknown>
  readonly porArquivo: readonly ResumoArquivo[]
  /** Só as bases single-file que `aplicarCarga` exige (`OpcoesAplicacao.arquivoOrigem`). */
  readonly arquivoOrigem?: string
  /**
   * Avisos nascidos no PARSE, que precisam chegar a `alarmes[]` da resposta e à linha de carga.
   *
   * Existe por um achado ALTO do `revisor`: a cobertura do cruzamento de Vencimento em
   * Lançamentos por Operação era medida pelo parser e descartada aqui. O sintoma seria mudo —
   * subir Operação com as bases vizinhas vazias resolve ZERO vencimentos, `data_final` sai nula
   * e as colunas de previsto da Carteira vão a zero, enquanto a tela do operador mostra
   * "1 checksum conferido" e nenhum aviso. O grafo de dependência (M7a, `checarDependenciaDeCarga`)
   * bloqueia a ÚNICA aresta que o contrato marca como bloqueante (Aberto do dia ausente ⇒ 409
   * `DEPENDENCIA_AUSENTE`) — mas Movimentação (o fallback de vencimento) NÃO é pré-requisito
   * bloqueante, então subir Operação com Movimentação vazia continua possível e mudo sem este
   * aviso: é ele, e só ele, quem cobre esse caso.
   */
  readonly avisos?: readonly string[]
  /**
   * Quantas linhas a BASE vai ter depois desta carga — o "depois" do diff. Ausente = igual a
   * `totalLinhas`.
   *
   * Existe porque "linhas parseadas" e "linhas na base" **não são a mesma grandeza em duas das
   * cinco bases**, e comparar a errada faz o gate humano mentir (medido no smoke da M4):
   *   • Vendas — o parse produz linhas de ITEM (48.862) e `get_upload_status().vendas.total`
   *     conta `analytics.fato_venda`, que é VENDA distinta (29.458). O diff dizia +19.404 numa
   *     carga que não muda quase nada. O card antigo já sabia disso e comparava
   *     `new Set(venda_numero).size` — a conta certa se perdeu na troca de caminho.
   *   • Operação — o aplicador descarta as linhas-placeholder do scrape
   *     (`lancamentoOperacaoAplicavel`), então a base recebe menos do que o parse leu: o diff
   *     acusava +5 numa carga idêntica à que já está lá (41.750 lidas − 5 placeholders = 41.745,
   *     exatamente o total atual).
   */
  readonly linhasNaBase?: number
}

async function executarParse(base: BaseIngestao, arquivosLidos: readonly ArquivoLido[]): Promise<ParseNormalizado | ErroCarga> {
  switch (base) {
    case 'vendas-produto': {
      const arquivosVendas: ArquivoVendas[] = arquivosLidos.map((a) => ({ nome: a.nome, rows: a.matriz }))
      const resultado = parseVendasProdutoRows(arquivosVendas)
      if (!resultado.ok) return traduzirFalhaParse(resultado)

      const reconciliacao = reconciliarVendas(resultado.linhas)
      if (reconciliacao) return reconciliacao

      const diagArquivos = (resultado.diagnostico.arquivos as { nome: string; linhas: number }[] | undefined) ?? []
      const somaDeclarada = diagArquivos.reduce((acc, a) => acc + a.linhas, 0)
      if (somaDeclarada !== resultado.linhas.length) {
        return new ErroCarga(
          'CONJUNTO_NAO_RECONCILIA', 422,
          `A soma das linhas por arquivo (${somaDeclarada}) não bate com o total parseado (${resultado.linhas.length}).`,
          { somaDeclarada, total: resultado.linhas.length },
        )
      }
      return {
        linhasParaAplicar: resultado.linhas,
        totalLinhas: resultado.linhas.length,
        // O "depois" do diff é VENDA distinta, não linha de item — é o que
        // `get_upload_status().vendas.total` (COUNT de `analytics.fato_venda`) mede do outro lado.
        linhasNaBase: new Set(
          resultado.linhas.map((l) => l.venda_numero).filter((n): n is string => n !== null && n !== ''),
        ).size,
        checksums: resultado.checksums,
        datasRejeitadasN: resultado.datasRejeitadas.length,
        diagnostico: resultado.diagnostico,
        porArquivo: diagArquivos.map((a) => ({
          nome: a.nome,
          linhas: a.linhas,
          checksumsConferidos: resultado.checksums.filter((c) => c.chave[0] === a.nome).length,
        })),
      }
    }

    case 'demonstrativo-competencia': {
      const unico = arquivosLidos[0]
      const resultado = parseDemonstrativoCruRows(unico.matriz)
      if (!resultado.ok) return traduzirFalhaParse(resultado)
      return {
        linhasParaAplicar: resultado.linhas,
        totalLinhas: resultado.linhas.length,
        checksums: resultado.checksums,
        datasRejeitadasN: 0,
        diagnostico: resultado.diagnostico,
        porArquivo: [{ nome: unico.nome, linhas: resultado.linhas.length, checksumsConferidos: resultado.checksums.length }],
        arquivoOrigem: unico.nome,
      }
    }

    case 'lancamentos-movimentacao':
    case 'lancamentos-aberto': {
      const unico = arquivosLidos[0]
      const resultado = parseLancamentosCategoriaRows(unico.matriz)
      if (!resultado.ok) return traduzirFalhaParse(resultado)
      return {
        linhasParaAplicar: resultado.linhas,
        totalLinhas: resultado.linhas.length,
        checksums: resultado.checksums,
        datasRejeitadasN: resultado.datasRejeitadas.length,
        diagnostico: resultado.diagnostico,
        porArquivo: [{ nome: unico.nome, linhas: resultado.linhas.length, checksumsConferidos: resultado.checksums.length }],
        arquivoOrigem: unico.nome,
      }
    }

    case 'lancamentos-operacao': {
      const unico = arquivosLidos[0]
      // O CSV do scrape NÃO traz `Vencimento`: quem o resolve é o cruzamento por `Número` com as
      // bases vizinhas (Aberto vence, Movimentação é fallback — decisão 10 do briefing), servido
      // por `ingestao_vencimentos_por_numero` (0276). Não é opcional: sem índice, todo lançamento
      // sem liquidação fica com `vencimento` nulo e, por tabela, `data_final` nulo — o que apaga
      // `mes_ano` e derruba `status` de "A Receber/A Pagar Futuro" para o tipo, zerando as duas
      // colunas de PREVISTO da Carteira de Weddings em ~4 mil lançamentos.
      //
      // Duas passadas de propósito: a lista de `Número` que precisa de vencimento só existe
      // DEPOIS de ler o arquivo (é quem não tem liquidação), e descobrir a coluna `Número` por
      // fora seria reimplementar a descoberta posicional do parser. A primeira passada roda com
      // índice vazio só para enumerar; a segunda é a que vale. Ler 41 mil linhas duas vezes custa
      // menos de um segundo e evita trazer as duas bases vizinhas inteiras (~130 mil linhas).
      const enumeracao = parseLancamentosOperacaoRows(unico.matriz, new Map())
      if (!enumeracao.ok) return traduzirFalhaParse(enumeracao)

      const numerosSemLiquidacao = [...new Set(
        enumeracao.linhas
          .filter((l) => l.liquidacao === null && l.lancamento_numero !== null)
          .map((l) => l.lancamento_numero as string),
      )]
      const vencimentos = await vencimentosPorNumero(numerosSemLiquidacao)
      if (vencimentos instanceof ErroCarga) return vencimentos

      const resultado = parseLancamentosOperacaoRows(unico.matriz, vencimentos)
      if (!resultado.ok) return traduzirFalhaParse(resultado)

      // A cobertura do cruzamento PRECISA chegar ao operador. O contrato §4 a trata como alarme,
      // não bloqueio (a fonte é scrape, e a falta pode ser da raspagem) — mas alarme que ninguém
      // vê não é alarme. O grafo de dependência (M7a) bloqueia Aberto ausente HOJE, mas
      // Movimentação (o fallback) não é pré-requisito bloqueante — nada impede subir Operação
      // com Movimentação vazia, e este aviso é a única pista de que aconteceu.
      const cruzamento = resultado.cruzamento
      const avisos: string[] = []
      if (cruzamento && cruzamento.semLiquidacao > 0) {
        const faltando = cruzamento.semLiquidacao - cruzamento.encontrados
        if (cruzamento.encontrados === 0) {
          avisos.push(
            `Nenhum dos ${cruzamento.semLiquidacao} lançamento(s) sem liquidação teve o Vencimento ` +
            'resolvido nas bases vizinhas — eles ficam sem data final, e as colunas de previsto ' +
            '(A Receber/A Pagar Futuro) da Carteira zeram. Carregue Lançamentos por Vencimento ' +
            '(em aberto) e por Movimentação ANTES desta base e reimporte.',
          )
        } else if (faltando > 0) {
          avisos.push(
            `${faltando} de ${cruzamento.semLiquidacao} lançamento(s) sem liquidação ficaram sem ` +
            `Vencimento nas bases vizinhas (baseline conhecido: 3)` +
            (cruzamento.ausentes.length > 0 ? `. Exemplos: ${cruzamento.ausentes.slice(0, 5).join(', ')}` : '') + '.',
          )
        }
      }

      return {
        avisos,
        linhasParaAplicar: resultado.linhas,
        totalLinhas: resultado.linhas.length,
        // O "depois" do diff desconta as linhas-placeholder do scrape, que o aplicador não grava
        // — sem isso o diff acusa diferença numa carga idêntica à que já está na base.
        linhasNaBase: resultado.linhas.filter(lancamentoOperacaoAplicavel).length,
        checksums: resultado.checksums,
        datasRejeitadasN: resultado.datasRejeitadas.length,
        diagnostico: resultado.diagnostico,
        porArquivo: [{ nome: unico.nome, linhas: resultado.linhas.length, checksumsConferidos: resultado.checksums.length }],
        // M5: `raw.lancamentos_operacao_staging.arquivo_origem` é NOT NULL (migration 0277) — até
        // a M4 esta base gravava direto no fato, que não tem essa coluna, e por isso o campo não
        // era preenchido aqui (achado da M5, `aplicar.ts#OpcoesAplicacao.arquivoOrigem`).
        arquivoOrigem: unico.nome,
      }
    }

    default: {
      const exaustivo: never = base
      return new ErroCarga('ERRO_INTERNO', 500, `Base não reconhecida: ${String(exaustivo)}`)
    }
  }
}

// ── Orquestração do §2.3 ──────────────────────────────────────────────────────────────────────

export interface ArquivoRecebido {
  readonly path: string
  readonly nome: string
  readonly sha256: string
}

export interface EntradaCarga {
  readonly base: BaseIngestao
  readonly cargaId: string
  readonly arquivos: readonly ArquivoRecebido[]
  readonly extraidoEm: string | null
  readonly observacao: string | null
  readonly origem: string
  readonly idempotencia: string | null
  /** Default `true` — `false` é a CONFERÊNCIA do anexo §5 (não grava linha, não aplica). */
  readonly confirmar: boolean
  readonly chaveId: number | null
  readonly usuarioId: string | null
}

export interface ResultadoCargaArquivo {
  readonly nome: string
  readonly sha256: string
  readonly linhas: number
  readonly checksums_conferidos: number
  readonly checksums_falhos: number
}

export interface ResultadoCarga {
  readonly ok: true
  readonly carga_id: string
  readonly base: BaseIngestao
  readonly status: 'aplicada' | 'conferida'
  readonly idempotente: boolean
  readonly arquivos: readonly ResultadoCargaArquivo[]
  readonly parse: {
    readonly linhas: number
    readonly rejeitadas_por_data: number
    readonly pares_novos: number
    /** Σ do PRÓPRIO ARQUIVO, em reais — `null` nas bases que não são conferidas por soma.
     *  Não confundir com `diff.soma`, que é a DIFERENÇA contra a base atual: o modal exibia o
     *  diff sob o rótulo "Σ do arquivo" e, num recarregamento do mesmo arquivo, anunciava
     *  "Σ do arquivo: R$ 0,00" — que se lê como "o arquivo está vazio". A base de competência é
     *  justamente a que se confere por SOMA (lição da v5.5.2: contagem igual com soma diferente
     *  passou batido), então este é o número que o gate humano precisa ver. */
    readonly soma: number | null
    /** Quantas linhas a BASE vai ter depois desta carga — a MESMA grandeza que o "antes" do
     *  gate humano (que vem das RPCs de status). Difere de `linhas` em duas bases: Vendas
     *  (o parse conta linha de ITEM, a base conta venda distinta) e Operação (o aplicador
     *  descarta as linhas-placeholder do scrape). O modal precisa DESTE número, senão o
     *  "vai apagar N e carregar M" compara grandezas diferentes e assusta à toa. */
    readonly linhas_na_base: number
  }
  readonly diff: DiffCarga
  readonly alarmes: readonly string[]
  /**
   * Quantos checksums a promoção RECONFERIU contra o que ficou gravado no banco, e quantos não
   * tinham como ser (contrato ingestao-v1 §4; anexo v6.0.0/M5 §4) — `null` na CONFERÊNCIA
   * (`confirmar:false`), que nunca chega a promover nada. "Conferi 0 de N" e "conferi N de N"
   * precisam ter aparência DIFERENTE na resposta — foi exatamente essa distinção (cobertura do
   * cruzamento de Vencimento) que sumiu na M4.
   */
  readonly promocao: {
    readonly checksums_conferidos: number
    readonly checksums_nao_conferiveis: number
  } | null
}

function montarArquivosResposta(
  entrada: EntradaCarga,
  porArquivo: readonly ResumoArquivo[],
): ResultadoCargaArquivo[] {
  return porArquivo.map((a) => ({
    nome: a.nome,
    sha256: entrada.arquivos.find((x) => x.nome === a.nome)?.sha256 ?? '',
    linhas: a.linhas,
    checksums_conferidos: a.checksumsConferidos,
    checksums_falhos: 0, // por construção: `Parse<T>` só chega a `ok:true` com TODOS os checksums fechados.
  }))
}

/**
 * Passo 9: aplica, traduzindo `CargaRejeitada` para o vocabulário do contrato.
 *
 * Nenhum dos 5 códigos de conteúdo do contrato §2.4 nomeia "a RPC de promoção reprovou o
 * conteúdo" (eles cobrem sha256/formato/estrutura/checksum/reconciliação — todos já conferidos
 * ANTES da aplicação); `ESTRUTURA_INESPERADA` é o mais próximo em espírito ("o conteúdo não é o
 * que a base espera") e preserva a mensagem ORIGINAL da RPC/validação (nunca reescrita — skill
 * `ingestao-planilhas` §5). Decisão registrada no relato desta missão como candidata a errata
 * futura do contrato, no molde da errata 1/2.
 *
 * M5: `cargaId` e `checksums` passam a ser OBRIGATÓRIOS para toda base — é o que
 * `promover_carga_{base}(p_checksums, p_carga_id)` exige (`aplicar.ts#exigirCargaId`).
 * `camposPivotDemonstrativo` só se aplica à base "demonstrativo-competencia" (ver
 * `OpcoesAplicacao.camposPivotDemonstrativo`).
 */
async function aplicarComTraducaoDeErro(
  base: BaseIngestao,
  linhas: readonly unknown[],
  arquivoOrigem: string | undefined,
  cargaId: string,
  checksums: readonly Checksum[],
  camposPivotDemonstrativo: readonly string[] | undefined,
): Promise<ResultadoAplicacao> {
  try {
    return await aplicarCarga(base, linhas, {
      ...(arquivoOrigem ? { arquivoOrigem } : {}),
      cargaId,
      checksums,
      ...(camposPivotDemonstrativo ? { camposPivotDemonstrativo } : {}),
    })
  } catch (err) {
    if (err instanceof CargaRejeitada) {
      throw new ErroCarga('ESTRUTURA_INESPERADA', 422, err.message, { etapa: err.etapa })
    }
    throw err
  }
}

// ── Grafo de dependência (§2.3 passo 3, §5) — anexo v6.0.0/M7a ──────────────────────────────

/**
 * Checa o grafo de dependência (contrato §5; anexo v6.0.0/M7a §1) — lê a última carga aplicada
 * de cada pré-requisito BLOQUEANTE de `base` (hoje: só `lancamentos-operacao` tem um —
 * `lancamentos-aberto`) e aplica a regra pura de `grafo.ts`. Não lança para bases sem
 * pré-requisito bloqueante (não faz NENHUMA leitura nesse caso).
 *
 * Roda ANTES de `abrirCarga` — de propósito, tanto com `confirmar:true` quanto `false`: o
 * contrato põe o passo 3 (grafo) antes do passo 1 (idempotência mora dentro de `abrirCarga`),
 * então um retry com a MESMA chave de idempotência de uma Operação já aplicada, em outro dia
 * sem Aberto do dia, cai em `DEPENDENCIA_AUSENTE` em vez do replay — é a aresta viva que o
 * anexo registra, não um defeito.
 *
 * Fail-closed (anexo §1): falha ao LER a última carga de um pré-requisito ⇒ 500
 * `ERRO_INTERNO` — "não consegui saber" não pode valer como "está lá".
 */
async function checarDependenciaDeCarga(base: BaseIngestao): Promise<void> {
  const preRequisitos = preRequisitosBloqueantes(base)
  if (preRequisitos.length === 0) return

  const ultimaAplicadaPorPreRequisito = new Map<BaseIngestao, string | null>()
  for (const pr of preRequisitos) {
    const resultado = await lerUltimaCargaAplicada(pr)
    if (!resultado.ok) {
      throw new ErroCarga(
        'ERRO_INTERNO', 500,
        `Não foi possível confirmar se "${ROTULO_BASE[pr]}" foi carregada hoje: ${resultado.erro}.`,
      )
    }
    ultimaAplicadaPorPreRequisito.set(pr, resultado.linha?.concluido_em ?? null)
  }

  const avaliacao = avaliarDependenciaDeCarga(base, ultimaAplicadaPorPreRequisito, hojeSP())
  if (avaliacao.ok) return

  const faltando = avaliacao.faltando.map((f) => ({
    base: f.base, rotulo: ROTULO_BASE[f.base], ultima_carga_aplicada_em: f.ultimaAplicadaEm,
  }))
  const nomes = faltando.map((f) => f.rotulo).join(', ')
  throw new ErroCarga(
    'DEPENDENCIA_AUSENTE', 409,
    `Carregue ${nomes} de hoje antes desta base.`,
    { faltando },
  )
}

/**
 * Executa o §2.3 completo — passos 3 a 10 (autenticação/lock já resolvidos por quem chama: a
 * rota, com `autenticarIngestao`/`tentarTravarBase`; este módulo cuida do grafo de dependência,
 * da idempotência via `abrirCarga` e do resto). Lança `ErroCarga` em qualquer rejeição; a rota
 * só precisa de um `try/catch`.
 */
export async function processarCarga(entrada: EntradaCarga): Promise<ResultadoCarga> {
  const inicio = Date.now()
  const { base, cargaId } = entrada

  if (!tentarTravarBase(base, cargaId)) {
    throw new ErroCarga(
      'CARGA_EM_ANDAMENTO', 409,
      `Já existe uma carga em andamento para a base "${base}". Aguarde a conclusão antes de tentar novamente.`,
    )
  }

  // `true` só depois que `abrirCarga` confirma que existe (ou passa a existir) uma linha em
  // `ingestao.carga` para este `cargaId` — é o que o `catch` usa para decidir se há algo para
  // `concluirCarga` atualizar. Sem isto, uma rejeição ANTES de `abrirCarga` (o grafo de
  // dependência, M7a; ou, na CONFERÊNCIA, qualquer rejeição — `abrirCarga` nunca roda com
  // `confirmar:false`) faria o `catch` tentar concluir uma linha que nunca foi aberta.
  let cargaAberta = false

  try {
    // Passo 3 do contrato — grafo de dependência (anexo v6.0.0/M7a §1). ANTES de tudo o mais,
    // inclusive da idempotência (que só é consultada dentro de `abrirCarga`, logo abaixo).
    await checarDependenciaDeCarga(base)

    // Idempotência (§1/§2.3 passo 1) — SÓ quando vai aplicar. A conferência (`confirmar:false`)
    // não abre linha nem consome idempotência (anexo §5: "carga é o que aplica").
    if (entrada.confirmar) {
      const abertura = await abrirCarga({
        cargaId, base, origem: entrada.origem, arquivos: entrada.arquivos,
        chaveId: entrada.chaveId, usuarioId: entrada.usuarioId,
        idempotencia: entrada.idempotencia, extraidoEm: entrada.extraidoEm, observacao: entrada.observacao,
      })
      if (!abertura.ok) {
        throw new ErroCarga('ERRO_INTERNO', 500, 'Falha ao registrar o início da carga.')
      }
      cargaAberta = true
      if (abertura.linha.existente && abertura.linha.status === 'aplicada') {
        // Idempotência (contrato §1): "mesma chave ⇒ mesma resposta, sem recarregar" — só para
        // uma carga que JÁ APLICOU. `concluirCarga` só grava `resposta` no caminho de sucesso
        // (ver o fim desta função); uma carga `rejeitada`/`erro` não tem corpo de sucesso para
        // repetir e cai no `if` abaixo, reprocessando do zero — DECISÃO DELIBERADA: reprocessar
        // uma rejeição é seguro (o mesmo conteúdo reprova pelo mesmo motivo, de novo) e mais
        // simples do que persistir+replayar o HTTP status de um erro passado (que a tabela não
        // guarda hoje). Registrado no relato desta missão.
        const guardada = abertura.linha.resposta
        if (guardada && typeof guardada === 'object') {
          return { ...(guardada as ResultadoCarga), idempotente: true }
        }
        // Sem `resposta` guardada para uma carga aplicada não deveria acontecer — cai e
        // reprocessa abaixo em vez de devolver corpo vazio ao chamador.
      }
    }

    // Cardinalidade por base (mesma regra do passo 1, §2.1) — RE-CONFERIDA aqui porque o corpo
    // do passo 3 é um payload INDEPENDENTE do passo 1 (o chamador poderia, por engano ou má-fé,
    // listar 2 `arquivos[]` para uma base single-file); sem isto, o passo abaixo baixaria e
    // verificaria o sha256 de TODOS os arquivos mas `executarParse` usaria só o primeiro,
    // descartando o resto em silêncio.
    if (base !== 'vendas-produto' && entrada.arquivos.length > 1) {
      throw new ErroCarga(
        'FORMATO_INVALIDO', 422,
        `A base "${base}" aceita exatamente 1 arquivo por carga (recebidos: ${entrada.arquivos.length}).`,
        { base, recebidos: entrada.arquivos.length },
      )
    }

    // Passos 4-7: baixa cada objeto, confere sha256, lê a matriz; o parse (por base) cobre o
    // resto do passo 5-7 (faixa de data, checksums do arquivo, e devolve erro nomeado se algo
    // não fechar).
    const arquivosLidos: ArquivoLido[] = []
    for (const arq of entrada.arquivos) {
      if (!ehCaminhoDaCarga(arq.path, base, cargaId)) {
        // Mesmo tratamento de "não encontrado": não confirma nem nega a existência de um path
        // fora da própria carga/base ao chamador (guarda de autorização, não de higiene — mesmo
        // espírito do comentário de `ehCaminhoDaCarga` em storage.ts).
        throw new ErroCarga('ARQUIVO_AUSENTE', 422, `O arquivo "${arq.nome}" não pertence a esta carga/base.`, { nome: arq.nome })
      }

      let bytes: Uint8Array
      try {
        bytes = await baixarCru(arq.path)
      } catch (err) {
        if (err instanceof ErroIngestaoStorage) {
          if (err.codigo === 'ARQUIVO_AUSENTE') {
            throw new ErroCarga(
              'ARQUIVO_AUSENTE', 422,
              `Arquivo "${arq.nome}" não encontrado no bucket — o PUT do passo 2 pode não ter concluído.`,
              { nome: arq.nome },
            )
          }
          throw new ErroCarga('ERRO_INTERNO', 500, 'Falha de armazenamento ao ler o arquivo.')
        }
        throw err
      }

      if (!sha256Confere(arq.sha256, bytes)) {
        throw new ErroCarga(
          'SHA256_DIVERGE', 422,
          `O sha256 de "${arq.nome}" não confere com o declarado no corpo da requisição.`,
          { nome: arq.nome },
        )
      }

      const formato = formatoPeloNome(arq.nome)
      if (!formato) {
        throw new ErroCarga('FORMATO_INVALIDO', 422, `Extensão não reconhecida em "${arq.nome}".`, { nome: arq.nome })
      }
      arquivosLidos.push({ nome: arq.nome, matriz: lerMatriz(bytes, formato) })
    }

    const parseado = await executarParse(base, arquivosLidos)
    if (parseado instanceof ErroCarga) throw parseado

    // Passo 8: diff contra o estado ATUAL da base.
    const somaCentavosNovo = base === 'demonstrativo-competencia'
      ? somaCentavos((parseado.linhasParaAplicar as readonly DemonstrativoCompetenciaCru[]).map((l) => l.valor))
      : null
    const { diff, aviso: avisoDiff } = await calcularDiff(base, parseado.linhasNaBase ?? parseado.totalLinhas, somaCentavosNovo)
    // Os avisos do PARSE (hoje: a cobertura do cruzamento de Vencimento) entram junto com o do
    // diff, e valem para a CONFERÊNCIA também — é antes de confirmar que o operador precisa
    // ler que nenhum vencimento foi resolvido.
    const alarmesBase = [...(parseado.avisos ?? []), ...(avisoDiff ? [avisoDiff] : [])]

    if (!entrada.confirmar) {
      // CONFERÊNCIA (anexo §5): passos 4-8 só, sem aplicar (passo 9) nem concluir/logar (passo 10).
      return {
        ok: true, carga_id: cargaId, base, status: 'conferida', idempotente: false,
        arquivos: montarArquivosResposta(entrada, parseado.porArquivo),
        parse: {
          linhas: parseado.totalLinhas, rejeitadas_por_data: parseado.datasRejeitadasN, pares_novos: 0,
          soma: somaCentavosNovo === null ? null : somaCentavosNovo / 100,
          linhas_na_base: parseado.linhasNaBase ?? parseado.totalLinhas,
        },
        diff, alarmes: alarmesBase,
        promocao: null, // conferência nunca promove — não há o que conferir contra o gravado
      }
    }

    // Passo 9: aplica. `camposPivotDemonstrativo` só a base de competência precisa (ver
    // `OpcoesAplicacao.camposPivotDemonstrativo`) — vem do MESMO diagnóstico que o parser já
    // produziu, nunca redescoberto aqui.
    const camposPivotDemonstrativo = base === 'demonstrativo-competencia'
      ? (Array.isArray(parseado.diagnostico.campos) ? (parseado.diagnostico.campos as string[]) : [])
      : undefined

    // M6 (anexo §4): "ano fechado alterado" compara a MESMA grandeza (linhas E soma) dos dois
    // lados, com a MESMA RPC (`ingestao_soma_por_ano`) — nunca uma ponta do parser contra a
    // base viva (a lição mais cara da M4, que apareceu em três lugares). Por isso o "antes" é
    // medido AGORA, antes de aplicar — não a partir de `statusAtualDaBase`/`diff`, que é outra
    // grandeza (total geral, sem quebra por ano).
    const somaAnoAntes = await somaPorAno(base)
    const aplicacao = await aplicarComTraducaoDeErro(
      base, parseado.linhasParaAplicar, parseado.arquivoOrigem, cargaId, parseado.checksums, camposPivotDemonstrativo,
    )

    // A promoção já aconteceu (senão `aplicarComTraducaoDeErro` teria lançado antes daqui) —
    // mede o "depois" com a MESMA RPC, e a decisão do alarme é uma função PURA
    // (`calcularDiffPorAno`, sem rede/banco). Falha em qualquer ponta da medição degrada em
    // silêncio (loga e segue): o alarme de ano fechado é camada adicional, nunca pode reprovar
    // uma carga que já foi aplicada com sucesso.
    const somaAnoDepois = await somaPorAno(base)
    const diffAno = somaAnoAntes && somaAnoDepois
      ? calcularDiffPorAno(base, cargaId, somaAnoAntes, somaAnoDepois, anoCorrenteSP())
      : null
    if (!diffAno) {
      console.error(
        `[ingestao/carga] carga ${cargaId} (${base}): não foi possível medir a alteração por ano ` +
        '(falha ao ler a soma por ano antes e/ou depois) — o alarme "ano fechado alterado" não foi avaliado desta vez.',
      )
    }
    const diffComAno: DiffCarga = {
      ...diff,
      por_ano: diffAno?.porAno ?? null,
      anos_fechados_alterados: diffAno ? [...diffAno.anosFechadosAlterados] : null,
    }
    // Um alarme por ano fechado alterado — a chave de EVENTO inclui `carga_id` (migration 0280,
    // header "estado × evento"): duas cargas seguidas mexendo no mesmo ano são DOIS fatos, não
    // um incidente que a segunda reabriria.
    for (const alarmeAno of diffAno?.alarmes ?? []) {
      await dispararAlarmeDeEvento(alarmeAno, `${base}:${alarmeAno.ano}:${cargaId}`)
    }

    // `pares_novos` (Demonstrativo): até a M6, `promover_carga_demonstrativo` devolvia a
    // contagem em `pares_novos` (jsonb), mas `ResultadoAplicacao` só a expunha embutida em
    // PROSA dentro de `avisos[]` (`aplicar.ts#aplicarDemonstrativo`) — a resposta estruturada
    // sempre respondia `pares_novos: 0`. A M6 propaga o NÚMERO real (`aplicacao.paresNovos`,
    // `undefined` nas quatro bases que não têm bandeja — tratado como 0) e usa-o para decidir
    // o alarme "par novo na bandeja" (anexo §4), com a mesma chave de evento do checksum falho
    // (só `carga_id`: a bandeja não tem "ano").
    const paresNovos = aplicacao.paresNovos ?? 0
    if (precisaAlarmarParNovo(base, paresNovos)) {
      const alarmeParNovo: AlarmeIngestao = { tipo: 'par_novo_bandeja', cargaId, paresNovos }
      await dispararAlarmeDeEvento(alarmeParNovo, cargaId)
    }

    const resultado: ResultadoCarga = {
      ok: true, carga_id: cargaId, base, status: 'aplicada', idempotente: false,
      arquivos: montarArquivosResposta(entrada, parseado.porArquivo),
      parse: {
        linhas: parseado.totalLinhas, rejeitadas_por_data: parseado.datasRejeitadasN,
        pares_novos: paresNovos,
        soma: somaCentavosNovo === null ? null : somaCentavosNovo / 100,
        linhas_na_base: parseado.linhasNaBase ?? parseado.totalLinhas,
      },
      diff: diffComAno,
      alarmes: [...alarmesBase, ...aplicacao.avisos],
      promocao: {
        checksums_conferidos: aplicacao.checksumsConferidos,
        checksums_nao_conferiveis: aplicacao.checksumsNaoConferiveis,
      },
    }

    const duracaoMs = Date.now() - inicio
    const conclusao = await concluirCarga({
      cargaId, status: 'aplicada', linhas: parseado.totalLinhas,
      checksumsConferidos: parseado.checksums.length, checksumsFalhos: 0,
      rejeitadasPorData: parseado.datasRejeitadasN, paresNovos, diff: diffComAno, resposta: resultado, duracaoMs,
    })
    if (!conclusao.ok) {
      // "Nunca em silêncio" (anexo §2) — mas a carga já foi aplicada: o dado está no banco,
      // perder a linha de log não desfaz nada. `console.error` já rodou dentro de `concluirCarga`;
      // aqui só acrescenta o aviso na resposta, no molde de `registrarChamada` do http.ts.
      return { ...resultado, alarmes: [...resultado.alarmes, 'A carga foi aplicada, mas houve falha ao gravar o registro de log — ver o console do servidor.'] }
    }
    return resultado
  } catch (err) {
    if (entrada.confirmar && cargaAberta) {
      // `cargaAberta` (não só `entrada.confirmar`): uma rejeição ANTES de `abrirCarga` — hoje só
      // o grafo de dependência (M7a), 409 `DEPENDENCIA_AUSENTE` ou o 500 fail-closed da própria
      // leitura do grafo — não tem linha em `ingestao.carga` para `concluirCarga` atualizar; o
      // anexo M7a §1 é explícito: "um 409 de pré-condição não consome a chave de idempotência
      // nem grava linha de carga (mesmo tratamento do 409 CARGA_EM_ANDAMENTO)". Sem este guard,
      // `concluirCarga` receberia um `cargaId` que a RPC nunca viu (UPDATE que não acha linha, ou
      // pior, dependendo da semântica da RPC).
      const cargaErro = err instanceof ErroCarga
        ? err
        : new ErroCarga('ERRO_INTERNO', 500, 'Falha inesperada ao processar a carga.')
      const conclusao = await concluirCarga({
        cargaId,
        status: cargaErro.codigo === 'ERRO_INTERNO' ? 'erro' : 'rejeitada',
        erro: `${cargaErro.codigo}: ${cargaErro.message}`,
        duracaoMs: Date.now() - inicio,
      })
      if (!conclusao.ok) {
        console.error(`[ingestao/carga] carga ${cargaId} (${base}) rejeitada/erro, E o log também falhou:`, conclusao.erro)
      }
      // M6 (anexo §4): "checksum falho" cobre TODA rejeição de CONTEÚDO — checksum e as demais
      // 422 (não auth: 401/403; não lock: 409 `CARGA_EM_ANDAMENTO`; não dependência: 409
      // `DEPENDENCIA_AUSENTE`; não bug interno: 500 `ERRO_INTERNO`, que não é "conteúdo", é
      // defeito). Só dispara para carga CONFIRMADA E ABERTA — mesmo guard do `concluirCarga`
      // acima, e por definição nunca dispararia para 409/500 mesmo sem o guard
      // (`ehRejeicaoDeConteudo` só é `true` para HTTP 422).
      if (ehRejeicaoDeConteudo(cargaErro.http)) {
        const alarme: AlarmeIngestao = {
          tipo: 'checksum_falho', base, cargaId, motivo: cargaErro.message, codigo: cargaErro.codigo,
        }
        await dispararAlarmeDeEvento(alarme, cargaId)
      }
    }
    if (err instanceof ErroCarga) throw err
    console.error(`[ingestao/carga] erro inesperado processando a carga ${cargaId} (${base}):`, err)
    throw new ErroCarga('ERRO_INTERNO', 500, 'Falha inesperada ao processar a carga.')
  } finally {
    destravarBase(base, cargaId)
  }
}
