// Modelo da NAVEGAÇÃO RAIZ — dados e regras puras, sem render.
//
// Extraído de `sidebar.tsx` na v5.6.0/M2. Motivo: a invariante 12 do briefing ("mexer na
// navegação raiz afeta TODAS as páginas", lição da v3.2) pedia um checklist de regressão a
// cada rota existente. Checklist em prosa envelhece; enquanto o modelo morava dentro de um
// componente `'use client'` que importa `next/image`/`next/link`, nenhum teste do ambiente
// `node` conseguia lê-lo. Separando o QUE aparece (aqui) do COMO aparece (sidebar/nav-group),
// a varredura virou `nav-model.test.ts` — mecânica e reexecutável em todas as versões futuras.
//
// Comportamento PRESERVADO na íntegra: as listas e os predicados são os mesmos, movidos sem
// alteração. Quem renderiza continua sendo `sidebar.tsx` (1º nível) e `nav-group.tsx` (subabas).

import {
  LayoutDashboard, TrendingUp, Target, Upload, Building, Plane, Sparkles, Briefcase, Wallet,
  BarChart3, Table2, Calculator, Receipt, Library, Users, IdCard, Boxes, Palette, Inbox,
  LineChart, ClipboardList, FileSpreadsheet, BookOpen, ScrollText, DatabaseZap, KeyRound, Plug,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Area } from '@/lib/auth/areas'

/** Subaba de um grupo da sidebar. */
export interface NavSubItem {
  href: string
  label: string
  icon: LucideIcon
  /** Área de permissão que libera o subitem. */
  area: Area
  /** Visível se o usuário tiver QUALQUER uma destas áreas (OR). v4.34.0. */
  areasAny?: Area[]
  /** Rota atrás do gate "em construção" (preview) → ícone triangular de alerta à direita. v5.1.9. */
  emConstrucao?: boolean
}

/** Item de 1º nível. */
export interface NavItem {
  href: string
  label: string
  Icon: LucideIcon
  /** Área que libera o item; null = grupo (visível se algum subitem for permitido). */
  area: Area | null
  /** Sempre visível para qualquer autenticado (não gated por área). v4.16.0. */
  sempre?: boolean
  /** Visível se o usuário tiver QUALQUER uma destas áreas (OR). v4.20.0. */
  areasAny?: Area[]
  /** Rota atrás do gate "em construção" (preview) → ícone triangular de alerta à direita. v5.1.9. */
  emConstrucao?: boolean
}

const PERFORMANCE_SUBS: NavSubItem[] = [
  { href: '/performance',             label: 'Geral',       icon: Building,  area: 'performance', emConstrucao: true },
  { href: '/performance/trips',       label: 'Trips',       icon: Plane,     area: 'performance/trips'       },
  { href: '/performance/weddings',    label: 'Weddings',    icon: Sparkles,  area: 'performance/weddings'    },
  { href: '/performance/corporativo', label: 'Corporativo', icon: Briefcase, area: 'performance/corporativo' },
]

const FINANCEIRO_SUBS: NavSubItem[] = [
  { href: '/financeiro/acervo',                label: 'Acervo de Documentos', icon: Library, area: 'financeiro/acervo', areasAny: ['financeiro/acervo', 'financeiro/acervo/gestao'] },
  { href: '/financeiro/dre',                   label: 'Demonstrativo de Resultado', icon: FileSpreadsheet, area: 'financeiro/dre' },
  { href: '/financeiro/fluxo-caixa',           label: 'Fluxo de Caixa',       icon: BarChart3,  area: 'financeiro/fluxo-caixa' },
  { href: '/financeiro/fluxo-caixa/gerencial', label: 'Gerencial',            icon: Table2,     area: 'financeiro/gerencial'   },
  { href: '/financeiro/calculadora-rateio',    label: 'Calculadora de Rateio', icon: Calculator, area: 'financeiro/gerencial'  },
  { href: '/financeiro/faturamento-corp',      label: 'Faturamento Corporativo', icon: Receipt,  area: 'financeiro/faturamento-corp' },
]

// Metas em DOIS níveis (v5.0.0), mesmo padrão de solicitacoes/acervo: 'metas' (edição,
// libera as duas subabas) e 'metas/acompanhamento' (só leitura, libera só a 1ª).
const METAS_SUBS: NavSubItem[] = [
  { href: '/metas',          label: 'Acompanhamento', icon: LineChart,     area: 'metas/acompanhamento', areasAny: ['metas/acompanhamento', 'metas'] },
  { href: '/metas/cadastro', label: 'Cadastro',       icon: ClipboardList, area: 'metas' },
]

