import 'server-only'
import { getAdminClient } from '@/lib/supabase/admin'
import { hashSegredo } from './segredo'

// v5.4.0/M3b — Camada HTTP da API externa de Solicitações: autenticação por chave
// (header x-api-key), leitura de corpo com teto de tamanho, e tradução do erro de
// RPC (PREFIXO: detalhe) para HTTP + JSON de erro padronizado. Todas as chamadas de
// RPC aqui usam SERVICE ROLE (getAdminClient) — as RPCs de runtime
// (api_chave_resolver/api_chamada_registrar) e as de negócio (criar_solicitacao_externa/
// cancelar_solicitacao_externa/solic_tipos_api) são service_role-only ou aceitam
// service_role; não existe sessão de usuário nesta superfície (o integrador nunca loga).

type BoundRpc = (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>

/** Chama uma RPC via SERVICE ROLE. Exportado para as rotas reaproveitarem (evita reimplementar o bind em cada route.ts). */
export async function chamarRpcExterna(fn: string, args: Record<string, unknown> = {}): Promise<{ data: unknown; error: { message: string } | null }> {
  const admin = getAdminClient()
  return (admin.rpc as unknown as BoundRpc).bind(admin)(fn, args)
}

export interface ChaveResolvida {
  id: number
  plataforma: string
  whitelist_tipos: number[]
  robo_user_id: string
  callback_url: string | null
  callback_segredo: string | null
}

function comoChaveResolvida(x: unknown): ChaveResolvida | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (typeof o.id !== 'number') return null
  return {
    id:               o.id,
    plataforma:       typeof o.plataforma === 'string' ? o.plataforma : '',
    whitelist_tipos:  Array.isArray(o.whitelist_tipos) ? o.whitelist_tipos.filter((v): v is number => typeof v === 'number') : [],
    robo_user_id:     typeof o.robo_user_id === 'string' ? o.robo_user_id : '',
    callback_url:     typeof o.callback_url === 'string' ? o.callback_url : null,
    callback_segredo: typeof o.callback_segredo === 'string' ? o.callback_segredo : null,
  }
}

/** Resposta de erro padronizada: `{ ok:false, erro:{codigo,mensagem} }`. */
export function respostaErro(codigo: string, mensagem: string, http: number): Response {
  return Response.json({ ok: false, erro: { codigo, mensagem } }, { status: http })
}

/**
 * Autentica a chamada pelo header `x-api-key`. O segredo em claro NUNCA é comparado
 * em código nem persistido — é hasheado (sha256) e a BUSCA é por igualdade de hash
 * no banco (`api_chave_resolver`, índice em `segredo_hash`).
 *
 * Por que hash-then-lookup já resiste a timing attack sem precisar de
 * `compararHashConstante` aqui: o vetor de ataque de timing explora a DIFERENÇA de
 * tempo entre uma comparação byte-a-byte "quase certa" e uma "totalmente errada" —
 * mas aqui não há comparação byte-a-byte em CÓDIGO contra o segredo em claro; o que
 * existe é uma busca por IGUALDADE DE HASH via índice no banco (`WHERE segredo_hash =
 * $1`), e sha256 não é invertível: não dá para, a partir do tempo de uma consulta
 * indexada, reconstituir bytes do segredo original (o hash muda completamente com
 * qualquer bit diferente — efeito avalanche). `compararHashConstante` (segredo.ts)
 * serve para o cenário OPOSTO, quando dois hashes já resolvidos precisam ser
 * comparados EM CÓDIGO (fora do WHERE do banco) — não é o caso deste caminho.
 */
