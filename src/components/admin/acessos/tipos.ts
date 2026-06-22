// Tipos compartilhados da UI de administração de acessos (v4.13).
// Os shapes espelham o retorno jsonb das RPCs admin_* — o narrowing defensivo
// (Json → tipo) é feito na page server-side, antes de chegar aos componentes.

export interface AreaCatalogo {
  area:   string
  rotulo: string
  grupo:  string
  ordem:  number
}

export interface RoleAdmin {
  id:         number
  nome:       string
  descricao:  string | null
  permissoes: string[]
  n_usuarios: number
}

export interface UsuarioAdmin {
  user_id:          string
  email:            string
  nome:             string | null
  role_id:          number | null
  role:             string | null
  ativo:            boolean
  criado_em:        string | null
  ultimo_login:     string | null
  convite_pendente: boolean
}

/** Retorno padrão das server actions de acessos. */
export type ResultadoAcao =
  | { ok: true }
  | { ok: false; erro: string }

/** Solicitação de acesso (auto-cadastro moderado, v4.14). */
export interface SolicitacaoAdmin {
  id:          number
  email:       string
  nome:        string | null
  status:      'pendente' | 'aprovada' | 'rejeitada'
  criado_em:   string | null
  decidido_em: string | null
  // v4.18/M4 — histórico mais informativo (admin_listar_solicitacoes, migration 0139):
  decidido_por_rotulo: string | null   // nome ou e-mail de quem decidiu
  observacao:          string | null   // motivo, quando rejeitada
}

/** Criação de usuário (v4.14): devolve a senha provisória para exibir ao admin.
 *  v4.24.0 — emailEnviado: a senha também foi enviada por e-mail? (false = fallback). */
export type ResultadoCriarUsuario =
  | { ok: true; email: string; senha: string; emailEnviado: boolean }
  | { ok: false; erro: string }

/** Reset de senha: nova senha provisória para exibir ao admin. */
export type ResultadoSenha =
  | { ok: true; senha: string }
  | { ok: false; erro: string }
