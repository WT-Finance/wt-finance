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
  'financeiro/faturamento-corp',
  'financeiro/acervo',
  'financeiro/acervo/gestao',
  'metas',
  'admin/uploads',
  'admin/design-system',
  'admin/acessos',
  'solicitacoes/basico',
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
  'financeiro/faturamento-corp': { rotulo: 'Faturamento Corporativo', grupo: 'Financeiro',  ordem: 32 },
  // Acervo de Documentos em DOIS níveis (v4.34.0), mesmo padrão de
  // solicitacoes/basico × solicitacoes (0127/0144): 'financeiro/acervo' = ver a
  // biblioteca; 'financeiro/acervo/gestao' = adicionar documentos (INCLUI a visão —
  // a página faz OR das duas áreas, então quem só tem gestão também vê).
  'financeiro/acervo':        { rotulo: 'Acervo de Documentos',          grupo: 'Financeiro', ordem: 33 },
  'financeiro/acervo/gestao': { rotulo: 'Acervo — Adicionar documentos', grupo: 'Financeiro', ordem: 34 },
  'metas':                   { rotulo: 'Metas',                     grupo: 'Geral',         ordem: 40 },
  'admin/uploads':           { rotulo: 'Upload de Arquivos',        grupo: 'Administração', ordem: 50 },
  'admin/design-system':     { rotulo: 'Design System',             grupo: 'Administração', ordem: 51 },
  'admin/acessos':           { rotulo: 'Usuários e Acessos',        grupo: 'Administração', ordem: 52 },
  // Solicitações em DOIS níveis (v4.20.0, ADR-0121): 'solicitacoes/basico' = acesso
  // BÁSICO (caixa de entrada + minhas); 'solicitacoes' = GESTÃO (inclui o básico +
  // Ver todas / Gerenciar / Movimentações). O nome 'solicitacoes' é histórico (sempre
  // foi a área de gestão); a básica nasceu depois, daí o sufixo. Grupo próprio
  // 'Solicitações' (migration 0144) p/ os dois níveis aparecerem juntos no editor de roles.
  'solicitacoes/basico':     { rotulo: 'Solicitações',              grupo: 'Solicitações',  ordem: 53 },
  'solicitacoes':            { rotulo: 'Solicitações (gestão)',     grupo: 'Solicitações',  ordem: 54 },
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
  if (p.startsWith('/financeiro/calculadora-rateio'))    return ['financeiro/gerencial']
  if (p.startsWith('/financeiro/faturamento-corp'))      return ['financeiro/faturamento-corp']
  // Acervo em DOIS níveis: qualquer uma das duas libera a página (gestão inclui a
  // visão); os botões de adicionar documento continuam exigindo só a de gestão.
  if (p.startsWith('/financeiro/acervo'))       return ['financeiro/acervo', 'financeiro/acervo/gestao']
  if (p.startsWith('/financeiro'))              return ['financeiro/fluxo-caixa', 'financeiro/gerencial']
  if (p.startsWith('/executiva'))               return ['executiva']
  if (p.startsWith('/metas'))                   return ['metas']
  if (p.startsWith('/admin/design-system'))     return ['admin/design-system']
  if (p.startsWith('/admin/acessos'))           return ['admin/acessos']
  if (p.startsWith('/admin/uploads'))           return ['admin/uploads']
  if (p.startsWith('/admin/solicitacoes'))      return ['solicitacoes']
  if (p.startsWith('/admin'))                   return ['admin/acessos']
  // /solicitacoes (abertura/minhas/caixa): acesso BÁSICO ou GESTÃO (v4.20.0). A gestão
  // inclui o básico, então qualquer das duas libera a página; os botões/rotas de gestão
  // continuam exigindo só 'solicitacoes'. (/admin/solicitacoes já casou acima.)
  if (p.startsWith('/solicitacoes'))            return ['solicitacoes/basico', 'solicitacoes']
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
