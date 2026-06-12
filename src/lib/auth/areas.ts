// Catálogo de ÁREAS de permissão (ADR-0107) — espelho de app.rbac_areas no banco.
// A paridade banco↔app é garantida por teste de contrato (rpc-contrato.test.ts).
// Unidade de permissão = área de navegação; em Performance, granular por setor.

export const AREAS = [
  'executiva',
  'performance',
  'performance/trips',
  'performance/weddings',
  'performance/corporativo',
  'financeiro/fluxo-caixa',
  'financeiro/gerencial',
  'metas',
  'admin/uploads',
  'admin/design-system',
  'admin/acessos',
  'solicitacoes',
] as const

export type Area = (typeof AREAS)[number]

/** A meta-permissão: administrar usuários e roles. */
export const AREA_ADMIN: Area = 'admin/acessos'

/** Espelho de app.rbac_areas (rotulo/grupo/ordem) — usado pela UI de roles. */
export const AREA_INFO: Record<Area, { rotulo: string; grupo: string; ordem: number }> = {
  'executiva':               { rotulo: 'Executiva',                 grupo: 'Geral',         ordem: 10 },
  'performance':             { rotulo: 'Performance — Geral',       grupo: 'Performance',   ordem: 20 },
  'performance/trips':       { rotulo: 'Performance — Trips',       grupo: 'Performance',   ordem: 21 },
  'performance/weddings':    { rotulo: 'Performance — Weddings',    grupo: 'Performance',   ordem: 22 },
  'performance/corporativo': { rotulo: 'Performance — Corporativo', grupo: 'Performance',   ordem: 23 },
  'financeiro/fluxo-caixa':  { rotulo: 'Fluxo de Caixa',            grupo: 'Financeiro',    ordem: 30 },
  'financeiro/gerencial':    { rotulo: 'Fluxo de Caixa Gerencial',  grupo: 'Financeiro',    ordem: 31 },
  'metas':                   { rotulo: 'Metas',                     grupo: 'Geral',         ordem: 40 },
  'admin/uploads':           { rotulo: 'Upload de Arquivos',        grupo: 'Administração', ordem: 50 },
  'admin/design-system':     { rotulo: 'Design System',             grupo: 'Administração', ordem: 51 },
  'admin/acessos':           { rotulo: 'Usuários e Acessos',        grupo: 'Administração', ordem: 52 },
  'solicitacoes':            { rotulo: 'Solicitações (gestão)',     grupo: 'Administração', ordem: 53 },
}

/**
 * Setor (valor do banco: Weddings/Lazer/Corporativo/todos) → áreas que liberam.
 * Espelho de app.areas_do_setor (paridade testada). 'todos' = agregados da
 * empresa: executiva ou a aba geral de Performance.
 */
export function areasDoSetor(setor: string | null | undefined): Area[] {
  switch (setor) {
    case 'Weddings':    return ['performance/weddings']
    case 'Lazer':       return ['performance/trips']
    case 'Corporativo': return ['performance/corporativo']
    default:            return ['executiva', 'performance']
  }
}

/**
 * Rota de página → áreas que a liberam (null = qualquer usuário logado).
 * Prefix-match do mais específico para o mais genérico.
 */
export function areasDaRota(pathname: string): Area[] | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/' || p === '/sem-acesso') return null
  if (p.startsWith('/performance/trips'))       return ['performance/trips']
  if (p.startsWith('/performance/weddings'))    return ['performance/weddings']
  if (p.startsWith('/performance/corporativo')) return ['performance/corporativo']
  if (p.startsWith('/performance'))             return ['performance']
  if (p.startsWith('/financeiro/fluxo-caixa/gerencial')) return ['financeiro/gerencial']
  if (p.startsWith('/financeiro'))              return ['financeiro/fluxo-caixa', 'financeiro/gerencial']
  if (p.startsWith('/executiva'))               return ['executiva']
  if (p.startsWith('/metas'))                   return ['metas']
  if (p.startsWith('/admin/design-system'))     return ['admin/design-system']
  if (p.startsWith('/admin/acessos'))           return ['admin/acessos']
  if (p.startsWith('/admin/uploads'))           return ['admin/uploads']
  if (p.startsWith('/admin/solicitacoes'))      return ['solicitacoes']
  if (p.startsWith('/admin'))                   return ['admin/acessos']
  // /solicitacoes (abertura/minhas/caixa) cai no fallthrough → qualquer autenticado.
  return null
}

/** Ordem de prioridade do redirect inicial (rota `/`). */
const PRIORIDADE_INICIAL: { area: Area; href: string }[] = [
  { area: 'executiva',               href: '/executiva' },
  { area: 'performance/weddings',    href: '/performance/weddings' },
  { area: 'performance/trips',       href: '/performance/trips' },
  { area: 'performance/corporativo', href: '/performance/corporativo' },
  { area: 'performance',             href: '/performance' },
  { area: 'financeiro/fluxo-caixa',  href: '/financeiro/fluxo-caixa' },
  { area: 'financeiro/gerencial',    href: '/financeiro/fluxo-caixa/gerencial' },
  { area: 'metas',                   href: '/metas' },
  { area: 'admin/uploads',           href: '/admin/uploads' },
  { area: 'admin/acessos',           href: '/admin/acessos' },
  { area: 'admin/design-system',     href: '/admin/design-system' },
]

/** Primeira rota permitida para o conjunto de permissões (ou null). */
export function rotaInicial(permissoes: readonly string[]): string | null {
  for (const { area, href } of PRIORIDADE_INICIAL) {
    if (permissoes.includes(area)) return href
  }
  return null
}

/**
 * `next` seguro para redirects pós-login — só caminho relativo interno, à prova
 * de open-redirect. Rejeita: não-relativos, protocolo-relativo (`//`), backslash
 * (`\` que o browser trata como `/` → `/\evil.com` ≡ `//evil.com`), sequências
 * codificadas (`%2f`/`%5c`) e a área de auth (case-insensitive). Endurecido após
 * a auto-auditoria S11 (o filtro antigo deixava passar `/\evil.com`).
 */
export function nextSeguro(next: string | null | undefined): string {
  if (!next || !next.startsWith('/')) return '/'
  if (next.startsWith('//') || next.startsWith('/\\')) return '/'
  if (/[\\]/.test(next)) return '/'
  if (/%2f|%5c/i.test(next)) return '/'
  if (/^\/auth(\/|$|\?)/i.test(next)) return '/'
  return next
}
