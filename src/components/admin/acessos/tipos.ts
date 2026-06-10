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

/** Retorno do convite: link copiável (null quando o generateLink falhou). */
export type ResultadoConvite =
  | { ok: true; linkConvite: string | null }
  | { ok: false; erro: string }

/** Retorno da geração de link de acesso sob demanda (re-copiar). */
export type ResultadoLink =
  | { ok: true; link: string }
  | { ok: false; erro: string }
