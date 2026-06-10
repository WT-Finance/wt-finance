'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { convidarUsuario } from '@/app/admin/acessos/actions'
import type { RoleAdmin } from './tipos'

// v4.13 — modal de convite: email + nome (opcional) + role. Em sucesso, mostra
// o link de convite copiável (o e-mail pode ou não ter sido enviado pelo SMTP).

const OURO = '#BD965C'

const INPUT_CLASSES =
  'w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ' +
  'focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition'

interface Sucesso {
  email:       string
  linkConvite: string | null
}

export function ModalConvidar({
  roles,
  onFechar,
}: {
  roles:    RoleAdmin[]
  onFechar: () => void
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [roleId, setRoleId] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<Sucesso | null>(null)
  const [copiado, setCopiado] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    const idRole = Number(roleId)
    if (!idRole) {
      setErro('Selecione uma role para o novo usuário.')
      return
    }
    setEnviando(true)
    const res = await convidarUsuario({ email, nome: nome.trim() || undefined, roleId: idRole })
    setEnviando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    setSucesso({ email: email.trim().toLowerCase(), linkConvite: res.linkConvite })
    router.refresh()
  }

  async function handleCopiar() {
    if (!sucesso?.linkConvite) return
    try {
      await navigator.clipboard.writeText(sucesso.linkConvite)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar automaticamente — selecione o link e copie manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-convidar"
        className="relative w-full max-w-md mx-4 rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 id="titulo-convidar" className="text-base font-semibold text-zinc-900">
            Convidar usuário
          </h3>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {erro && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        {!sucesso ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="convite-email" className="block text-xs font-medium text-zinc-600 mb-1">
                E-mail <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="convite-email"
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="pessoa@welcometrips.com.br"
                className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label htmlFor="convite-nome" className="block text-xs font-medium text-zinc-600 mb-1">
                Nome <span className="text-zinc-400 font-normal">(opcional)</span>
              </label>
              <input
                id="convite-nome"
                type="text"
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome da pessoa"
                className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label htmlFor="convite-role" className="block text-xs font-medium text-zinc-600 mb-1">
                Role <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="convite-role"
                required
                value={roleId}
                onChange={e => setRoleId(e.target.value)}
                className={INPUT_CLASSES}
              >
                <option value="" disabled>Selecione uma role…</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.nome}</option>
                ))}
              </select>
              {roles.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Nenhuma role cadastrada — crie uma na aba «Roles» antes de convidar.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button"
                onClick={onFechar}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={enviando || roles.length === 0}
                className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: OURO }}
              >
                {enviando && <Loader2 size={14} className="animate-spin" />}
                {enviando ? 'Convidando…' : 'Convidar'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Convite registrado para <span className="font-medium">{sucesso.email}</span>.
            </div>

            {sucesso.linkConvite && (
              <div>
                <label htmlFor="convite-link" className="block text-xs font-medium text-zinc-600 mb-1">
                  Link de convite (compartilhe com a pessoa)
                </label>
                <div className="flex gap-2">
                  <input
                    id="convite-link"
                    type="text"
                    readOnly
                    value={sucesso.linkConvite}
                    onFocus={e => e.target.select()}
                    className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20"
                  />
                  <button
                    type="button"
                    onClick={handleCopiar}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    {copiado
                      ? <><Check size={14} className="text-emerald-600" /> Copiado</>
                      : <><Copy size={14} /> Copiar</>}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-zinc-400">
              O convite também foi enviado por e-mail, se o envio estiver disponível.
            </p>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onFechar}
                className="rounded-lg px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
                style={{ background: OURO }}
              >
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
