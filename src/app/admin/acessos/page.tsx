import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { AREAS, AREA_INFO } from '@/lib/auth/areas'
import { AcessosContent } from '@/components/admin/acessos/acessos-content'
import type { AreaCatalogo, RoleAdmin, UsuarioAdmin, SolicitacaoAdmin } from '@/components/admin/acessos/tipos'
import type { Json } from '@/types/database'

// v4.13 — Usuários & Acessos: busca inicial server-side (RPCs admin_* com o
// cliente de sessão — o banco valida o admin/acessos do chamador) e narrowing
// defensivo do jsonb antes de entregar aos componentes client.

type ObjJson = { [k: string]: Json | undefined }

function comoLista(data: Json | null): ObjJson[] {
  if (!Array.isArray(data)) return []
  return data.filter(
    (x): x is ObjJson => typeof x === 'object' && x !== null && !Array.isArray(x),
  )
}

export default async function AcessosPage() {
  const sessao = await requireArea('admin/acessos')
  const supabase = await getServerClient()

  const [usuariosRes, rolesRes, areasRes, solicitacoesRes] = await Promise.all([
    supabase.rpc('admin_listar_usuarios'),
    supabase.rpc('admin_listar_roles'),
    supabase.rpc('admin_listar_areas'),
    supabase.rpc('admin_listar_solicitacoes'),
  ])

  const erroCarga =
    usuariosRes.error?.message ?? rolesRes.error?.message ?? areasRes.error?.message ?? null

  const usuarios: UsuarioAdmin[] = comoLista(usuariosRes.data).map(u => ({
    user_id:          typeof u.user_id === 'string' ? u.user_id : '',
    email:            typeof u.email === 'string' ? u.email : '',
    nome:             typeof u.nome === 'string' ? u.nome : null,
    role_id:          typeof u.role_id === 'number' ? u.role_id : null,
    role:             typeof u.role === 'string' ? u.role : null,
    ativo:            u.ativo === true,
    criado_em:        typeof u.criado_em === 'string' ? u.criado_em : null,
    ultimo_login:     typeof u.ultimo_login === 'string' ? u.ultimo_login : null,
    convite_pendente: u.convite_pendente === true,
  })).filter(u => u.user_id !== '')

  const roles: RoleAdmin[] = comoLista(rolesRes.data).map(r => ({
    id:         typeof r.id === 'number' ? r.id : 0,
    nome:       typeof r.nome === 'string' ? r.nome : '',
    descricao:  typeof r.descricao === 'string' ? r.descricao : null,
    permissoes: Array.isArray(r.permissoes)
      ? r.permissoes.filter((p): p is string => typeof p === 'string')
      : [],
    n_usuarios: typeof r.n_usuarios === 'number' ? r.n_usuarios : 0,
  })).filter(r => r.id !== 0)

  const areasRpc: AreaCatalogo[] = comoLista(areasRes.data).map(a => ({
    area:   typeof a.area === 'string' ? a.area : '',
    rotulo: typeof a.rotulo === 'string' ? a.rotulo : '',
    grupo:  typeof a.grupo === 'string' ? a.grupo : '',
    ordem:  typeof a.ordem === 'number' ? a.ordem : 0,
  })).filter(a => a.area !== '')

  // Fallback: catálogo espelho local (paridade testada por contrato) mantém o
  // formulário de roles utilizável se a RPC de áreas falhar.
  const areas: AreaCatalogo[] = areasRpc.length > 0
    ? areasRpc
    : AREAS.map(a => ({ area: a, ...AREA_INFO[a] }))

  const STATUS_OK = new Set(['pendente', 'aprovada', 'rejeitada'])
  const solicitacoes: SolicitacaoAdmin[] = comoLista(solicitacoesRes.data).map(s => ({
    id:          typeof s.id === 'number' ? s.id : 0,
    email:       typeof s.email === 'string' ? s.email : '',
    nome:        typeof s.nome === 'string' ? s.nome : null,
    status:      (typeof s.status === 'string' && STATUS_OK.has(s.status) ? s.status : 'pendente') as SolicitacaoAdmin['status'],
    criado_em:   typeof s.criado_em === 'string' ? s.criado_em : null,
    decidido_em: typeof s.decidido_em === 'string' ? s.decidido_em : null,
    decidido_por_rotulo: typeof s.decidido_por_rotulo === 'string' ? s.decidido_por_rotulo : null,
    observacao:          typeof s.observacao === 'string' ? s.observacao : null,
  })).filter(s => s.id !== 0)

  return (
    <AcessosContent
      usuarios={usuarios}
      roles={roles}
      areas={areas}
      solicitacoes={solicitacoes}
      meuUserId={sessao.userId}
      erroCarga={erroCarga ? `Não foi possível carregar os dados de acessos: ${erroCarga}` : null}
    />
  )
}
