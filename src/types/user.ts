export type Role = 'financeiro' | 'gestor'

export interface User {
  id:            string
  email:         string
  nome:          string | null
  role:          Role
  setor_id:      number | null
  ativo:         boolean
  ultimo_acesso: string | null
}