// Gestão de Pessoas (v5.6.0) — seção NOVA da sidebar; o Inventário de Ativos é seu 1º módulo.
// Área própria desde a migration 0247 (na M0 ficou sob 'admin/design-system', porque declarar
// a área nova sem a migration quebraria o teste de paridade banco↔app).
// O `emConstrucao` saiu na M3: a tela deixou o fixture e passou a ler as RPCs `patrimonio_*`.
const GESTAO_PESSOAS_SUBS: NavSubItem[] = [
  { href: '/gestao-pessoas/inventario', label: 'Inventário de Ativos', icon: Boxes, area: 'gestao-pessoas/inventario' },
  // v5.11.0 — 2º módulo da seção. `areasAny`: a área de gestão INCLUI a de uso, então
  // qualquer uma das duas faz o item aparecer.
  { href: '/gestao-pessoas/estante', label: 'Estante Welcome', icon: BookOpen, area: 'gestao-pessoas/estante', areasAny: ['gestao-pessoas/estante', 'gestao-pessoas/estante/gestao'] },
]

// Ingestão de Dados (v6.1.1) — Upload de Arquivos e Log de Ingestão viraram subabas de um
// grupo só (antes eram dois itens soltos). A subaba "Log de Ingestão" tem o MESMO href do
// pai (`/admin/ingestao`), como "Geral" em PERFORMANCE_SUBS; o Upload mora em
// `/admin/ingestao/upload`. Quando o pathname é o do Upload, os dois hrefs casam por prefixo
// e `hrefAtivoDoGrupo` escolhe o mais longo (o Upload) — o Log só acende em `/admin/ingestao`.
// Mesma área nas duas ('admin/uploads'): as pessoas que carregam planilha são as que veem o log.
const INGESTAO_SUBS: NavSubItem[] = [
  { href: '/admin/ingestao/upload', label: 'Upload de Arquivos', icon: Upload,     area: 'admin/uploads' },
  { href: '/admin/ingestao',        label: 'Log de Ingestão',    icon: ScrollText, area: 'admin/uploads' },
]

// API Externa (v6.1.1/M3) — antes duas rotas soltas, alcançadas por atalhos dentro de Solicitações
// ("API externa" em Gerenciar solicitações; "Documentação API" na caixa de entrada). Desde a
// v6.1.0 a API também emite as chaves das RPAs de ingestão, então ganhou seção e área própria
// ('api-externa', migration 0289). A subaba "Chaves" tem o MESMO href do pai (`/admin/api-externa`),
// como o Log em INGESTAO_SUBS: em `/admin/api-externa/documentacao` os dois hrefs casam por prefixo
// e `hrefAtivoDoGrupo` escolhe o mais longo — a Documentação acende sozinha. A Documentação também
// libera para a área de leitura 'solicitacoes/documentacao' (integrador que só lê o contrato).
const API_EXTERNA_SUBS: NavSubItem[] = [
  { href: '/admin/api-externa',              label: 'Chaves',       icon: KeyRound, area: 'api-externa' },
  { href: '/admin/api-externa/documentacao', label: 'Documentação', icon: BookOpen, area: 'solicitacoes/documentacao', areasAny: ['api-externa', 'solicitacoes/documentacao'] },
]

/** Grupos com subabas — chave = href do item-pai em NAV_ITEMS. Único ponto que precisa
 *  saber "isto é um grupo" (o resto do render/filtro é genérico via NavGroup). */
export const NAV_GROUPS: Record<string, NavSubItem[]> = {
  '/performance':    PERFORMANCE_SUBS,
  '/financeiro':     FINANCEIRO_SUBS,
  '/metas':          METAS_SUBS,
  '/gestao-pessoas': GESTAO_PESSOAS_SUBS,
  '/admin/ingestao': INGESTAO_SUBS,
  '/admin/api-externa': API_EXTERNA_SUBS,
}

