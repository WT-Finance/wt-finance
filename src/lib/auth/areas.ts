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
  'financeiro/dre',
  'metas',
  'metas/acompanhamento',
  'admin/uploads',
  'admin/design-system',
  'admin/acessos',
  'solicitacoes/basico',
  'solicitacoes',
  'solicitacoes/documentacao',
  'api-externa',
  'gestao-pessoas/inventario',
  'gestao-pessoas/estante',
  'gestao-pessoas/estante/gestao',
  'marketing/gastos',
] as const

export type Area = (typeof AREAS)[number]

/** A meta-permissão: administrar usuários e roles. */
export const AREA_ADMIN: Area = 'admin/acessos'

/** Espelho de app.rbac_areas (rotulo/grupo/ordem) — usado pela UI de roles. */
export const AREA_INFO: Record<Area, { rotulo: string; grupo: string; ordem: number }> = {
  'executiva':               { rotulo: 'Executiva',                 grupo: 'Geral',         ordem: 10 },
  'performance':             { rotulo: 'Performance/Geral',         grupo: 'Performance',   ordem: 20 },
  'performance/trips':       { rotulo: 'Performance/Trips',         grupo: 'Performance',   ordem: 21 },
  'performance/weddings':    { rotulo: 'Performance/Weddings',      grupo: 'Performance',   ordem: 22 },
  'performance/corporativo': { rotulo: 'Performance/Corporativo',   grupo: 'Performance',   ordem: 23 },
  'financeiro/fluxo-caixa':  { rotulo: 'Fluxo de Caixa',            grupo: 'Financeiro',    ordem: 30 },
  'financeiro/gerencial':    { rotulo: 'Gerencial',                 grupo: 'Financeiro',    ordem: 31 },
  'financeiro/faturamento-corp': { rotulo: 'Faturamento Corporativo', grupo: 'Financeiro',  ordem: 32 },
  // Acervo de Documentos em DOIS níveis (v4.34.0), mesmo padrão de
  // solicitacoes/basico × solicitacoes (0127/0144): 'financeiro/acervo' = ver a
  // biblioteca; 'financeiro/acervo/gestao' = adicionar/excluir documentos (INCLUI a
  // visão — a página faz OR das duas áreas, então quem só tem gestão também vê).
  'financeiro/acervo':        { rotulo: 'Acervo de Documentos',          grupo: 'Financeiro', ordem: 33 },
  'financeiro/acervo/gestao': { rotulo: 'Acervo de Documentos (gestão)', grupo: 'Financeiro', ordem: 34 },
  // DRE (v5.2.0, checkpoint): área própria da aba /financeiro/dre (migration 0197) —
  // gate apertado no seed (só admins); o admin concede aos demais pelo editor de roles.
  'financeiro/dre':           { rotulo: 'Demonstrativo de Resultado',    grupo: 'Financeiro', ordem: 35 },
  // Metas em DOIS níveis (v5.0.0): a CHAVE 'metas' (nome histórico) = GESTÃO/Cadastro (definir/
  // editar metas, inclui a visão + o botão "Modo de Comparação", v5.1.9); 'metas/acompanhamento'
  // = VER o Acompanhamento (liderança). A página de Acompanhamento faz OR das duas; o Cadastro e
  // a RPC de escrita exigem só 'metas'. RÓTULOS renomeados na v5.1.9 (CHAVES intocadas) para
  // "Metas/Cadastro" e "Metas/Acompanhamento" — aqui é só fallback; o rótulo vivo vem de
  // app.rbac_areas (migration 0184; UPDATE de dado = destrutivo, aplicado pelo humano).
  'metas':                   { rotulo: 'Metas/Cadastro',            grupo: 'Geral',         ordem: 40 },
  'metas/acompanhamento':    { rotulo: 'Metas/Acompanhamento',      grupo: 'Geral',         ordem: 41 },
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
  // Documentação da API externa (v5.4.0/Round4, pedido do Yan 30/07): área PRÓPRIA
  // (antes a página vivia gated pela gestão 'solicitacoes'). Rótulo/grupo/ordem aqui
  // são FALLBACK — a migration paralela insere a mesma linha em app.rbac_areas.
  'solicitacoes/documentacao': { rotulo: 'Solicitações (documentação)', grupo: 'Solicitações', ordem: 55 },
  // API Externa (v6.1.1/M3, migration 0289): área PRÓPRIA da gestão da API — chaves (inclusive as
  // das RPAs de ingestão), log de chamadas e tipos expostos. Antes vivia sob a gestão
  // 'solicitacoes'; desde a v6.1.0 a API também emite as chaves das RPAs, então deixou de ser
  // "coisa de Solicitações". Grupo 'Administração' (não 'Solicitações'): rpc-contrato.test.ts
  // exige que a role de máquina tenha exatamente as áreas FORA desse grupo, e a máquina não
  // administra chaves. A migration concedeu a área a toda role que tinha 'solicitacoes'.
  'api-externa':             { rotulo: 'API Externa',               grupo: 'Administração', ordem: 56 },
  // Gestão de Pessoas · Inventário de Ativos (v5.6.0/M1, migration 0247). Permissão ÚNICA
  // de página: quem edita a página cadastra e movimenta — sem dois níveis, ao contrário de
  // Acervo/Metas/Solicitações. Grupo próprio no editor de roles. Gate inicial APERTADO no
  // seed (só quem já tinha 'admin/acessos'); o admin libera os demais pelo editor.
  'gestao-pessoas/inventario': { rotulo: 'Inventário de Ativos', grupo: 'Gestão de Pessoas', ordem: 60 },
  // Gestão de Pessoas · Estante Welcome (v5.11.0, migration 0271). DOIS níveis, molde de
  // Acervo/Solicitações: 'gestao-pessoas/estante' = ver a estante e registrar que pegou ou
  // devolveu; '/gestao' = o catálogo (incluir/editar/excluir livro) e devolver em nome de
  // outra pessoa — e INCLUI a de uso, porque a página faz OR das duas. Gate inicial
  // apertado no seed (só quem já tinha 'admin/acessos').
  'gestao-pessoas/estante':        { rotulo: 'Estante Welcome',          grupo: 'Gestão de Pessoas', ordem: 61 },
  'gestao-pessoas/estante/gestao': { rotulo: 'Estante Welcome (gestão)', grupo: 'Gestão de Pessoas', ordem: 62 },
  // Marketing · Gastos (v6.3.0/M3, migration 0292). Permissão ÚNICA de página (só leitura dos
  // lançamentos pagos do bloco MKT da DRE de caixa). Grupo NOVO 'Marketing' — fora de
  // 'Administração', então a role de máquina de verificação a recebe (rpc-contrato.test.ts exige
  // TODA área fora desse grupo). A migration concede, por nome, a Administrador, Financeiro e
  // 'Máquina · verificação'; qualquer outra role recebe pelo editor de roles.
  'marketing/gastos':              { rotulo: 'Gastos',                   grupo: 'Marketing',         ordem: 70 },
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
  if (p.startsWith('/financeiro/dre'))          return ['financeiro/dre']
  if (p.startsWith('/financeiro'))              return ['financeiro/fluxo-caixa', 'financeiro/gerencial']
  if (p.startsWith('/executiva'))               return ['executiva']
  // Metas em DOIS níveis (v5.0.0): /metas/cadastro exige a área forte 'metas' (editar);
  // o Acompanhamento (/metas e /metas/acompanhamento) libera com qualquer uma das duas.
  if (p.startsWith('/metas/cadastro'))          return ['metas']
  if (p.startsWith('/metas'))                   return ['metas/acompanhamento', 'metas']
  // Gestão de Pessoas tem DOIS módulos desde a v5.11.0: a regra genérica que existia aqui
  // mandava /gestao-pessoas inteiro para o Inventário, o que faria a Estante nascer gated
  // pela área errada (usuário só de Estante cairia em /sem-acesso). Específicas primeiro.
  if (p.startsWith('/gestao-pessoas/estante'))    return ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']
  if (p.startsWith('/gestao-pessoas/inventario')) return ['gestao-pessoas/inventario']
  // Raiz da seção (só o item-pai da sidebar; não há página em /gestao-pessoas): qualquer
  // módulo da seção libera.
  if (p.startsWith('/gestao-pessoas'))            return ['gestao-pessoas/inventario', 'gestao-pessoas/estante', 'gestao-pessoas/estante/gestao']
  // Marketing (v6.3.0, GATE 1 — mockup): PROVISORIAMENTE sob 'admin/design-system'. A área
  // própria 'marketing/gastos' nasce na M3 com a migration que a insere em `app.rbac_areas`;
  // declará-la antes, só no código, quebraria a paridade banco↔app (precedente: Inventário,
  // v5.6.0). Cobre /marketing (item-pai da sidebar, sem página) e /marketing/gastos.
  if (p.startsWith('/marketing'))                 return ['admin/design-system']
  if (p.startsWith('/admin/design-system'))     return ['admin/design-system']
  if (p.startsWith('/admin/acessos'))           return ['admin/acessos']
  // /admin/uploads* é rota LEGADA desde a v6.1.1 (só redirect para /admin/ingestao/upload);
  // segue mapeada porque o guard do layout e o proxy ainda a atravessam antes do redirect.
  if (p.startsWith('/admin/uploads'))           return ['admin/uploads']
  // Ingestão de Dados (v6.0.0/M6 → v6.1.1): Log de Ingestão (/admin/ingestao) e Upload de
  // Arquivos (/admin/ingestao/upload) — mesma área de quem carrega planilha, anexo §7 ("as mesmas
  // pessoas que carregam são as que precisam ver o log"). O prefixo cobre as duas. Casa ANTES
  // do genérico '/admin' abaixo, senão cairia em 'admin/acessos'.
  if (p.startsWith('/admin/ingestao'))          return ['admin/uploads']
  if (p.startsWith('/admin/solicitacoes'))      return ['solicitacoes']
  // Documentação da API externa (v5.4.0/Round4, pedido do Yan 30/07): área PRÓPRIA
  // 'solicitacoes/documentacao' (leitor/integrador) OU, desde a v6.1.1, a gestão 'api-externa'
  // (antes era a gestão 'solicitacoes'). Esta regra casa ANTES da genérica
  // '/admin/api-externa' logo abaixo — senão a genérica (mais curta) casaria primeiro e a
  // página nunca veria a área específica. Ordem ['api-externa', 'solicitacoes/documentacao']
  // espelha o gate do banco (solic_tipos_documentacao, 0289).
  if (p.startsWith('/admin/api-externa/documentacao')) return ['api-externa', 'solicitacoes/documentacao']
  // Chaves de API (v5.4.0/M2 → v6.1.1/M3): área PRÓPRIA 'api-externa' (migration 0289). Grupo
  // "API Externa" da sidebar (Configuração + Documentação); casa ANTES do genérico '/admin' abaixo.
  if (p.startsWith('/admin/api-externa'))        return ['api-externa']
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
  { area: 'admin/uploads',           href: '/admin/ingestao/upload' },
  // v6.1.1/M3: área de Administração com entrada própria na sidebar, como as vizinhas — sem
  // isto, quem tem SÓ 'api-externa' cairia em /sem-acesso ao entrar pela raiz.
  { area: 'api-externa',             href: '/admin/api-externa' },
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
