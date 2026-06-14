'use client'

import { useState } from 'react'
import { UserPlus, Plus } from 'lucide-react'
import type { AreaCatalogo, RoleAdmin, UsuarioAdmin, SolicitacaoAdmin } from './tipos'
import { AbaUsuarios } from './aba-usuarios'
import { AbaRoles } from './aba-roles'
import { AbaSolicitacoes } from './aba-solicitacoes'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from './botoes'
import { FaixaMensagem } from './faixa-mensagem'

// v4.13/v4.14 — conteúdo client da página Usuários & Acessos: header, pills de aba
// (Usuários / Roles / Solicitações) e delegação. Dados vêm prontos da page (RSC).
// v4.16.1 — pills migradas para PILL/PILL_NEUTRO/PILL_PRIMARIA (botoes.ts); faixa de
// erro migrada para FaixaMensagem (sem onFechar: erroCarga é prop RSC, não estado local).

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
  // v4.18/M4 — ação primária da aba ANCORADA na linha das pills (não dentro do box).
  const [criarUsuario, setCriarUsuario] = useState(false)
  const [criarPermissao, setCriarPermissao] = useState(false)
  const pendentes = solicitacoes.filter(s => s.status === 'pendente').length

  const ABAS: { key: Aba; label: string }[] = [
    { key: 'usuarios',     label: 'Usuários' },
    { key: 'roles',        label: 'Permissões' },
    { key: 'solicitacoes', label: pendentes > 0 ? `Solicitações de acesso (${pendentes})` : 'Solicitações de acesso' },
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
        // sem onFechar: erroCarga é prop vinda do servidor (RSC), não estado local
        <FaixaMensagem tipo="erro" texto={erroCarga} />
      )}

      {/* Linha das pills: abas à esquerda, AÇÃO PRIMÁRIA da aba à direita (v4.18/M4). */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div role="tablist" aria-label="Seções de administração de acessos" className="flex gap-2">
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
                className={`${PILL} whitespace-nowrap ${ativa ? PILL_PRIMARIA : PILL_NEUTRO}`}
                style={ativa ? PILL_PRIMARIA_STYLE : undefined}
              >
                {label}
              </button>
            )
          })}
        </div>
        {aba === 'usuarios' && (
          <button type="button" onClick={() => setCriarUsuario(true)}
            className={`${PILL} ${PILL_PRIMARIA} whitespace-nowrap`} style={PILL_PRIMARIA_STYLE}>
            <UserPlus size={13} /> Criar usuário
          </button>
        )}
        {aba === 'roles' && (
          <button type="button" onClick={() => setCriarPermissao(true)}
            className={`${PILL} ${PILL_PRIMARIA} whitespace-nowrap`} style={PILL_PRIMARIA_STYLE}>
            <Plus size={13} /> Nova permissão
          </button>
        )}
      </div>

      <div role="tabpanel" id={`painel-${aba}`} aria-labelledby={`tab-${aba}`}>
        {aba === 'usuarios'     && <AbaUsuarios usuarios={usuarios} roles={roles} meuUserId={meuUserId} criarAberto={criarUsuario} onFecharCriar={() => setCriarUsuario(false)} />}
        {aba === 'roles'        && <AbaRoles roles={roles} areas={areas} criarAberto={criarPermissao} onFecharCriar={() => setCriarPermissao(false)} />}
        {aba === 'solicitacoes' && <AbaSolicitacoes solicitacoes={solicitacoes} roles={roles} />}
      </div>
    </div>
  )
}
