import 'server-only'
import { createHash } from 'node:crypto'
import { getAdminClient } from '@/lib/supabase/admin'
import { sanitizarNomeArquivo } from '@/lib/storage/nome-arquivo'
import type { BaseIngestao } from './bases'

// Camada de Storage do contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §2.1/§2.2):
// caminho canônico do objeto cru, URL assinada de upload, leitura/remoção do bucket e sha256.
// `server-only`: usa `getAdminClient()` (service role) e `node:crypto` — nunca pode ser
// arrastado para um bundle de cliente (o navegador só fala com o Storage pela URL assinada
// em si, §2.2; este módulo é sempre chamado a partir de uma API Route).
//
// Bucket `ingestao-cru` nasce na migration 0276 (escrita por outro agente desta missão) — não
// referenciado aqui além do nome; nenhuma suposição sobre o schema/RPCs dela.

/** Bucket privado do cru dos uploads de ingestão (contrato §2.2). */
export const BUCKET_INGESTAO = 'ingestao-cru'

/** Limites do contrato §2.1 — constantes nomeadas, nunca literais soltos nos call sites. */
export const LIMITE_BYTES_ARQUIVO = 52_428_800 // 50 MB por arquivo
export const LIMITE_BYTES_CARGA = 209_715_200 // 200 MB por carga (soma dos arquivos)

/**
 * Erro de Storage tipado — nunca uma string solta nem um `null` mudo; a rota traduz `codigo`
 * para o envelope do contrato §2.4 (`{ ok:false, erro:{ codigo, mensagem } }`).
 *
 * Cobre só os dois códigos que ESTE módulo de fato levanta. `SHA256_DIVERGE` nasce de quem
 * chama `sha256Confere` (a comparação é pura, devolve `boolean`; quem decide o `422` é
 * `carga.ts`/a rota, que também sabe o `path`/`nome` para compor o detalhe do erro).
 * `ACIMA_DO_LIMITE` nasce da rota comparando `arquivos[].bytes` do corpo da requisição contra
 * `LIMITE_BYTES_ARQUIVO`/`LIMITE_BYTES_CARGA` — nenhuma função daqui recebe esse valor declarado,
 * então não é este módulo que o levanta.
 */
export class ErroIngestaoStorage extends Error {
  readonly codigo: 'ARQUIVO_AUSENTE' | 'ERRO_STORAGE'

  constructor(codigo: 'ARQUIVO_AUSENTE' | 'ERRO_STORAGE', mensagem: string) {
    super(mensagem)
    this.name = 'ErroIngestaoStorage'
    this.codigo = codigo
  }
}

/** Ano/mês no fuso de São Paulo — convenção do "hoje" no projeto (skill `banco-e-rpc` §3). */
function anoMesSaoPaulo(agora: Date): { aaaa: string; mm: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(agora)
  const aaaa = partes.find((p) => p.type === 'year')?.value
  const mm = partes.find((p) => p.type === 'month')?.value
  if (!aaaa || !mm) throw new Error(`Intl.DateTimeFormat não devolveu ano/mês para ${agora.toISOString()}`)
  return { aaaa, mm }
}

/**
 * Caminho canônico do objeto cru (contrato §2.1): `{base}/{aaaa}/{mm}/{cargaId}-{indice}-{nome}`,
 * com `aaaa/mm` do MOMENTO DA EMISSÃO — nunca do período do dado (o nome do arquivo mente: o
 * "2026" de um export de Vendas pode conter linhas de 2024 a 2026). `indice` é a posição do
 * arquivo DENTRO da carga (Vendas aceita N arquivos; as outras bases, 1) — é o que garante que
 * dois arquivos da MESMA carga com o MESMO nome original nunca colidam na mesma chave.
 *
 * O nome passa por `sanitizarNomeArquivo`: chave de objeto no Supabase Storage é ASCII-only, e
 * um acento cru devolveria `400 InvalidKey` de forma determinística por nome (v5.4.3).
 */
export function caminhoCru(
  base: BaseIngestao,
  cargaId: string,
  indice: number,
  nomeOriginal: string,
  agora: Date,
): string {
  const { aaaa, mm } = anoMesSaoPaulo(agora)
  const nome = sanitizarNomeArquivo(nomeOriginal)
  return `${base}/${aaaa}/${mm}/${cargaId}-${indice}-${nome}`
}

const REGEX_ANO_PATH = /^\d{4}$/
const REGEX_MES_PATH = /^(0[1-9]|1[0-2])$/

