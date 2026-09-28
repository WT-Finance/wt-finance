// Contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §2.1) — POST /api/ingestao/{base}/upload-url
//
// Passo 1: emite uma URL assinada por arquivo, SEM ESTADO (anexo v6.0.0/M4 §1.1a) — nada é
// gravado no banco aqui. O `carga_id` nasce nesta rota e viaja DENTRO do caminho do objeto; é
// o passo 3 (`POST /api/ingestao/{base}`) que lê o caminho de volta e amarra tudo.
export const runtime = 'nodejs'
// Rota leve (gera N URLs assinadas, sem tocar no conteúdo do arquivo) — orçamento igual ao das
// demais rotas de API externa (`src/app/api/externo/**`).
export const maxDuration = 60

import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ehBaseIngestao, BASES_INGESTAO, type BaseIngestao } from '@/lib/ingestao/bases'
import { caminhoCru, urlAssinadaDeUpload, ErroIngestaoStorage } from '@/lib/ingestao/storage'
import { autenticarIngestao, validarArquivosDeclarados, respostaErroCarga, type ArquivoDeclarado } from '@/lib/ingestao/carga'
import { registrarChamada } from '@/lib/api-externa/http'

function rotaDe(base: string): string {
  return `/api/ingestao/${base}/upload-url`
}

const bodySchema = z.object({
  arquivos: z.array(z.object({
    nome: z.string().min(1),
    bytes: z.number().int().positive(),
    sha256: z.string().min(1),
  })).min(1),
})

interface ArquivoRespondido {
  readonly nome: string
  readonly path: string
  readonly signed_url: string
  readonly expira_em: string | null
}

/** Registra no log de chamadas — só a porta CHAVE (contrato §1: "toda chamada, inclusive
 *  negada, vai para api_chamada_log"; a sessão do card não passa por essa auditoria, mesmo
 *  molde de `/api/externo/solicitacoes`). `chaveId` pode ser `null` numa negação (chave que
 *  nem chegou a resolver) — o precedente de `/api/externo/solicitacoes` também registra esse
 *  caso com `chaveId: null`, não pula o log. */
async function logar(auth: Awaited<ReturnType<typeof autenticarIngestao>>, rota: string, status: number, detalhe?: string): Promise<void> {
  if (auth.ok) {
    if (auth.via === 'chave') await registrarChamada(auth.chave.id, rota, status, detalhe)
    return // via 'sessao': card não vai para api_chamada_log
  }
  if (auth.viaChave) await registrarChamada(auth.chaveId, rota, status, detalhe)
}

export async function POST(req: Request, { params }: { params: Promise<{ base: string }> }): Promise<Response> {
  const { base: baseParam } = await params
  if (!ehBaseIngestao(baseParam)) {
    return respostaErroCarga('BASE_DESCONHECIDA', `"${baseParam}" não é uma base de ingestão conhecida.`, 404, { basesConhecidas: BASES_INGESTAO })
  }
  const base: BaseIngestao = baseParam
  const rota = rotaDe(base)

  const auth = await autenticarIngestao(req, base)
  if (!auth.ok) {
    await logar(auth, rota, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }

  let corpoBruto: unknown
  try {
    corpoBruto = await req.json()
  } catch {
    const resposta = respostaErroCarga('FORMATO_INVALIDO', 'Corpo inválido: informe JSON com "arquivos": [{nome,bytes,sha256}, ...].', 422)
    await logar(auth, rota, 422, 'json_invalido')
    return resposta
  }
  const parsedBody = bodySchema.safeParse(corpoBruto)
  if (!parsedBody.success) {
    const resposta = respostaErroCarga(
      'FORMATO_INVALIDO',
      'Corpo inválido: informe "arquivos": [{nome,bytes,sha256}, ...], com "bytes" inteiro positivo.',
      422,
      { issues: parsedBody.error.issues.slice(0, 5) },
    )
    await logar(auth, rota, 422, 'body_invalido')
    return resposta
  }

  const arquivosDeclarados: ArquivoDeclarado[] = parsedBody.data.arquivos
  const erroValidacao = validarArquivosDeclarados(base, arquivosDeclarados)
  if (erroValidacao) {
    await logar(auth, rota, erroValidacao.http, erroValidacao.codigo)
    return erroValidacao.resposta()
  }

  const cargaId = randomUUID()
  const agora = new Date()

  try {
    const arquivos: ArquivoRespondido[] = await Promise.all(
      arquivosDeclarados.map(async (arq, indice) => {
        const path = caminhoCru(base, cargaId, indice + 1, arq.nome, agora)
        const assinado = await urlAssinadaDeUpload(path)
        return { nome: arq.nome, path, signed_url: assinado.signedUrl, expira_em: assinado.expiraEm }
      }),
    )

    // `expira_em` no topo é o MENOR entre os arquivos (o lote inteiro só está "todo válido" até
    // o primeiro token expirar) — `null` quando nenhum token foi legível (ver divergência
    // documentada em `storage.ts#urlAssinadaDeUpload`).
    const expiraEm = arquivos.reduce<string | null>((menor, a) => {
      if (a.expira_em === null) return menor
      if (menor === null || a.expira_em < menor) return a.expira_em
      return menor
    }, null)

    const corpo = {
      carga_id: cargaId,
      expira_em: expiraEm,
      arquivos: arquivos.map(({ nome, path, signed_url }) => ({ nome, path, signed_url })),
    }
    await logar(auth, rota, 200)
    return Response.json(corpo, { status: 200 })
  } catch (err) {
    if (err instanceof ErroIngestaoStorage) {
      console.error(`[api/ingestao/${base}/upload-url] falha ao emitir URL assinada (carga ${cargaId}):`, err.message)
      const resposta = respostaErroCarga('ERRO_INTERNO', 'Falha ao emitir URL de upload. Tente novamente.', 500)
      await logar(auth, rota, 500, err.message)
      return resposta
    }
    console.error(`[api/ingestao/${base}/upload-url] erro inesperado (carga ${cargaId}):`, err)
    const resposta = respostaErroCarga('ERRO_INTERNO', 'Falha inesperada ao emitir URL de upload.', 500)
    await logar(auth, rota, 500, 'erro_inesperado')
    return resposta
  }
}
