// API externa de Solicitações (v5.4.0/M3b) — POST /api/externo/solicitacoes
//
// Cria uma Solicitação em nome da chave de API (header x-api-key). SEM anexos, SEM
// estados além dos já existentes (aberta/concluida/rejeitada/cancelada — a conclusão
// segue sendo feita pela UI/atendente), SEM vocabulário de integrador específico.
// Idempotente por (chave, chave_idempotencia): reenviar o mesmo par devolve o MESMO
// id (idempotente:true, HTTP 200) em vez de duplicar (HTTP 201 na 1ª vez).
export const runtime = 'nodejs'
// Orçamento explícito (revisor v5.4.0): sobra só o e-mail best-effort (~10s) — a
// entrega inline de callback saiu no Round5 (o Janus não chama mais ninguém).
export const maxDuration = 60

import { z } from 'zod'
import {
  autenticarChamada, lerBodyLimitado, chamarRpcExterna, respostaErro, traduzirErroRpc, registrarChamada,
  getEmailsEnvolvidosSvc,
} from '@/lib/api-externa/http'
import { comoListaConsulta } from '@/lib/api-externa/consulta'
import { enviarNotificacaoSolicitacao } from '@/lib/email'

const ROTA = '/api/externo/solicitacoes'

// Valor de campo aceita string OU number (planilha/JSON de integrador pode mandar
// número cru) — sempre coagido a STRING antes de ir para o banco (a RPC valida o
// formato por tipo_campo: moeda/data/selecao). Mesmo espírito de @/lib/carga/coercao,
// mas aqui é achatamento de shape de payload HTTP, não parsing numérico — não há
// ambiguidade de separador de milhar/decimal a resolver.
const valorCampo = z.union([z.string(), z.number()]).transform(v => (typeof v === 'number' ? String(v) : v))

const bodySchema = z.object({
  tipo:               z.string().min(1, 'tipo é obrigatório'),
  chave_idempotencia: z.string().min(1, 'chave_idempotencia é obrigatória'),
  destinatario:       z.union([z.string(), z.number()]).transform(v => String(v)),
  titulo:             z.string().optional(),
  campos:             z.record(z.string(), valorCampo).optional(),
  data_limite:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data_limite deve estar no formato AAAA-MM-DD'),
  referencia_origem:  z.string().optional(),
  // v5.4.0/Round4 (decisão do Yan, 2026-07-30): quem pediu no sistema de
  // origem precisa ter cadastro ATIVO no Janus — vira o SOLICITANTE de
  // verdade (aparece em "Minhas solicitações", recebe os e-mails de
  // movimentação, cancela pela tela). A RPC valida o cadastro/ativo; aqui só
  // o formato de e-mail.
  solicitante_email: z.string().min(1, 'solicitante_email é obrigatório').email('solicitante_email deve ser um e-mail válido'),
})

interface ResultadoCriacao {
  ok:          true
  id:          number
  status:      string
  destinatario: { id: number; nome: string }
  // email é `| null` por um caminho estreito e legítimo: no ACK IDEMPOTENTE a RPC lê o
  // solicitante da linha JÁ gravada (`LEFT JOIN app.rbac_usuarios`), e se o cadastro
  // dessa pessoa tiver sido removido da plataforma no meio o join não acha — o certo
  // ali é devolver o ack com o e-mail nulo, não um 500 (achado MÉDIO do revisor-db do
  // round 4). Na CRIAÇÃO é sempre string: a pessoa acabou de ser resolvida e
  // `rbac_usuarios.email` é NOT NULL.
  solicitante:  { email: string | null; nome: string | null }
  idempotente: boolean
}

/**
 * Narrowing DEFENSIVO do retorno da RPC (revisor v5.4.0): um drift de shape (campo
 * renomeado/omitido) não pode degradar em silêncio — `idempotente: undefined` faria
 * a rota reenviar e-mail em replay e responder 201 sempre, quebrando o contrato de
 * idempotência. Drift → 500 explícito (o integrador retenta; nada é corrompido).
 */
