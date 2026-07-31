import 'server-only'

// v5.4.0/Round4 — narrowing defensivo do retorno de
// `consultar_solicitacoes_externas` (migration 0221), compartilhado pelas duas
// rotas de leitura: GET /solicitacoes/{id} e GET /solicitacoes?referencia_origem=.
//
// Mesmo princípio das rotas de escrita (revisor v5.4.0): um drift de shape não
// pode degradar em silêncio. Aqui o risco concreto seria devolver ao integrador um
// objeto sem `status` — ele leria `undefined` como "ainda não decidida" e ficaria
// esperando para sempre. Drift → 500 explícito.

export interface SolicitacaoExterna {
  id:                 number
  status:             string
  tipo:               string | null
  titulo:             string | null
  destinatario:       { id: number | null; nome: string | null }
  solicitante:        { email: string | null; nome: string | null }
  data_limite:        string | null
  criado_em:          string | null
  decidido_em:        string | null
  justificativa:      string | null
  referencia_origem:  string | null
  chave_idempotencia: string | null
}

function texto(v: unknown): string | null {
  return typeof v === 'string' ? v : v === null || v === undefined ? null : null
}

function comoItem(x: unknown): SolicitacaoExterna | null {
  if (!x || typeof x !== 'object') return null
  const o = x as Record<string, unknown>
  // id e status são o CONTRATO desta rota — sem eles a resposta não tem sentido.
  if (typeof o.id !== 'number' || o.id <= 0) return null
  if (typeof o.status !== 'string' || o.status === '') return null
  const dest = (o.destinatario ?? {}) as Record<string, unknown>
  const solic = (o.solicitante ?? {}) as Record<string, unknown>
  return {
    id:     o.id,
    status: o.status,
    tipo:   texto(o.tipo),
    titulo: texto(o.titulo),
    destinatario: {
      id:   typeof dest.id === 'number' ? dest.id : null,
      nome: texto(dest.nome),
    },
    solicitante: {
      email: texto(solic.email),
      nome:  texto(solic.nome),
    },
    data_limite:        texto(o.data_limite),
    criado_em:          texto(o.criado_em),
    decidido_em:        texto(o.decidido_em),
    justificativa:      texto(o.justificativa),
    referencia_origem:  texto(o.referencia_origem),
    chave_idempotencia: texto(o.chave_idempotencia),
  }
}

/** Array validado item a item; `null` = drift (um item inválido reprova o conjunto). */
export function comoListaConsulta(data: unknown): SolicitacaoExterna[] | null {
  if (!Array.isArray(data)) return null
  const itens: SolicitacaoExterna[] = []
  for (const bruto of data) {
    const item = comoItem(bruto)
    if (!item) return null
    itens.push(item)
  }
  return itens
}
