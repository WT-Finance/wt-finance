import { requireArea } from '@/lib/auth/sessao'
import { getServerClient } from '@/lib/supabase/server'
import { parseRpc, metasListarSchema } from '@/lib/schemas-rpc'
import { rpcMetas } from '@/lib/metas/rpc-metas'
import { SETOR_MARCA_COLORS } from '@/lib/config'
import CadastroGrade from '@/components/metas/cadastro-grade'

// Cadastro de Metas (v5.0.0) — grade anual 12 meses × 3 setores × [Meta VT, % Rec],
// com Group COMPUTADO (soma, read-only) e autosave por célula. Área forte 'metas'
// (edição). Navegação por ano via ?ano=YYYY (server re-fetch). Tema group.

interface SearchParams {
  ano?: string
}

// Setores na ordem de exibição (Trips/Weddings/Corporativo). id = dim_setor_macro.id
// (chave), display = rótulo, cor = identidade cross-setor. Group NÃO é cadastrável.
const SETORES = [
  { id: 1, nome: 'Lazer',       display: 'Trips',       cor: SETOR_MARCA_COLORS.Lazer },
  { id: 2, nome: 'Weddings',    display: 'Weddings',    cor: SETOR_MARCA_COLORS.Weddings },
  { id: 3, nome: 'Corporativo', display: 'Corporativo', cor: SETOR_MARCA_COLORS.Corporativo },
]

export default async function CadastroMetasPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireArea('metas')
  const sp = await searchParams
  const ano = Number(sp.ano) || new Date().getFullYear()

  const db = await getServerClient()
  const res = await rpcMetas(db, 'metas_listar', { p_ano: ano })
  const data = parseRpc(metasListarSchema, res, 'metas_listar')

  return (
    <div>
      <CadastroGrade
        ano={ano}
        setores={SETORES}
        metas={data?.metas ?? []}
        ultimaAlteracao={data?.ultima_alteracao ?? null}
      />
    </div>
  )
}
