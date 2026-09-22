// Contrato de ingestão v1 (`docs/contratos/ingestao-v1.md` §2.3) — POST /api/ingestao/{base}
//
// A carga em si: confere path/sha256, parseia, checa checksums do arquivo, reconcilia o
// conjunto, mede o diff contra a base viva e (se `confirmar`, default `true`) aplica. Uma
// transação de negócio por carga — `processarCarga` (carga.ts) é quem orquestra o §2.3
// completo; esta rota só resolve autenticação, corpo e traduz `ErroCarga` para `Response`.
export const runtime = 'nodejs'
// Rota PESADA: baixa até 200 MB (soma da carga) do Storage, faz parse de xlsx/csv em memória e
// aplica em lotes contra o Postgres. 300s segue o precedente de `/api/monde/ingest` (a outra
// rota de ingestão pesada do projeto) — mas SEM medição real com arquivo grande nesta missão
// (não há como medir sem rede/servidor, fora do que um subagente-editor pode fazer). Mesmo
// achado MÉDIO do revisor-db na migration 0274: falta medir o swap com volume real e decidir
// se cabe um teto menor. Registrado no relato desta missão para o orquestrador acompanhar.
export const maxDuration = 300

import { z } from 'zod'
import { ehBaseIngestao, BASES_INGESTAO, type BaseIngestao } from '@/lib/ingestao/bases'
import {
  autenticarIngestao, processarCarga, ErroCarga, respostaErroCarga,
  type EntradaCarga, type ArquivoRecebido,
} from '@/lib/ingestao/carga'
import { registrarChamada } from '@/lib/api-externa/http'

function rotaDe(base: string): string {
  return `/api/ingestao/${base}`
}

/** Mesmo padrão de `upload-url/route.ts`: só a porta CHAVE vai para `api_chamada_log`
 *  (contrato §1); `chaveId` pode ser `null` numa negação (chave que nem chegou a resolver). */
async function logar(auth: Awaited<ReturnType<typeof autenticarIngestao>>, rota: string, status: number, detalhe?: string): Promise<void> {
  if (auth.ok) {
    if (auth.via === 'chave') await registrarChamada(auth.chave.id, rota, status, detalhe)
    return
  }
  if (auth.viaChave) await registrarChamada(auth.chaveId, rota, status, detalhe)
}

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const bodySchema = z.object({
  carga_id: z.string().regex(REGEX_UUID, 'carga_id precisa ser um UUID.'),
  arquivos: z.array(z.object({
    path: z.string().min(1),
    nome: z.string().min(1),
    sha256: z.string().min(1),
  })).min(1),
  extraido_em: z.string().nullable().optional(),
  observacao: z.string().nullable().optional(),
  // Default `true` — o card manda `false` primeiro (conferência), a RPA nunca envia o campo e
  // vê o contrato tal como congelado (anexo M4 §1.1c/§5).
  confirmar: z.boolean().optional(),
})

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

  const origem = (req.headers.get('x-ingestao-origem') ?? '').trim()
  if (origem === '') {
    const resposta = respostaErroCarga('FORMATO_INVALIDO', 'Cabeçalho "x-ingestao-origem" é obrigatório.', 422)
    await logar(auth, rota, 422, 'origem_ausente')
    return resposta
  }

  const idempotenciaHeader = (req.headers.get('x-ingestao-idempotencia') ?? '').trim()
  if (idempotenciaHeader !== '' && !REGEX_UUID.test(idempotenciaHeader)) {
    const resposta = respostaErroCarga('FORMATO_INVALIDO', 'Cabeçalho "x-ingestao-idempotencia" precisa ser um UUID (v4 recomendado).', 422)
    await logar(auth, rota, 422, 'idempotencia_invalida')
    return resposta
  }

  let corpoBruto: unknown
  try {
    corpoBruto = await req.json()
  } catch {
    const resposta = respostaErroCarga('FORMATO_INVALIDO', 'Corpo inválido: informe JSON com "carga_id" e "arquivos".', 422)
    await logar(auth, rota, 422, 'json_invalido')
    return resposta
  }
  const parsedBody = bodySchema.safeParse(corpoBruto)
  if (!parsedBody.success) {
    const resposta = respostaErroCarga(
      'FORMATO_INVALIDO',
      'Corpo inválido: informe "carga_id" (uuid) e "arquivos": [{path,nome,sha256}, ...].',
      422,
      { issues: parsedBody.error.issues.slice(0, 5) },
    )
    await logar(auth, rota, 422, 'body_invalido')
    return resposta
  }
  const p = parsedBody.data

  const arquivos: ArquivoRecebido[] = p.arquivos
  const entrada: EntradaCarga = {
    base,
    cargaId: p.carga_id,
    arquivos,
    extraidoEm: p.extraido_em ?? null,
    observacao: p.observacao ?? null,
    origem,
    idempotencia: idempotenciaHeader === '' ? null : idempotenciaHeader,
    confirmar: p.confirmar ?? true,
    chaveId: auth.via === 'chave' ? auth.chave.id : null,
    usuarioId: auth.via === 'sessao' ? auth.sessao.userId : null,
  }

  try {
    const resultado = await processarCarga(entrada)
    await logar(auth, rota, 200)
    return Response.json(resultado, { status: 200 })
  } catch (err) {
    if (err instanceof ErroCarga) {
      await logar(auth, rota, err.http, err.codigo)
      return err.resposta()
    }
    // Nunca silencioso (contrato §2.4: "500 | ERRO_INTERNO | nunca silencioso") — mas o detalhe
    // interno (nome de tabela, stack) NUNCA vaza ao chamador; `processarCarga` já deveria ter
    // traduzido tudo previsível para `ErroCarga`, então chegar aqui é sinal de bug real.
    console.error(`[api/ingestao/${base}] erro inesperado (carga ${entrada.cargaId}):`, err)
    const resposta = respostaErroCarga('ERRO_INTERNO', 'Falha inesperada ao processar a carga.', 500)
    await logar(auth, rota, 500, 'erro_inesperado')
    return resposta
  }
}
