'use client'

import { useMemo, useState } from 'react'
import { Loader2, Trash2, X } from 'lucide-react'
import { AREA_ADMIN } from '@/lib/auth/areas'
import { atualizarRole, criarRole, excluirRole } from '@/app/admin/acessos/actions'
import Checkbox from '@/components/ui/checkbox'
import type { AreaCatalogo, RoleAdmin } from './tipos'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from './botoes'

// v4.13 — formulário de permissão/perfil (criar/editar): nome, descrição e
// checkboxes de áreas agrupadas (Geral/Performance/Financeiro/Administração).
// Marcar admin/acessos exibe um aviso (meta-permissão). Excluir só habilita com
// n_usuarios === 0 (o banco também bloqueia: ROLE_EM_USO). Botões em pill.

const INPUT_CLASSES =
  'foco-neutro w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition'

interface GrupoAreas {
  grupo: string
  itens: AreaCatalogo[]
}

export function ModalRole({
  modo,
  role,
  areas,
  onFechar,
  onSalvo,
}: {
  modo:     'criar' | 'editar'
  role?:    RoleAdmin
  areas:    AreaCatalogo[]
  onFechar: () => void
  onSalvo:  (mensagem: string) => void
}) {
  const [nome, setNome] = useState(role?.nome ?? '')
  const [descricao, setDescricao] = useState(role?.descricao ?? '')
  const [permissoes, setPermissoes] = useState<string[]>(role?.permissoes ?? [])
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Áreas agrupadas na ordem do catálogo (grupo aparece na ordem do 1º item).
  const grupos = useMemo<GrupoAreas[]>(() => {
    const resultado: GrupoAreas[] = []
    for (const area of [...areas].sort((a, b) => a.ordem - b.ordem)) {
      const grupo = resultado.find(g => g.grupo === area.grupo)
      if (grupo) grupo.itens.push(area)
      else resultado.push({ grupo: area.grupo, itens: [area] })
    }
    return resultado
  }, [areas])

  const ocupado = salvando || excluindo
  const podeExcluir = modo === 'editar' && role !== undefined && role.n_usuarios === 0

  function togglePermissao(area: string) {
    setPermissoes(prev =>
      prev.includes(area) ? prev.filter(p => p !== area) : [...prev, area],
    )
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    if (!nome.trim()) {
      setErro('Informe o nome da permissão.')
      return
    }
    setSalvando(true)
    const res = modo === 'editar' && role
      ? await atualizarRole({ id: role.id, nome, descricao, permissoes })
      : await criarRole({ nome, descricao, permissoes })
    setSalvando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    onSalvo(modo === 'criar' ? `Permissão «${nome.trim()}» criada.` : `Permissão «${nome.trim()}» atualizada.`)
  }

  async function handleExcluir() {
    if (!role) return
    if (!window.confirm(`Excluir a permissão «${role.nome}»? Esta ação não pode ser desfeita.`)) return
    setErro(null)
    setExcluindo(true)
    const res = await excluirRole(role.id)
    setExcluindo(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    onSalvo(`Permissão «${role.nome}» excluída.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onFechar} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-role"
        className="relative w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between mb-4">
          <h3 id="titulo-role" className="text-base font-semibold text-zinc-900">
            {modo === 'criar' ? 'Nova permissão' : `Editar permissão «${role?.nome}»`}
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="role-nome" className="block text-xs font-medium text-zinc-600 mb-1">
              Nome <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="role-nome"
              type="text"
              required
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex.: Gestora Weddings"
              className={INPUT_CLASSES}
            />
          </div>

          <div>
            <label htmlFor="role-descricao" className="block text-xs font-medium text-zinc-600 mb-1">
              Descrição
            </label>
            <textarea
              id="role-descricao"
              rows={2}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Para que serve esta permissão"
              className={`${INPUT_CLASSES} resize-none`}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-zinc-600 mb-2">Permissões</p>
            <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
              {grupos.map(({ grupo, itens }) => (
                <fieldset key={grupo}>
                  <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {grupo}
                  </legend>
                  <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {itens.map(area => (
                      <div key={area.area} className="flex items-center gap-2 text-sm text-zinc-700">
                        <Checkbox
                          id={`perm-${area.area}`}
                          checked={permissoes.includes(area.area)}
                          onChange={() => togglePermissao(area.area)}
                          aria-label={area.rotulo}
                        />
                        <label htmlFor={`perm-${area.area}`} className="cursor-pointer truncate">
                          {area.rotulo}
                        </label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>

          {permissoes.includes(AREA_ADMIN) && (
            <div
              role="alert"
              className="rounded-lg border px-3 py-2 text-xs"
              style={{ borderColor: 'var(--border-strong)', background: 'var(--surface-soft)', color: 'var(--text-secondary)' }}
            >
              <span className="font-semibold">Atenção:</span> esta permissão dá acesso à administração
              de usuários — quem a tiver pode criar, excluir e alterar permissões de qualquer pessoa.
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              {modo === 'editar' && role && (
                <button
                  type="button"
                  onClick={handleExcluir}
                  disabled={!podeExcluir || ocupado}
                  title={podeExcluir
                    ? 'Excluir esta permissão'
                    : 'Há usuários com esta permissão — reatribua-os antes de excluir.'}
                  className={`${PILL} ${PILL_PERIGO} disabled:cursor-not-allowed`}
                >
                  {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Excluir
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onFechar}
                disabled={ocupado}
                className={`${PILL} ${PILL_NEUTRO}`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={ocupado}
                className={`${PILL} ${PILL_PRIMARIA}`}
                style={PILL_PRIMARIA_STYLE}
              >
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {modo === 'criar' ? 'Criar permissão' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