/**
 * Guarda de AUTORIZAÇÃO (não de higiene): o passo 3 do contrato (§2.3) recebe `path` DE VOLTA
 * do chamador, e sem esta checagem a rota leria qualquer objeto do bucket — não só os da
 * própria carga. Confere a FORMA do caminho canônico (`base/aaaa/mm/cargaId-indice-nome`) e que
 * o segmento de base e o prefixo `${cargaId}-` do nome do arquivo batem exatamente com o que a
 * rota espera; rejeita qualquer tentativa de escapar do prefixo (`..`, barra invertida, path
 * absoluto) antes mesmo de olhar o conteúdo do objeto.
 *
 * `cargaId` é sempre um UUID gerado pelo SERVIDOR no passo 1 (`randomUUID()`), nunca informado
 * pelo chamador — por isso um prefixo-com-hífen já basta como comparação: dois `carga_id` reais
 * só compartilhariam esse prefixo se fossem o MESMO UUID (ambos de comprimento fixo).
 */
export function ehCaminhoDaCarga(path: string, base: BaseIngestao, cargaId: string): boolean {
  if (typeof path !== 'string' || path.length === 0) return false
  if (path.includes('..') || path.includes('\\') || path.startsWith('/')) return false

  const partes = path.split('/')
  if (partes.length !== 4) return false
  const [pBase, aaaa, mm, arquivo] = partes
  if (pBase !== base) return false
  if (!REGEX_ANO_PATH.test(aaaa) || !REGEX_MES_PATH.test(mm)) return false

  const prefixo = `${cargaId}-`
  if (!arquivo || !arquivo.startsWith(prefixo) || arquivo.length <= prefixo.length) return false
  return true
}

/**
 * Claim `exp` (epoch, segundos) do token JWT — mesma decodificação SEM verificação de
 * assinatura de `roleDoToken` (`@/lib/auth/credencial-maquina.ts`); aqui é para MEDIR a
 * validade real da URL assinada, não para autorizar nada (quem autoriza o `PUT` é o próprio
 * token embutido na URL, no servidor do Storage). Exportada para o teste de partes puras poder
 * provar a leitura sem rede, a partir de um token fabricado com a mesma forma (header.payload.assinatura).
 */
export function expiraEmDoToken(token: string): string {
  const payloadB64 = token.split('.')[1]
  if (!payloadB64) throw new ErroIngestaoStorage('ERRO_STORAGE', 'token de upload sem payload JWT.')
  let payload: { exp?: unknown }
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as { exp?: unknown }
  } catch {
    throw new ErroIngestaoStorage('ERRO_STORAGE', 'token de upload com payload JWT ilegível.')
  }
  if (typeof payload.exp !== 'number') {
    throw new ErroIngestaoStorage('ERRO_STORAGE', 'token de upload sem claim "exp".')
  }
  return new Date(payload.exp * 1000).toISOString()
}

export interface UrlAssinadaUpload {
  signedUrl: string
  token: string
  /** ISO 8601 — lido do claim `exp` do token emitido, NUNCA presumido. Ver divergência com o
   *  contrato §2.1 na documentação de `urlAssinadaDeUpload`.
   *
   *  `null` quando o token não é legível como JWT: a URL emitida continua VÁLIDA (quem a
   *  valida é o servidor do Storage, não nós), então derrubar a emissão inteira por não
   *  conseguir ler um campo INFORMATIVO seria trocar uma carga que funcionaria por um 500.
   *  O chamador trata `null` como "não sei quando expira"; o alerta vai para o log. */
  expiraEm: string | null
}

/**
 * Emite a URL assinada de upload (contrato §2.2: o `PUT` do chamador vai direto ao Storage, sem
 * `x-api-key` — a autorização é o token da própria URL).
 *
 * ⚠️ DIVERGÊNCIA COM O CONTRATO CONGELADO. O §2.1 diz "a URL vale 15 minutos". O SDK em uso
 * (`@supabase/storage-js`, `StorageFileApi.createSignedUploadUrl`) **não aceita** parâmetro de
 * validade — conferido em
 * `node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts`, cujo próprio docstring
 * diz: "Signed upload URLs can be used to upload files to the bucket without further
 * authentication. They are valid for 2 hours." É o servidor do Storage que decide a janela, não
 * o chamador — os 15 minutos do §2.1 NÃO são implementáveis hoje com este SDK. Por isso
 * `expiraEm` é sempre lido do claim `exp` do token devolvido (via `expiraEmDoToken`), nunca
 * hardcoded — se o Storage mudar a janela no futuro, o valor reportado ao chamador continua
 * correto sem precisar de mudança de código aqui. Divergência registrada para o Yan decidir se o
 * §2.1 vira errata (mesmo molde da errata 1 do contrato).
 */
