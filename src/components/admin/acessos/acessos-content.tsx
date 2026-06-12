'use client'

import { useState } from 'react'
import type { AreaCatalogo, RoleAdmin, UsuarioAdmin, SolicitacaoAdmin } from './tipos'
import { AbaUsuarios } from './aba-usuarios'
import { AbaRoles } from './aba-roles'
import { AbaSolicitacoes } from './aba-solicitacoes'
import { PILL_PRIMARIA_STYLE } from './botoes'

// v4.13/v4.14 — conteúdo client da página Usuários & Acessos: header, pills de aba
// (Usuários / Roles / Solicitações) e delegação. Dados vêm prontos da page (RSC).

const PILL_BASE =
  'foco-neutro px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap outline-none'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'

type Aba = 'usuarios' | 'roles' | 'solicitacoes'

export function AcessosContent({
  usuarios,
  roles,
  areas,
  solicitacoes,
  meuUserId,
  erroCarga,
}: {
  usuarios:     UsuarioAdmin[]
  roles:        RoleAdmin[]
  areas:        AreaCatalogo[]
  solicitacoes: SolicitacaoAdmin[]
  meuUserId:    string | null
  erroCarga:    string | null
}) {
  const [aba, setAba] = useState<Aba>('usuarios')
  const pendentes = solicitacoes.filter(s => s.status === 'pendente').length

  const ABAS: { key: Aba; label: string }[] = [
    { key: 'usuarios',     label: 'Usuários' },
    { key: 'roles',        label: 'Permissões' },
    { key: 'solicitacoes', label: pendentes > 0 ? `Solicitações (${pendentes})` : 'Solicitações' },
  ]

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Usuários e Acessos</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Crie usuários, atribua permissões, modere solicitações e controle o que cada pessoa pode ver
        </p>
      </div>

      {erroCarga && (
        <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {erroCarga}
        </div>
      )}

      <div role="tablist" aria-label="Seções de administração de acessos" className="flex gap-2 mb-5">
        {ABAS.map(({ key, label }) => {
          const ativa = aba === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={ativa}
              aria-controls={`painel-${key}`}
              onClick={() => setAba(key)}
              className={`${PILL_BASE} ${ativa ? '' : PILL_INACTIVE}`}
              style={ativa ? PILL_PRIMARIA_STYLE : undefined}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`tab-${aba}`}>
        {aba === 'usuarios'     && <AbaUsuarios usuarios={usuarios} roles={roles} meuUserId={meuUserId} />}
        {aba === 'roles'        && <AbaRoles roles={roles} areas={areas} />}
        {aba === 'solicitacoes' && <AbaSolicitacoes solicitacoes={solicitacoes} roles={roles} />}
      </div>
    </div>
  )
}
