'use client'

import { useMemo, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { AREA_ADMIN } from '@/lib/auth/areas'
import { atualizarRole, criarRole, excluirRole } from '@/app/admin/acessos/actions'
import Checkbox from '@/components/ui/checkbox'
import ConfirmModal from '@/components/shared/confirm-modal'
import ModalCentral from '@/components/shared/modal-central'
import type { AreaCatalogo, RoleAdmin } from './tipos'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from './botoes'
import { CAMPO } from '@/lib/ui/campos'

// v4.13 — formulário de permissão/perfil (criar/editar): nome, descrição e
// checkboxes de áreas agrupadas (Geral/Performance/Financeiro/Administração).
// Marcar admin/acessos exibe um aviso (meta-permissão). Excluir só habilita com
// n_usuarios === 0 (o banco também bloqueia: ROLE_EM_USO). Botões em pill.
// v4.16.1 — migrado para ModalCentral (Esc, scroll-lock, portal, animação);
// INPUT_CLASSES → CAMPO de @/lib/ui/campos; window.confirm → ConfirmModal.

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
  // ConfirmModal de exclusão — substitui window.confirm (v4.16.1).
  const [confirmandoExcluir, setConfirmandoExcluir] = useState(false)

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

  // Abre o ConfirmModal; a exclusão de fato ocorre em confirmarExcluir.
  function handleExcluir() {
    if (!role) return
    setConfirmandoExcluir(true)
  }

  async function confirmarExcluir() {
    if (!role) return
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
    <>
      <ModalCentral
        titulo={modo === 'criar' ? 'Nova permissão' : `Editar permissão «${role?.nome}»`}
        onClose={onFechar}
      >
        {erro && (
          <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="role-nome" className="block text-xs font-medium text-zinc-600 mb-1">
              Nome <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id="role-nome"
              type="text"
              required
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex.: Gestora Weddings"
              className={CAMPO}
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
              className={`${CAMPO} resize-none`}
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
      </ModalCentral>

      {/* Modal de confirmação da exclusão — substitui window.confirm. */}
      {confirmandoExcluir && role && (
        <ConfirmModal
          titulo="Excluir permissão"
          mensagem={`Excluir a permissão «${role.nome}»? Esta ação não pode ser desfeita.`}
          confirmarLabel="Excluir"
          onConfirmar={confirmarExcluir}
          onFechar={() => setConfirmandoExcluir(false)}
        />
      )}
    </>
  )
}
