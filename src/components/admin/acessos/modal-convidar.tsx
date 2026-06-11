'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2, X } from 'lucide-react'
import { criarUsuario } from '@/app/admin/acessos/actions'
import type { RoleAdmin } from './tipos'

// v4.14 — modal de criar usuário: email + nome (opcional) + role. Em sucesso,
// mostra a SENHA PROVISÓRIA copiável (a pessoa troca no 1º acesso). Sem e-mail
// (independe de SMTP). O componente segue exportado como ModalConvidar.

const INPUT_CLASSES =
  'foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition'

interface Sucesso {
  email: string
  senha: string
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
    const res = await criarUsuario({ email, nome: nome.trim() || undefined, roleId: idRole })
    setEnviando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    setSucesso({ email: res.email, senha: res.senha })
    router.refresh()
  }

  async function handleCopiar() {
    if (!sucesso) return
    try {
      await navigator.clipboard.writeText(sucesso.senha)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Não foi possível copiar automaticamente — selecione a senha e copie manualmente.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-criar"
        className="relative w-full max-w-md mx-4 rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 id="titulo-criar" className="text-base font-semibold text-zinc-900">
            Criar usuário
          </h3>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="foco-neutro rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
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
              <label htmlFor="criar-email" className="block text-xs font-medium text-zinc-600 mb-1">
                E-mail <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <input
                id="criar-email" type="email" required autoFocus value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="pessoa@welcometrips.com.br" className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label htmlFor="criar-nome" className="block text-xs font-medium text-zinc-600 mb-1">
                Nome <span className="text-zinc-400 font-normal">(opcional)</span>
              </label>
              <input
                id="criar-nome" type="text" value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Nome da pessoa" className={INPUT_CLASSES}
              />
            </div>
            <div>
              <label htmlFor="criar-role" className="block text-xs font-medium text-zinc-600 mb-1">
                Role <span className="text-red-500" aria-hidden="true">*</span>
              </label>
              <select
                id="criar-role" required value={roleId}
                onChange={e => setRoleId(e.target.value)} className={INPUT_CLASSES}
              >
                <option value="" disabled>Selecione uma role…</option>
                {roles.map(r => (
                  <option key={r.id} value={String(r.id)}>{r.nome}</option>
                ))}
              </select>
              {roles.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Nenhuma role cadastrada — crie uma na aba «Roles» antes de criar usuários.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button
                type="button" onClick={onFechar}
                className="foco-neutro rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={enviando || roles.length === 0}
                className="foco-neutro flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:opacity-50"
                style={{ background: 'var(--action-primary)', color: '#fff' }}
              >
                {enviando && <Loader2 size={14} className="animate-spin" />}
                {enviando ? 'Criando…' : 'Criar usuário'}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Usuário <span className="font-medium">{sucesso.email}</span> criado.
            </div>

            <div>
              <label htmlFor="criar-senha" className="block text-xs font-medium text-zinc-600 mb-1">
                Senha provisória (repasse para a pessoa)
              </label>
              <div className="flex gap-2">
                <input
                  id="criar-senha" type="text" readOnly value={sucesso.senha}
                  onFocus={e => e.target.select()}
                  className="foco-neutro w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-mono text-zinc-700 outline-none"
                />
                <button
                  type="button" onClick={handleCopiar}
                  className="foco-neutro flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition hover:opacity-90"
                  style={{ background: 'var(--action-primary)', color: '#fff' }}
                >
                  {copiado ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                </button>
              </div>
            </div>

            <p className="text-xs text-zinc-400">
              A pessoa entra com o e-mail e esta senha, e será obrigada a definir uma nova no primeiro acesso.
              Esta senha não será mostrada de novo — se perder, use «Resetar senha».
            </p>

            <div className="flex justify-end">
              <button
                type="button" onClick={onFechar}
                className="foco-neutro rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90"
                style={{ background: 'var(--action-primary)', color: '#fff' }}
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