export async function urlAssinadaDeUpload(path: string): Promise<UrlAssinadaUpload> {
  const { data, error } = await getAdminClient().storage.from(BUCKET_INGESTAO).createSignedUploadUrl(path)
  if (error || !data) {
    throw new ErroIngestaoStorage(
      'ERRO_STORAGE',
      `Falha ao emitir URL assinada de upload para '${path}': ${error?.message ?? 'resposta vazia do Storage'}`,
    )
  }
  let expiraEm: string | null = null
  try {
    expiraEm = expiraEmDoToken(data.token)
  } catch (err) {
    // Nunca em silêncio (é sinal de que a forma do token mudou), mas nunca fatal: a URL
    // assinada é válida independentemente de conseguirmos ler o `exp` dela.
    console.error(`[ingestao/storage] validade da URL assinada ilegível para '${path}':`, err)
  }
  return { signedUrl: data.signedUrl, token: data.token, expiraEm }
}

/** Sinaliza objeto ausente/não encontrado a partir do formato de erro do Storage (a API do
 *  Supabase Storage devolve tanto HTTP 404 quanto HTTP 400 com `statusCode: "404"` conforme a
 *  versão — checa as duas formas, mais o texto, antes de cair em `ERRO_STORAGE` genérico). */
function ehErroArquivoAusente(erro: { status?: number; statusCode?: string; message?: string }): boolean {
  if (erro.statusCode === '404' || erro.status === 404) return true
  return /not.?found/i.test(erro.message ?? '')
}

/**
 * Baixa o objeto cru de volta como bytes (contrato §2.3 passo 4: "lê cada objeto do bucket").
 * `ARQUIVO_AUSENTE` quando o Storage não encontra o `path` (ex.: o `PUT` do passo 2 nunca
 * chegou a acontecer, ou o `path` está incorreto) — é o código do contrato §2.4, nunca um
 * `null` mudo.
 */
export async function baixarCru(path: string): Promise<Uint8Array> {
  const { data, error } = await getAdminClient().storage.from(BUCKET_INGESTAO).download(path)
  if (error) {
    throw new ErroIngestaoStorage(
      ehErroArquivoAusente(error) ? 'ARQUIVO_AUSENTE' : 'ERRO_STORAGE',
      `Falha ao baixar '${path}': ${error.message}`,
    )
  }
  if (!data) throw new ErroIngestaoStorage('ARQUIVO_AUSENTE', `Objeto ausente no bucket: '${path}'`)
  return new Uint8Array(await data.arrayBuffer())
}

/**
 * Remove objetos do bucket — BEST-EFFORT, para limpeza de carga abortada (ex.: falha depois do
 * upload e antes da conclusão da carga). Nunca lança: uma falha na limpeza não pode derrubar o
 * fluxo que a chamou (mesmo padrão de `src/app/financeiro/acervo/actions.ts`). Mas o erro nunca
 * fica mudo: `console.error`, no molde do "nunca em silêncio" descrito para `log.ts` no anexo
 * de desenho desta missão.
 */
export async function removerCru(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await getAdminClient().storage.from(BUCKET_INGESTAO).remove([...paths])
  if (error) {
    console.error(
      `[ingestao/storage] falha ao remover ${paths.length} objeto(s) do bucket '${BUCKET_INGESTAO}' (best-effort):`,
      error.message,
    )
  }
}

/** sha256 em hex minúsculo, calculado direto sobre os bytes (sem passar por string/encoding
 *  intermediária — a mesma cautela da skill `ingestao-planilhas` contra reformatação que perde
 *  precisão, aqui aplicada a hash em vez de número). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Confere o sha256 DECLARADO pelo chamador contra o RECALCULADO a partir dos bytes lidos do
 * bucket — o contrato §2.3 passo 4 depende desta conferência (≠ ⇒ `422 SHA256_DIVERGE`, base
 * intacta). Pura e independente de rede: quem chama decide o que fazer com `false`.
 */
export function sha256Confere(declarado: string, bytes: Uint8Array): boolean {
  return sha256Hex(bytes) === declarado.trim().toLowerCase()
}
