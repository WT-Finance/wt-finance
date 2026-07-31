// Tipos compartilhados da UI de Chaves de API (v5.4.0/M2). Os shapes espelham
// o retorno jsonb das RPCs api_* (0211) — narrowing defensivo feito em
// @/lib/api-externa/rpc (mesmo padrão de admin/acessos/tipos.ts).
//
// v5.4.0/Round6 (decisão do Yan, 31/07): a whitelist de tipos por chave saiu —
// toda chave alcança todo tipo exposto (migration 0224). `ChaveApi` deixou de
// carregar `whitelist_tipos`; não há mais nada por chave para "montar um
// seletor" (o antigo `TipoWhitelist`/`TipoDisponivel`, órfãos, saíram junto).

export interface RoboChave {
  user_id: string
  email:   string
  nome:    string | null
}

export interface ChaveApi {
  id:                number
  plataforma:        string
  robo:              RoboChave
  ativo:             boolean
  criado_em:         string   // timestamptz — exibir via fmtDataHoraSP
  revogado_em:       string | null
  ultima_chamada_em: string | null
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