function comoResultadoCriacao(data: unknown): ResultadoCriacao | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const dest = d.destinatario as Record<string, unknown> | undefined
  const solic = d.solicitante as Record<string, unknown> | undefined
  if (typeof d.id !== 'number' || d.id <= 0) return null
  if (typeof d.status !== 'string' || typeof d.idempotente !== 'boolean') return null
  if (!dest || typeof dest.id !== 'number' || typeof dest.nome !== 'string') return null
  // A CHAVE tem de existir (drift → 500); os VALORES podem ser nulos no ack idempotente
  // (ver comentário do tipo acima). `!solic` continua reprovando a ausência do objeto.
  if (!solic) return null
  if (solic.email !== null && typeof solic.email !== 'string') return null
  if (solic.nome !== null && typeof solic.nome !== 'string') return null
  return {
    ok: true, id: d.id, status: d.status,
    destinatario: { id: dest.id, nome: dest.nome },
    solicitante: { email: solic.email as string | null, nome: solic.nome as string | null },
    idempotente: d.idempotente,
  }
}

/**
 * Notifica os envolvidos por e-mail (mesmo padrão de src/app/solicitacoes/actions.ts).
 * BEST-EFFORT: jamais afeta a resposta ao integrador.
 *
 * v5.4.0/M4 (ADR-0161): FIX da limitação conhecida do M3b — `solic_emails_envolvidos`
 * exige `app.pode_ver_solic()`/`exigir_acesso()` (área 'solicitacoes' OU uid_jwt()
 * batendo solicitante/destinatário), e esta rota NÃO tem sessão de usuário (chave de
 * API, não JWT Supabase) — a RPC gated sempre negava aqui. `getEmailsEnvolvidosSvc`
 * chama a variante `solic_emails_envolvidos_svc` (migration 0213, service_role-only,
 * sem os guards de sessão), corrigindo o fan-out.
 */
async function notificarCriacao(id: number): Promise<void> {
  try {
    const ctx = await getEmailsEnvolvidosSvc(id)
    if (!ctx) {
      console.error(`[api-externa] notificação #${id} (criada): sem contexto de envolvidos (RPC falhou) — e-mail não enviado.`)
      return
    }
    if (ctx.envolvidos_emails.length === 0) {
      console.error(`[api-externa] notificação #${id} (criada): nenhum envolvido com e-mail — nada enviado.`)
      return
    }
    await enviarNotificacaoSolicitacao({
      paras:           ctx.envolvidos_emails,
      movimentacao:    'criada',
      titulo:          `${ctx.tipo_nome ?? 'Solicitação'} #${id}`,
      atribuidoRotulo: ctx.atribuido_rotulo ?? '—',
      autorRotulo:     ctx.autor_rotulo ?? '—',
      quando:          ctx.criado_em_fmt,
    })
  } catch (err) {
    // E-mail é camada ADICIONAL: jamais quebra a resposta ao integrador — mas nunca
    // em silêncio (lição da v5.3.4: o `catch {}` mudo atrasou o diagnóstico do
    // fan-out intermitente).
    console.error(`[api-externa] notificação #${id} (criada) falhou:`, err)
  }
}

/**
 * GET /api/externo/solicitacoes?referencia_origem=… — busca pelo id DO INTEGRADOR
 * (v5.4.0/Round4). Devolve COLEÇÃO, não item: `referencia_origem` não é única no
 * Janus (só o par chave+chave_idempotencia é), então a mesma referência pode ter
 * sido usada em pedidos diferentes — esconder isso atrás de "o primeiro" faria o
 * integrador conciliar contra a solicitação errada. Sem resultado é 200 com lista
 * vazia: é uma busca sem retorno, não um recurso inexistente.
 */
