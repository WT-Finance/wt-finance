'use client'

import { useState } from 'react'
import type { AreaCatalogo, RoleAdmin, UsuarioAdmin } from './tipos'
import { AbaUsuarios } from './aba-usuarios'
import { AbaRoles } from './aba-roles'

// v4.13 — conteúdo client da página Usuários & Acessos: header, pills de aba
// (Usuários / Roles) e delegação para as abas. Dados vêm prontos da page (RSC).

const OURO = '#BD965C'

const PILL_BASE =
  'px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors whitespace-nowrap ' +
  'outline-none focus-visible:ring-2 focus-visible:ring-[#BD965C]/20'
const PILL_INACTIVE = 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50'

type Aba = 'usuarios' | 'roles'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'usuarios', label: 'Usuários' },
  { key: 'roles',    label: 'Roles' },
]

export function AcessosContent({
  usuarios,
  roles,
  areas,
  meuUserId,
  erroCarga,
}: {
  usuarios:  UsuarioAdmin[]
  roles:     RoleAdmin[]
  areas:     AreaCatalogo[]
  meuUserId: string | null
  erroCarga: string | null
}) {
  const [aba, setAba] = useState<Aba>('usuarios')

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Usuários &amp; Acessos</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Convide usuários, atribua roles e controle o que cada pessoa pode ver
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
              style={ativa
                ? { background: 'rgba(189,150,92,0.10)', borderColor: OURO, color: '#1A1814' }
                : undefined}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`tab-${aba}`}>
        {aba === 'usuarios'
          ? <AbaUsuarios usuarios={usuarios} roles={roles} meuUserId={meuUserId} />
          : <AbaRoles roles={roles} areas={areas} />}
      </div>
    </div>
  )
}
