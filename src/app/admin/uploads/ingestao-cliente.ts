// Cliente HTTP do fluxo de ingestão do card `/admin/uploads` (v6.0.0/M4) — contra o contrato
// `docs/contratos/ingestao-v1.md` §2. Roda inteiramente no NAVEGADOR: sha256 por Web Crypto
// (sem biblioteca nova) e upload por `XMLHttpRequest` — só ele dá progresso REAL de upload por
// bytes; `fetch` não expõe isso de forma portátil no browser. Único import de
// `src/lib/ingestao/` é o tipo de `bases.ts` (fonte única da lista de bases, uso read-only).
//
// O campo `confirmar` no corpo do passo 3 é INVENÇÃO desta missão, não texto literal do
// contrato — ver `docs/briefings/anexo-v6-0-0-m4-desenho-da-rota.md` §1.1(c) e §5 (default
// `true` no servidor; o card manda `false` primeiro para CONFERIR sem aplicar, depois `true`
// para aplicar). O formato de `RespostaCarga` abaixo foi conferido contra
// `src/lib/ingestao/carga.ts#ResultadoCarga` (já escrito por outro agente no momento desta
// missão) — `status` é `'aplicada' | 'conferida'` (nunca "rejeitada": rejeição vira erro HTTP,
// não uma resposta 200 de sucesso), `diff` só traz `linhas`/`soma` (o detalhamento por ano,
// `por_ano`/`anos_fechados_alterados` do exemplo do contrato §2.3, exige `ingestao.baseline` —
// isso é M6 e não existe ainda), e os avisos não-bloqueantes (`ResultadoAplicacao.avisos` de
// `aplicar.ts` — queda de `operacao_propria`, par novo da competência, conta nova do fluxo de
// caixa) pousam em `alarmes[]`. `pares_novos` e o `checksums_falhos` por arquivo ficam sempre
// em `0` na M4 (a contagem real de pares novos só existe hoje em prosa dentro de `alarmes`, e
// checksum falho aborta a carga antes de chegar a uma resposta de sucesso) — os campos
// continuam tipados como número comum, não são fingidos como sempre-zero no tipo, para o card
// não precisar mudar se uma missão futura passar a preenchê-los de verdade.

import type { BaseIngestao } from '@/lib/ingestao/bases'

export interface ArquivoParaHash {
  readonly nome: string
  readonly bytes: number
  readonly sha256: string
}

export interface ArquivoAssinado {
  readonly nome: string
  readonly path: string
  readonly signed_url: string
}

export interface RespostaUploadUrl {
  readonly carga_id: string
  readonly expira_em: string
  readonly arquivos: readonly ArquivoAssinado[]
}

/** Identifica um arquivo já no bucket, para o passo 3 (contrato §2.3). */
export interface ArquivoDaCarga {
  readonly path: string
  readonly nome: string
  readonly sha256: string
}

export interface ArquivoConferido {
  readonly nome: string
  readonly sha256: string
  readonly linhas: number
  readonly checksums_conferidos: number
  readonly checksums_falhos: number
}

/** Corpo de resposta de `POST /api/ingestao/{base}` — conferido contra
 *  `src/lib/ingestao/carga.ts#ResultadoCarga`. Ver a nota do header sobre o que é M4 e o que
 *  fica para M6 (`por_ano`/`anos_fechados_alterados`). */
export interface RespostaCarga {
  readonly carga_id: string
  readonly base: BaseIngestao
  readonly status: 'aplicada' | 'conferida'
  readonly idempotente: boolean
  readonly arquivos: readonly ArquivoConferido[]
  readonly parse: {
    readonly linhas: number
    readonly rejeitadas_por_data: number
    readonly pares_novos: number
    /** Σ do PRÓPRIO arquivo (reais) — `null` nas bases não conferidas por soma. Não é o
     *  `diff.soma`, que é a diferença contra a base atual. */
    readonly soma: number | null
    /** O que a BASE vai ter — mesma grandeza do "antes" que as RPCs de status devolvem. É este
     *  o número do "vai apagar N e carregar M", não `linhas`: em Vendas o parse conta linha de
     *  ITEM e a base conta venda distinta; em Operação o aplicador descarta placeholder do
     *  scrape. */
    readonly linhas_na_base: number
  }
  /** `linhas`/`soma` só ficam `null` quando a LEITURA auxiliar do estado atual da base falhou
   *  (`calcularDiff` degrada em vez de abortar a carga) — nesse caso um aviso já vem em
   *  `alarmes`. `soma` só é não-nulo para `demonstrativo-competencia` (única base cuja
   *  `status_*` expõe soma hoje). */
  readonly diff: {
    readonly linhas: number | null
    readonly soma: number | null
  }
  readonly alarmes: readonly string[]
}