export async function GET(req: Request): Promise<Response> {
  const auth = await autenticarChamada(req)
  if (!auth.ok) {
    await registrarChamada(null, ROTA, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }
  const { chave } = auth

  const ref = new URL(req.url).searchParams.get('referencia_origem')?.trim() ?? ''
  if (ref === '') {
    const detalhe = 'informe referencia_origem na query (ou consulte por id em /api/externo/solicitacoes/{id})'
    const resposta = respostaErro('CONSULTA_INVALIDA', detalhe, 422)
    await registrarChamada(chave.id, ROTA, 422, detalhe)
    return resposta
  }

  const { data, error } = await chamarRpcExterna('consultar_solicitacoes_externas', {
    p_chave_id: chave.id,
    p_solicitacao_id: null,
    p_referencia_origem: ref,
  })

  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const solicitacoes = comoListaConsulta(data)
  if (!solicitacoes) {
    await registrarChamada(chave.id, ROTA, 500, 'shape inesperado no retorno de consultar_solicitacoes_externas')
    return respostaErro('ERRO_INTERNO', 'Falha inesperada. Tente novamente com backoff.', 500)
  }

  const resposta = Response.json({ ok: true, solicitacoes }, { status: 200 })
  await registrarChamada(chave.id, ROTA, 200)
  return resposta
}

export async function POST(req: Request): Promise<Response> {
  const auth = await autenticarChamada(req)
  if (!auth.ok) {
    await registrarChamada(null, ROTA, auth.resposta.status, 'auth_negada')
    return auth.resposta
  }
  const { chave } = auth

  const lido = await lerBodyLimitado(req)
  if (!lido.ok) {
    await registrarChamada(chave.id, ROTA, lido.resposta.status, 'body_invalido')
    return lido.resposta
  }

  const parsed = bodySchema.safeParse(lido.body)
  if (!parsed.success) {
    // O NOME do campo entra na mensagem: quando um obrigatório vem AUSENTE, o Zod
    // reporta o erro de tipo ("expected string, received undefined") e a mensagem
    // customizada do `.min(1, …)` nem dispara — sem o caminho, o integrador recebe
    // "expected string, received undefined" e não sabe QUAL campo faltou (achado da
    // prova HTTP do round 4). Vale para todos os obrigatórios, não só o novo.
    // Só no `invalid_type` — nos demais a mensagem customizada já nomeia o campo, e
    // prefixar produziria "solicitante_email: solicitante_email deve ser…".
    const issue = parsed.error.issues[0]
    const nomeia = issue?.code === 'invalid_type' && issue.path.length > 0
    const detalhe = issue
      ? `${nomeia ? `${issue.path.join('.')}: ` : ''}${issue.message}`
      : 'payload inválido'
    const resposta = respostaErro('PAYLOAD_INVALIDO', detalhe, 422)
    await registrarChamada(chave.id, ROTA, 422, detalhe)
    return resposta
  }
  const p = parsed.data

  const { data, error } = await chamarRpcExterna('criar_solicitacao_externa', {
    p_chave_id:           chave.id,
    p_tipo_slug:          p.tipo,
    p_destinatario:       p.destinatario,
    p_titulo:             p.titulo ?? null,
    p_campos:             p.campos ?? {},
    p_data_limite:        p.data_limite,
    p_chave_idempotencia: p.chave_idempotencia,
    p_referencia_origem:  p.referencia_origem ?? null,
    p_solicitante_email:  p.solicitante_email,
  })

  if (error) {
    const resposta = traduzirErroRpc(error.message)
    await registrarChamada(chave.id, ROTA, resposta.status, error.message)
    return resposta
  }

  const resultado = comoResultadoCriacao(data)
  if (!resultado) {
    await registrarChamada(chave.id, ROTA, 500, 'shape inesperado no retorno de criar_solicitacao_externa')
    return respostaErro('ERRO_INTERNO', 'Falha inesperada. Tente novamente com backoff.', 500)
  }
  if (!resultado.idempotente) {
    await notificarCriacao(resultado.id)
  }

  const http = resultado.idempotente ? 200 : 201
  const resposta = Response.json({
    ok: true, id: resultado.id, status: resultado.status,
    destinatario: resultado.destinatario, solicitante: resultado.solicitante,
    idempotente: resultado.idempotente,
  }, { status: http })
  await registrarChamada(chave.id, ROTA, http)
  return resposta
}
