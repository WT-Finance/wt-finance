// Tipos compartilhados da UI de Chaves de API (v5.4.0/M2). Os shapes espelham
// o retorno jsonb das RPCs api_* (0951) — narrowing defensivo feito em
// @/lib/api-externa/rpc (mesmo padrão de admin/acessos/tipos.ts).

/** Um tipo de solicitação, na forma reduzida usada pela whitelist. */
export interface TipoWhitelist {
  id:   number
  nome: string
}

/** Catálogo completo de tipos disponível para MONTAR a whitelist (inclui
 *  arquivados — uma chave já registrada pode ter um tipo arquivado na sua
 *  whitelist; escondê-lo do seletor faria o admin removê-lo sem querer ao salvar). */
export interface TipoDisponivel extends TipoWhitelist {
  arquivado: boolean
}

export interface RoboChave {
  user_id: string
  email:   string
  nome:    string | null
}

export interface ChaveApi {
  id:                   number
  plataforma:           string
  callback_url:         string | null
  tem_callback_segredo: boolean
  whitelist_tipos:      TipoWhitelist[]
  robo:                 RoboChave
  ativo:                boolean
  criado_em:            string   // timestamptz — exibir via fmtDataHoraSP
  revogado_em:          string | null
  ultima_chamada_em:    string | null
}

export interface LogChamada {
  rota:      string
  status:    number
  detalhe:   string | null
  criado_em: string   // timestamptz — exibir via fmtDataHoraSP
}

/** Retorno padrão das server actions de mutação. */
export type ResultadoAcao =
  | { ok: true }
  | { ok: false; erro: string }

/** Criação de chave: devolve o segredo em claro para exibir UMA VEZ ao admin. */
export type ResultadoCriarChave =
  | { ok: true; segredo: string; plataforma: string }
  | { ok: false; erro: string }
