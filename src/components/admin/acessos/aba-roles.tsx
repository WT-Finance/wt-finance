'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { AREA_ADMIN } from '@/lib/auth/areas'
import type { AreaCatalogo, RoleAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'
import { ModalRole } from './modal-role'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from './botoes'

// v4.13 — aba Permissões (antes "Roles"): cards de perfis com suas permissões
// (chips por rótulo) e formulário de criação/edição em modal. Botões em pill.

interface Mensagem { tipo: 'sucesso' | 'erro'; texto: string }

type EstadoModal =
  | { modo: 'criar' }
  | { modo: 'editar'; role: RoleAdmin }
  | null

export function AbaRoles({
  roles,
  areas,
}: {
  roles: RoleAdmin[]
  areas: AreaCatalogo[]
}) {
  const router = useRouter()
  const [modal, setModal] = useState<EstadoModal>(null)
  const [msg, setMsg] = useState<Mensagem | null>(null)

  const rotuloDe = (area: string) => areas.find(a => a.area === area)?.rotulo ?? area
  const ordemDe  = (area: string) => areas.find(a => a.area === area)?.ordem ?? 999

  function handleSalvo(texto: string) {
    setModal(null)
    setMsg({ tipo: 'sucesso', texto })
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-zinc-500">
          {roles.length === 1 ? '1 permissão cadastrada' : `${roles.length} permissões cadastradas`}
        </p>
        <button
          type="button"
          onClick={() => { setMsg(null); setModal({ modo: 'criar' }) }}
          className={`${PILL} ${PILL_PRIMARIA}`}
          style={PILL_PRIMARIA_STYLE}
        >
          <Plus size={13} />
          Nova permissão
        </button>
      </div>

      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map(role => {
          const permissoesOrdenadas = [...role.permissoes].sort((a, b) => ordemDe(a) - ordemDe(b))
          return (
            <div key={role.id} className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-sm font-semibold text-zinc-900 truncate">{role.nome}</h2>
                <button
                  type="button"
                  onClick={() => { setMsg(null); setModal({ modo: 'editar', role }) }}
                  className={`shrink-0 ${PILL} ${PILL_NEUTRO}`}
                  aria-label={`Editar permissão ${role.nome}`}
                >
                  <Pencil size={12} />
                  Editar
                </button>
              </div>

              {role.descricao && (
                <p className="text-xs text-zinc-500 mb-2">{role.descricao}</p>
              )}
              <p className="text-xs text-zinc-400 mb-3">
                {role.n_usuarios === 1 ? '1 usuário' : `${role.n_usuarios} usuários`}
              </p>

              <div className="mt-auto flex flex-wrap gap-1.5">
                {permissoesOrdenadas.length === 0 && (
                  <span className="text-xs text-zinc-400 italic">Sem permissões</span>
                )}
                {permissoesOrdenadas.map(p => (
                  <span
                    key={p}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                    title={p === AREA_ADMIN ? 'Dá acesso à administração de usuários' : undefined}
                  >
                    {rotuloDe(p)}
                  </span>
                ))}
              </div>
            </div>
          )
        })}

        {roles.length === 0 && (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-400">
            Nenhuma permissão cadastrada ainda. Crie a primeira com «Nova permissão».
          </div>
        )}
      </div>

      {modal && (
        <ModalRole
          modo={modal.modo}
          role={modal.modo === 'editar' ? modal.role : undefined}
          areas={areas}
          onFechar={() => setModal(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  )
}