export async function autenticarChamada(req: Request): Promise<{ ok: true; chave: ChaveResolvida } | { ok: false; resposta: Response }> {
  const token = (req.headers.get('x-api-key') ?? '').trim()
  if (!token) {
    return { ok: false, resposta: respostaErro('AUTH_AUSENTE', 'Cabeçalho x-api-key ausente.', 401) }
  }

  const hash = hashSegredo(token)
  const { data, error } = await chamarRpcExterna('api_chave_resolver', { p_segredo_hash: hash })
  const chave = error ? null : comoChaveResolvida(data)
  if (!chave) {
    return { ok: false, resposta: respostaErro('AUTH_INVALIDA', 'Chave de API inválida ou revogada.', 401) }
  }
  return { ok: true, chave }
}

/**
 * Lê o corpo como JSON com teto de tamanho (default 64 KiB — payload de Solicitação
 * é pequeno; nada aqui envia anexo). `content-length` > limite OU texto lido > limite
 * → 413; corpo vazio ou JSON malformado → 400.
 */
export async function lerBodyLimitado(req: Request, maxBytes = 65536): Promise<{ ok: true; body: unknown } | { ok: false; resposta: Response }> {
  const contentLength = req.headers.get('content-length')
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, resposta: respostaErro('PAYLOAD_EXCEDE_LIMITE', `Corpo da requisição excede o limite de ${maxBytes} bytes.`, 413) }
  }

  let texto: string
  try {
    texto = await req.text()
  } catch {
    return { ok: false, resposta: respostaErro('JSON_INVALIDO', 'Não foi possível ler o corpo da requisição.', 400) }
  }
  if (Buffer.byteLength(texto, 'utf8') > maxBytes) {
    return { ok: false, resposta: respostaErro('PAYLOAD_EXCEDE_LIMITE', `Corpo da requisição excede o limite de ${maxBytes} bytes.`, 413) }
  }
  if (texto.trim() === '') {
    return { ok: false, resposta: respostaErro('JSON_INVALIDO', 'Corpo da requisição vazio.', 400) }
  }
  try {
    return { ok: true, body: JSON.parse(texto) }
  } catch {
    return { ok: false, resposta: respostaErro('JSON_INVALIDO', 'JSON inválido no corpo da requisição.', 400) }
  }
}

// Prefixos de erro de VALIDAÇÃO de negócio (RPCs criar_solicitacao_externa /
// cancelar_solicitacao_externa) → 422. Mantido como whitelist explícita (em vez de
// "tudo que não bateu em outra regra") para nunca devolver 422 por engano num erro
// realmente desconhecido — esse cai no ramo 500/ERRO_INTERNO, que não vaza detalhe.
const PREFIXOS_VALIDACAO_422 = new Set([
  // DESTINATARIO_NAO_PERMITIDO saiu no round 3 (migration 0216): a lista branca de
  // equipes por tipo foi revogada — qualquer equipe existente é destino válido.
  'IDEMPOTENCIA_OBRIGATORIA', 'TIPO_INVALIDO', 'DESTINATARIO_OBRIGATORIO',
  'DESTINATARIO_INVALIDO', 'DATA_LIMITE_OBRIGATORIA',
  'CAMPO_DESCONHECIDO', 'TIPO_EXIGE_ANEXO', 'CAMPO_OBRIGATORIO', 'VALOR_INVALIDO',
  'PAYLOAD_INVALIDO',
])

/**
 * Traduz a mensagem de erro de uma RPC (`PREFIXO: detalhe`) para uma `Response` HTTP.
 * PREFIXO desconhecido (RPC ausente/renomeada, erro de infra, etc.) → 500 com
 * mensagem GENÉRICA — nunca vaza o detalhe interno (nome de coluna/tabela/stack) a
 * um integrador externo.
 */
