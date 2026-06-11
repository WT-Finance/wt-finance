'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus, KeyRound, Trash2, Copy, Check, X } from 'lucide-react'
import { atribuirRole, resetarSenha, excluirUsuario } from '@/app/admin/acessos/actions'
import type { RoleAdmin, UsuarioAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'
import { ModalConvidar } from './modal-convidar'
import ModalCentral from '@/components/shared/modal-central'

// v4.14.1 — aba Usuários: criar usuário (senha provisória), role inline, status,
// resetar senha e excluir (com confirmação em modal).

const SELECT_CLASSES =
  'foco-neutro w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 ' +
  'outline-none transition disabled:opacity-50'

const BTN_ACAO =
  'inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50'

function fmtDataCurta(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function BadgeStatus({ usuario }: { usuario: UsuarioAdmin }) {
  const { classes, rotulo } = !usuario.ativo
    ? { classes: 'border-zinc-200 bg-zinc-100 text-zinc-500',   rotulo: 'Desativado' }
    : usuario.convite_pendente
      ? { classes: 'border-amber-200 bg-amber-50 text-amber-700', rotulo: 'Aguardando 1º acesso' }
      : { classes: 'border-emerald-200 bg-emerald-50 text-emerald-700', rotulo: 'Ativo' }

  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${classes}`}>
      {rotulo}
    </span>
  )
}

interface Mensagem { tipo: 'sucesso' | 'erro'; texto: string }
// Senha provisória revelada após reset (mostrada uma vez ao admin).
interface Revelado { email: string; valor: string }

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
  const [rolesOtimistas, setRolesOtimistas] = useState<Record<string, number>>({})
  const [rowPendente, setRowPendente] = useState<string | null>(null)
  const [revelado, setRevelado] = useState<Revelado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState<UsuarioAdmin | null>(null)

  function handleMudarRole(usuario: UsuarioAdmin, novoRoleId: number) {
    const atual = rolesOtimistas[usuario.user_id] ?? usuario.role_id
    if (!novoRoleId || novoRoleId === atual) return
    setMsg(null)
    setRolesOtimistas(prev => ({ ...prev, [usuario.user_id]: novoRoleId }))
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await atribuirRole(usuario.user_id, novoRoleId)
      if (!res.ok) {
        setRolesOtimistas(prev => { const c = { ...prev }; delete c[usuario.user_id]; return c })
        setMsg({ tipo: 'erro', texto: res.erro })
      } else {
        setMsg({ tipo: 'sucesso', texto: `Role de ${usuario.email} atualizada.` })
      }
      setRowPendente(null)
      router.refresh()
    })
  }

  function handleResetarSenha(usuario: UsuarioAdmin) {
    if (!window.confirm(`Gerar uma NOVA senha provisória para ${usuario.email}? A senha atual deixa de valer.`)) return
    setMsg(null)
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await resetarSenha(usuario.user_id)
      if (res.ok) {
        setRevelado({ email: usuario.email, valor: res.senha })
        setCopiado(false)
        try { await navigator.clipboard.writeText(res.senha); setCopiado(true) } catch { /* painel copiável abaixo */ }
      } else {
        setMsg({ tipo: 'erro', texto: res.erro })
      }
      setRowPendente(null)
      router.refresh()
    })
  }

  function handleConfirmarExcluir(usuario: UsuarioAdmin) {
    setMsg(null)
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await excluirUsuario(usuario.user_id)
      if (res.ok) {
        setMsg({ tipo: 'sucesso', texto: `${usuario.email} excluído.` })
        if (revelado?.email === usuario.email) setRevelado(null)
      } else {
        setMsg({ tipo: 'erro', texto: res.erro })
      }
      setRowPendente(null)
      setConfirmarExcluir(null)
      router.refresh()
    })
  }

  async function copiarRevelado() {
    if (!revelado) return
    try {
      await navigator.clipboard.writeText(revelado.valor)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch { /* o campo já está selecionável */ }
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
          className="foco-neutro flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 outline-none"
          style={{ background: 'var(--action-primary)', color: '#fff' }}
        >
          <UserPlus size={15} />
          Criar usuário
        </button>
      </div>

      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      {revelado && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
          <p className="text-xs text-zinc-600 mb-2">
            Senha provisória de <span className="font-medium">{revelado.email}</span> — repasse à pessoa.
            Ela troca no próximo acesso. Não será mostrada de novo.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly value={revelado.valor} onFocus={e => e.currentTarget.select()}
              className="foco-neutro flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-mono text-zinc-600 outline-none"
            />
            <button
              type="button" onClick={copiarRevelado}
              className="foco-neutro inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium transition hover:opacity-90"
              style={{ background: 'var(--action-primary)', color: '#fff' }}
            >
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button
              type="button" onClick={() => setRevelado(null)} aria-label="Fechar"
              className="foco-neutro rounded-lg border border-zinc-200 p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[18%]" />
            <col className="w-[13%]" />
            <col className="w-[14%]" />
            <col className="w-[27%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left">
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Usuário</th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Role</th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Status</th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Último acesso</th>
              <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Ações</th>
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
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--action-primary)' }}>você</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">{usuario.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <label htmlFor={`role-${usuario.user_id}`} className="sr-only">Role de {usuario.email}</label>
                    <select
                      id={`role-${usuario.user_id}`}
                      value={roleAtual != null ? String(roleAtual) : ''}
                      disabled={pendente}
                      onChange={e => handleMudarRole(usuario, Number(e.target.value))}
                      className={SELECT_CLASSES}
                    >
                      {roleAtual == null && <option value="" disabled>Sem role</option>}
                      {roles.map(r => (<option key={r.id} value={String(r.id)}>{r.nome}</option>))}
                    </select>
                  </td>
                  <td className="px-4 py-3"><BadgeStatus usuario={usuario} /></td>
                  <td className="px-4 py-3">
                    <span className="block text-zinc-500">{fmtDataCurta(usuario.ultimo_login)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button" onClick={() => handleResetarSenha(usuario)} disabled={pendente}
                        title="Gerar nova senha provisória (a pessoa troca no próximo acesso)"
                        className={`foco-neutro ${BTN_ACAO} border-zinc-200 text-zinc-600 hover:bg-zinc-50`}
                      >
                        {pendente ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                        Senha
                      </button>
                      {!souEu && (
                        <button
                          type="button" onClick={() => setConfirmarExcluir(usuario)} disabled={pendente}
                          title="Excluir definitivamente (irreversível)"
                          className="foco-neutro inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-zinc-400 hover:text-red-600 transition disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-400">
                  Nenhum usuário registrado ainda. Use «Criar usuário» para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <ModalConvidar roles={roles} onFechar={() => setModalAberto(false)} />
      )}

      {confirmarExcluir && (
        <ModalCentral titulo="Excluir usuário" onClose={() => setConfirmarExcluir(null)}>
          <p className="text-sm text-zinc-600">
            Excluir definitivamente {confirmarExcluir.nome ?? confirmarExcluir.email} ({confirmarExcluir.email})?
            Esta ação não pode ser desfeita.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConfirmarExcluir(null)}
              className="foco-neutro rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleConfirmarExcluir(confirmarExcluir)}
              disabled={rowPendente === confirmarExcluir.user_id}
              className="foco-neutro inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {rowPendente === confirmarExcluir.user_id && <Loader2 size={14} className="animate-spin" />}
              Excluir
            </button>
          </div>
        </ModalCentral>
      )}
    </div>
  )
}
