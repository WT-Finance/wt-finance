'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { atribuirRole, definirAtivo } from '@/app/admin/acessos/actions'
import type { RoleAdmin, UsuarioAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'
import { ModalConvidar } from './modal-convidar'

// v4.13 — aba Usuários: tabela com role inline (select otimista), status,
// último acesso e desativar/reativar. Convite via modal (botão primário dourado).

const OURO = '#BD965C'

const SELECT_CLASSES =
  'w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 ' +
  'outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition disabled:opacity-50'

function fmtDataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function BadgeStatus({ usuario }: { usuario: UsuarioAdmin }) {
  // Desativado prevalece; convite pendente = nunca logou.
  const { classes, rotulo } = !usuario.ativo
    ? { classes: 'border-zinc-200 bg-zinc-100 text-zinc-500',   rotulo: 'Desativado' }
    : usuario.convite_pendente
      ? { classes: 'border-amber-200 bg-amber-50 text-amber-700', rotulo: 'Convite pendente' }
      : { classes: 'border-emerald-200 bg-emerald-50 text-emerald-700', rotulo: 'Ativo' }

  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${classes}`}>
      {rotulo}
    </span>
  )
}

interface Mensagem { tipo: 'sucesso' | 'erro'; texto: string }

export function AbaUsuarios({
  usuarios,
  roles,
  meuUserId,
}: {
  usuarios:  UsuarioAdmin[]
  roles:     RoleAdmin[]
  meuUserId: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [msg, setMsg] = useState<Mensagem | null>(null)
  const [modalAberto, setModalAberto] = useState(false)
  // Override otimista do role por usuário; revertido se a action falhar.
  const [rolesOtimistas, setRolesOtimistas] = useState<Record<string, number>>({})
  const [rowPendente, setRowPendente] = useState<string | null>(null)

  function handleMudarRole(usuario: UsuarioAdmin, novoRoleId: number) {
    const atual = rolesOtimistas[usuario.user_id] ?? usuario.role_id
    if (!novoRoleId || novoRoleId === atual) return
    setMsg(null)
    setRolesOtimistas(prev => ({ ...prev, [usuario.user_id]: novoRoleId }))
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await atribuirRole(usuario.user_id, novoRoleId)
      if (!res.ok) {
        // Reverte o otimismo e mostra o erro traduzido pela action.
        setRolesOtimistas(prev => {
          const copia = { ...prev }
          delete copia[usuario.user_id]
          return copia
        })
        setMsg({ tipo: 'erro', texto: res.erro })
      } else {
        setMsg({ tipo: 'sucesso', texto: `Role de ${usuario.email} atualizada.` })
      }
      setRowPendente(null)
      router.refresh()
    })
  }

  function handleToggleAtivo(usuario: UsuarioAdmin) {
    const acao = usuario.ativo ? 'desativar o acesso de' : 'reativar o acesso de'
    if (!window.confirm(`Confirma ${acao} ${usuario.email}?`)) return
    setMsg(null)
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await definirAtivo(usuario.user_id, !usuario.ativo)
      setMsg(res.ok
        ? { tipo: 'sucesso', texto: usuario.ativo ? `${usuario.email} desativado.` : `${usuario.email} reativado.` }
        : { tipo: 'erro', texto: res.erro })
      setRowPendente(null)
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-zinc-500">
          {usuarios.length === 1 ? '1 usuário registrado' : `${usuarios.length} usuários registrados`}
        </p>
        <button
          type="button"
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 outline-none focus-visible:ring-2 focus-visible:ring-[#BD965C]/40"
          style={{ background: OURO }}
        >
          <UserPlus size={15} />
          Convidar usuário
        </button>
      </div>

      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left">
              <th scope="col" className="w-[32%] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Usuário</th>
              <th scope="col" className="w-[22%] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Role</th>
              <th scope="col" className="w-[16%] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Status</th>
              <th scope="col" className="w-[16%] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Último acesso</th>
              <th scope="col" className="w-[14%] px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(usuario => {
              const pendente = rowPendente === usuario.user_id
              const roleAtual = rolesOtimistas[usuario.user_id] ?? usuario.role_id
              const souEu = meuUserId !== null && usuario.user_id === meuUserId
              return (
                <tr key={usuario.user_id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-zinc-900 truncate">
                      {usuario.nome ?? usuario.email}
                      {souEu && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: OURO }}>
                          você
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{usuario.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <label htmlFor={`role-${usuario.user_id}`} className="sr-only">
                      Role de {usuario.email}
                    </label>
                    <select
                      id={`role-${usuario.user_id}`}
                      value={roleAtual != null ? String(roleAtual) : ''}
                      disabled={pendente}
                      onChange={e => handleMudarRole(usuario, Number(e.target.value))}
                      className={SELECT_CLASSES}
                    >
                      {roleAtual == null && <option value="" disabled>Sem role</option>}
                      {roles.map(r => (
                        <option key={r.id} value={String(r.id)}>{r.nome}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <BadgeStatus usuario={usuario} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="block truncate text-zinc-500">{fmtDataCurta(usuario.ultimo_login)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggleAtivo(usuario)}
                      disabled={pendente}
                      className={[
                        'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                        usuario.ativo
                          ? 'border-zinc-200 text-red-600 hover:border-red-200 hover:bg-red-50'
                          : 'border-zinc-200 text-emerald-700 hover:border-emerald-200 hover:bg-emerald-50',
                      ].join(' ')}
                    >
                      {pendente && <Loader2 size={12} className="animate-spin" />}
                      {usuario.ativo ? 'Desativar' : 'Reativar'}
                    </button>
                  </td>
                </tr>
              )
            })}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Nenhum usuário registrado ainda. Use «Convidar usuário» para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalConvidar roles={roles} onFechar={() => setModalAberto(false)} />
      )}
    </div>
  )
}