// Ordem da sidebar (v6.1.1): Executiva › Performance › Metas › Financeiro › Gestão de
// Pessoas › Solicitações › Ingestão de Dados (Upload de Arquivos, Log de Ingestão) ›
// API Externa (Chaves, Documentação) › Usuários e Acessos › Design System.
// (v5.1.9: Metas subiu p/ cima de Financeiro; Solicitações subiu p/ cima de Upload de
// Arquivos. v5.6.0: Gestão de Pessoas entrou entre Solicitações e o bloco administrativo;
// v5.6.1: subiu para logo abaixo de Financeiro, pedido do Yan. v6.1.1: Upload e Log de
// Ingestão viraram o grupo "Ingestão de Dados"; "API Externa" ganhou seção própria logo
// depois dele.)
export const NAV_ITEMS: NavItem[] = [
  { href: '/executiva',      label: 'Executiva',          Icon: LayoutDashboard, area: 'executiva', emConstrucao: true },
  { href: '/performance',    label: 'Performance',        Icon: TrendingUp,      area: null            },
  { href: '/metas',          label: 'Metas',              Icon: Target,          area: null            },
  { href: '/financeiro',     label: 'Financeiro',         Icon: Wallet,          area: null            },
  // Seção da v5.6.0, desde a v5.6.1 logo abaixo de Financeiro.
  // Ícone `IdCard` (crachá), NÃO `Users`/`UsersRound`: o `Users` já é "Usuários e Acessos" e as
  // variantes redondas são quase indistinguíveis dele no tamanho 16px da sidebar (ajuste pedido
  // pelo Yan na aprovação da M0). O crachá também separa os conceitos: pessoa da empresa aqui,
  // conta da plataforma lá.
  { href: '/gestao-pessoas', label: 'Gestão de Pessoas',  Icon: IdCard,          area: null            },
  { href: '/solicitacoes',   label: 'Solicitações',       Icon: Inbox,           area: null, areasAny: ['solicitacoes/basico', 'solicitacoes'] },
  // v6.1.1: grupo "Ingestão de Dados" — Upload de Arquivos + Log de Ingestão (v6.0.0/M6, mesma
  // área de quem já carrega planilha — anexo v6.0.0/M6 §7). Permissão vem das subabas.
  { href: '/admin/ingestao',       label: 'Ingestão de Dados',  Icon: DatabaseZap, area: null              },
  // v6.1.1/M3: grupo "API Externa" — Chaves + Documentação. Permissão vem das subabas
  // (área própria 'api-externa'; a Documentação também abre para 'solicitacoes/documentacao').
  { href: '/admin/api-externa',    label: 'API Externa',        Icon: Plug,        area: null              },
  { href: '/admin/acessos',       label: 'Usuários e Acessos', Icon: Users,         area: 'admin/acessos'        },
  // 'Tipos de solicitação' saiu da sidebar (v4.18/M5): acessível pelo botão âmbar
  // "Gerenciar solicitações" dentro de Solicitações (só admin). Rota /admin/solicitacoes intacta.
  { href: '/admin/design-system',  label: 'Design System',      Icon: Palette,       area: 'admin/design-system'  },
]

// ── Predicados puros de visibilidade e de item ativo ───────────────────────────────
// Movidos de dentro do `SidebarContent`/`NavGroup` sem alteração de comportamento.

/** Subaba visível para este conjunto de permissões (`areasAny` = OR; senão a `area`). */
export function subVisivel(sub: NavSubItem, permissoes: readonly string[]): boolean {
  return sub.areasAny
    ? sub.areasAny.some(a => permissoes.includes(a))
    : permissoes.includes(sub.area)
}

/** Itens de 1º nível visíveis: `sempre` > `areasAny` > grupo com alguma subaba visível > `area`. */
export function itensVisiveis(permissoes: readonly string[]): NavItem[] {
  return NAV_ITEMS.filter(item => {
    if (item.sempre) return true
    if (item.areasAny) return item.areasAny.some(a => permissoes.includes(a))
    const grupo = NAV_GROUPS[item.href]
    if (grupo) return grupo.some(s => subVisivel(s, permissoes))
    return item.area !== null && permissoes.includes(item.area)
  })
}

/**
 * A subaba ATIVA de um grupo: o prefixo MAIS ESPECÍFICO (maior `href` primeiro) — cobre o
 * caso de uma sub-rota ser prefixo de outra (`financeiro/fluxo-caixa[/gerencial]`,
 * `metas[/cadastro]`) sem acender as duas juntas.
 */
export function hrefAtivoDoGrupo(subs: NavSubItem[], pathname: string): string | null {
  return subs
    .filter(s => pathname === s.href || pathname.startsWith(s.href + '/'))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null
}

/** Item de 1º nível SEM subabas está ativo por igualdade ou por prefixo de segmento. */
export function itemAtivo(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