/** O que o card guarda entre a CONFERÊNCIA (passo 4 do anexo §5) e a APLICAÇÃO (passo 6) —
 *  o `carga_id`/`arquivos`/`extraido_em` viajam idênticos nas duas chamadas. */
export interface PacoteConferido {
  readonly cargaId: string
  readonly arquivos: readonly ArquivoDaCarga[]
  readonly extraidoEm: string
  readonly resposta: RespostaCarga
}

interface ErroIngestao {
  readonly codigo: string
  readonly mensagem: string
  readonly detalhe?: unknown
}

/** Erro da rota — a MENSAGEM já vem pronta do contrato §2.4 (`erro.mensagem`); nunca mostrar
 *  o JSON cru na tela. */
export class ErroRotaIngestao extends Error {
  readonly codigo: string
  readonly detalhe?: unknown
  constructor(erro: ErroIngestao) {
    super(erro.mensagem)
    this.name = 'ErroRotaIngestao'
    this.codigo = erro.codigo
    this.detalhe = erro.detalhe
  }
}

async function lerRespostaJson(res: Response): Promise<unknown> {
  try { return await res.json() } catch { return null }
}

function extrairErro(json: unknown): ErroIngestao {
  if (json && typeof json === 'object' && 'erro' in json) {
    const e = (json as { erro?: Partial<ErroIngestao> }).erro
    if (e?.mensagem) return { codigo: e.codigo ?? 'ERRO_DESCONHECIDO', mensagem: e.mensagem, detalhe: e.detalhe }
  }
  return { codigo: 'ERRO_DESCONHECIDO', mensagem: 'Erro inesperado do servidor. Tente novamente.' }
}

/** sha256 do conteúdo do arquivo, em hexadecimal — Web Crypto, sem biblioteca nova (contrato
 *  §2.1: "sha256 do conteúdo que será enviado, calculado pelo chamador"). */
export async function sha256DoArquivo(file: File): Promise<string> {
  const bytes = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function cabecalhosEscrita(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // O card usa a SESSÃO do usuário (cookie), não `x-api-key` — a chave é reservada à RPA
    // (contrato §1); a autorização daqui é `requireAreaApi('admin/uploads')` na rota.
    'x-ingestao-origem': 'manual',
    'x-ingestao-idempotencia': crypto.randomUUID(),
  }
}

/** Passo 1 do contrato — pede uma URL assinada por arquivo. */
export async function pedirUrlsAssinadas(
  base: BaseIngestao,
  arquivos: readonly ArquivoParaHash[],
): Promise<RespostaUploadUrl> {
  const res = await fetch(`/api/ingestao/${base}/upload-url`, {
    method: 'POST',
    headers: cabecalhosEscrita(),
    body: JSON.stringify({ arquivos }),
  })
  const json = await lerRespostaJson(res)
  if (!res.ok) throw new ErroRotaIngestao(extrairErro(json))
  return json as RespostaUploadUrl
}

function tipoMime(nome: string): string {
  return nome.toLowerCase().endsWith('.csv')
    ? 'text/csv'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
}

/** Passo 2 do contrato — `PUT` direto no Storage, com progresso REAL por bytes
 *  (`XMLHttpRequest.upload.onprogress`). */
export function enviarArquivoParaStorage(
  signedUrl: string,
  file: File,
  onProgresso: (bytesEnviados: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', signedUrl)
    xhr.setRequestHeader('Content-Type', tipoMime(file.name))
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgresso(e.loaded) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgresso(file.size); resolve() }
      else reject(new Error(`Falha ao enviar "${file.name}" para o armazenamento (HTTP ${xhr.status}).`))
    }
    xhr.onerror = () => reject(new Error(`Falha de rede ao enviar "${file.name}" para o armazenamento.`))
    xhr.send(file)
  })
}

/** Passo 3 do contrato — conferência (`confirmar: false`) ou aplicação (`confirmar: true`);
 *  mesmo corpo dos dois lados. */
export async function processarCarga(
  base: BaseIngestao,
  args: {
    readonly cargaId: string
    readonly arquivos: readonly ArquivoDaCarga[]
    readonly extraidoEm: string
    readonly confirmar: boolean
    readonly observacao?: string
  },
): Promise<RespostaCarga> {
  const res = await fetch(`/api/ingestao/${base}`, {
    method: 'POST',
    headers: cabecalhosEscrita(),
    body: JSON.stringify({
      carga_id: args.cargaId,
      arquivos: args.arquivos,
      extraido_em: args.extraidoEm,
      confirmar: args.confirmar,
      ...(args.observacao ? { observacao: args.observacao } : {}),
    }),
  })
  const json = await lerRespostaJson(res)
  if (!res.ok) throw new ErroRotaIngestao(extrairErro(json))
  return json as RespostaCarga
}
