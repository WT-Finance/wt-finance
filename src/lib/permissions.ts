import type { User } from '@/types/user'

// Grau 1 — funções hardcoded baseadas em user.role.
// Quando Grau 2/3 chegar, apenas o interior destas funções muda;
// os consumidores (endpoints, componentes) continuam iguais.

export function canEditCosts(user: User): boolean {
  return user.role === 'financeiro'
}

export function canInviteUsers(user: User): boolean {
  return user.role === 'financeiro'
}

export function canViewAllSectors(user: User): boolean {
  return user.role === 'financeiro'
}

export function canManageUsers(user: User): boolean {
  return user.role === 'financeiro'
}

// Retorna o setor_id do usuário se for gestor, null se for financeiro (sem restrição).
export function getUserSectorScope(user: User): number | null {
  if (user.role === 'financeiro') return null
  return user.setor_id
}
