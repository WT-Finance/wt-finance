'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { AREA_ADMIN } from '@/lib/auth/areas'
import type { AreaCatalogo, RoleAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'
import { ModalRole } from './modal-role'

// v4.13 — aba Roles: cards com permissões (chips por rótulo) e formulário de
// criação/edição em modal. A meta-permissão admin/acessos é destacada em dourado.

const OURO = '#BD965C'

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
          {roles.length === 1 ? '1 role cadastrada' : `${roles.length} roles cadastradas`}
        </p>
        <button
          type="button"
          onClick={() => { setMsg(null); setModal({ modo: 'criar' }) }}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[#BD965C]/40"
          style={{ background: OURO }}
        >
          <Plus size={15} />
          Nova role
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
                  className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                  aria-label={`Editar role ${role.nome}`}
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
                {permissoesOrdenadas.map(p =>
                  p === AREA_ADMIN ? (
                    <span
                      key={p}
                      className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: 'rgba(189,150,92,0.15)', border: `1px solid ${OURO}`, color: '#1A1814' }}
                      title="Dá acesso à administração de usuários"
                    >
                      {rotuloDe(p)}
                    </span>
                  ) : (
                    <span key={p} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
                      {rotuloDe(p)}
                    </span>
                  ),
                )}
              </div>
            </div>
          )
        })}

        {roles.length === 0 && (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-400">
            Nenhuma role cadastrada ainda. Crie a primeira com «Nova role».
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
