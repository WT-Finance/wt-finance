'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2 } from 'lucide-react'
import { criarUsuario } from '@/app/admin/acessos/actions'
import type { RoleAdmin } from './tipos'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ModalCentral from '@/components/shared/modal-central'
import { Input, Select } from '@/components/ui/field'

// v4.14 — modal de criar usuário: email + nome (opcional) + role. Em sucesso,
// mostra a SENHA PROVISÓRIA copiável (a pessoa troca no 1º acesso). Sem e-mail
// (independe de SMTP). O componente segue exportado como ModalConvidar.
// v4.16.1 — migrado para ModalCentral (portal, Esc, scroll-lock, animação uniformes).

interface Sucesso {
  email: string
  senha: string
  emailEnviado: boolean
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
      setErro('Selecione uma permissão para o novo usuário.')
      return
    }
    setEnviando(true)
    const res = await criarUsuario({ email, nome: nome.trim() || undefined, roleId: idRole })
    setEnviando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    setSucesso({ email: res.email, senha: res.senha, emailEnviado: res.emailEnviado })
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
    <ModalCentral titulo="Criar usuário" onClose={onFechar}>
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      {!sucesso ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="criar-email" className="block text-xs font-medium text-zinc-600 mb-1">
              E-mail <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <Input
              id="criar-email" type="email" required autoFocus value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="pessoa@welcometrips.com.br"
            />
          </div>
          <div>
            <label htmlFor="criar-nome" className="block text-xs font-medium text-zinc-600 mb-1">
              Nome <span className="text-zinc-400 font-normal">(opcional)</span>
            </label>
            <Input
              id="criar-nome" type="text" value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Nome da pessoa"
            />
          </div>
          <div>
            <label htmlFor="criar-role" className="block text-xs font-medium text-zinc-600 mb-1">
              Permissão <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <Select
              id="criar-role" required value={roleId}
              onChange={e => setRoleId(e.target.value)}
            >
              <option value="" disabled>Selecione uma permissão…</option>
              {roles.map(r => (
                <option key={r.id} value={String(r.id)}>{r.nome}</option>
              ))}
            </Select>
            {roles.length === 0 && (
              <p className="mt-1 text-xs text-warning">
                Nenhuma permissão cadastrada — crie uma na aba «Permissões» antes de criar usuários.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button" onClick={onFechar}
              className={`${PILL} ${PILL_NEUTRO}`}
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={enviando || roles.length === 0}
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              {enviando && <Loader2 size={14} className="animate-spin" />}
              {enviando ? 'Criando…' : 'Criar usuário'}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div role="status" className="rounded-lg border border-success bg-success-bg px-3 py-2 text-sm text-success">
            Usuário <span className="font-medium">{sucesso.email}</span> criado.
          </div>

          {/* v4.24.0 — aviso de envio; a senha é exibida SEMPRE abaixo (fallback). */}
          {sucesso.emailEnviado ? (
            <div className="rounded-lg border border-success bg-success-bg px-3 py-2 text-xs text-success">
              A senha provisória foi enviada por e-mail para <span className="font-medium">{sucesso.email}</span>.
            </div>
          ) : (
            <div className="rounded-lg border border-warning bg-warning-bg px-3 py-2 text-xs text-warning">
              Não foi possível enviar o e-mail — copie a senha abaixo e repasse à pessoa.
            </div>
          )}

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
                className={`shrink-0 ${PILL} ${PILL_PRIMARIA}`}
                style={PILL_PRIMARIA_STYLE}
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
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </ModalCentral>
  )
}