export function traduzirErroRpc(message: string): Response {
  const idx = message.indexOf(':')
  const prefixo = (idx === -1 ? message : message.slice(0, idx)).trim()
  const detalhe = (idx === -1 ? '' : message.slice(idx + 1).trim())

  if (prefixo.startsWith('AUTH_') || prefixo === 'CHAVE_INVALIDA') {
    return respostaErro(prefixo, detalhe || 'Autenticação inválida.', 401)
  }
  if (prefixo === 'TIPO_NAO_AUTORIZADO') {
    return respostaErro(prefixo, detalhe || 'Tipo de solicitação não autorizado para esta chave.', 403)
  }
  if (prefixo === 'NAO_ENCONTRADA') {
    return respostaErro(prefixo, detalhe || 'Recurso não encontrado.', 404)
  }
  if (prefixo === 'CONFLITO_ESTADO') {
    return respostaErro(prefixo, detalhe || 'A solicitação não está mais em um estado que permita esta ação.', 409)
  }
  if (prefixo.startsWith('PAYLOAD') && prefixo !== 'PAYLOAD_INVALIDO') {
    return respostaErro(prefixo, detalhe || 'Payload excede o limite permitido.', 413)
  }
  if (PREFIXOS_VALIDACAO_422.has(prefixo)) {
    return respostaErro(prefixo, detalhe || 'Dado inválido.', 422)
  }

  return respostaErro('ERRO_INTERNO', 'Erro interno ao processar a requisição.', 500)
}

export interface EmailsEnvolvidosSvc {
  tipo_nome:         string | null
  autor_rotulo:      string | null
  atribuido_rotulo:  string | null
  criado_em_fmt:     string | null
  decidido_em_fmt:   string | null
  envolvidos_emails: string[]
}

function comoEmailsEnvolvidos(x: unknown): EmailsEnvolvidosSvc | null {
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  return {
    tipo_nome:         typeof o.tipo_nome === 'string' ? o.tipo_nome : null,
    autor_rotulo:      typeof o.autor_rotulo === 'string' ? o.autor_rotulo : null,
    atribuido_rotulo:  typeof o.atribuido_rotulo === 'string' ? o.atribuido_rotulo : null,
    criado_em_fmt:     typeof o.criado_em_fmt === 'string' ? o.criado_em_fmt : null,
    decidido_em_fmt:   typeof o.decidido_em_fmt === 'string' ? o.decidido_em_fmt : null,
    envolvidos_emails: Array.isArray(o.envolvidos_emails)
      ? o.envolvidos_emails.filter((e): e is string => typeof e === 'string')
      : [],
  }
}

/**
 * Envolvidos de uma solicitação (v5.4.0/M4, ADR-0161) via a variante SERVICE-ROLE
 * de `solic_emails_envolvidos` (migration 0213: `solic_emails_envolvidos_svc`) —
 * esta porta (rotas `/api/externo/*`) NÃO tem sessão de usuário (chave de API,
 * não JWT Supabase); a RPC gated por `exigir_acesso`/`pode_ver_solic` sempre
 * negaria aqui (limitação conhecida do M3b, agora corrigida). `null` em erro de
 * RPC — fallback-safe; o caller trata como "sem envolvidos" e pula o e-mail.
 */
export async function getEmailsEnvolvidosSvc(id: number): Promise<EmailsEnvolvidosSvc | null> {
  const { data, error } = await chamarRpcExterna('solic_emails_envolvidos_svc', { p_id: id })
  if (error) return null
  return comoEmailsEnvolvidos(data)
}

/**
 * Registra a chamada no log de auditoria (`api_chamada_log`). BEST-EFFORT: nunca
 * lança nem afeta a resposta ao integrador — é uma camada ADICIONAL de observabilidade
 * (mesmo espírito do e-mail de notificação, `enviarNotificacaoSolicitacao`).
 * `chaveId=null` é válido (chamada rejeitada por auth ausente/inválida ainda é
 * auditada, só sem vínculo a uma chave real).
 */
export async function registrarChamada(chaveId: number | null, rota: string, status: number, detalhe?: string): Promise<void> {
  try {
    await chamarRpcExterna('api_chamada_registrar', {
      p_chave_id: chaveId, p_rota: rota, p_status: status, p_detalhe: detalhe ?? null,
    })
  } catch {
    // auditoria é best-effort: nunca deve derrubar a resposta ao integrador.
  }
}
