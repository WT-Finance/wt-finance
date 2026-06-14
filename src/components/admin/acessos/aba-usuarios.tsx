'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, KeyRound, Trash2, Copy, Check, X, Pencil } from 'lucide-react'
import { atribuirRole, atualizarNome, resetarSenha, excluirUsuario } from '@/app/admin/acessos/actions'
import type { RoleAdmin, UsuarioAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'
import { ModalConvidar } from './modal-convidar'
import ModalCentral from '@/components/shared/modal-central'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from './botoes'
import { fmtDataHoraSP } from '@/lib/fmt'

/** Botão de ação da linha em ÍCONE (v4.18/M4). Compacto, com aria-label/title. */
const ICON_BTN = 'foco-neutro inline-flex items-center justify-center rounded-md border p-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const ICON_NEUTRO = 'border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700'
const ICON_PERIGO = 'border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300'

// v4.14.1 — aba Usuários: criar usuário (senha provisória), role inline, status,
// resetar senha e excluir (com confirmação em modal). Botões no formato pill (botoes.ts).
// v4.16.1 — migrado para CardTabela; window.confirm de reset substituído por ModalCentral;
//            aria-label no input de senha; title em truncados; otimista reconciliado;
//            isPending da transition usada para bloquear linha até refresh concluir.

interface Mensagem { tipo: 'sucesso' | 'erro'; texto: string }
// Senha provisória revelada após reset (mostrada uma vez ao admin).
interface Revelado { email: string; valor: string }

function BadgeStatus({ usuario }: { usuario: UsuarioAdmin }) {
  // Badges em tokens SEMÂNTICOS (v4.18/M4): verde success (Ativo), âmbar warning (Pendente).
  // "Aguardando 1º acesso" → "Pendente". Desativado fica neutro (capacidade já fora da UI).
  const { classes, rotulo } = !usuario.ativo
    ? { classes: 'border-zinc-200 bg-zinc-100 text-zinc-500', rotulo: 'Desativado' }
    : usuario.convite_pendente
      ? { classes: 'border-warning bg-warning-bg text-warning', rotulo: 'Pendente' }
      : { classes: 'border-success bg-success-bg text-success', rotulo: 'Ativo' }

  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${classes}`}>
      {rotulo}
    </span>
  )
}

export function AbaUsuarios({
  usuarios,
  roles,
  meuUserId,
  criarAberto,
  onFecharCriar,
}: {
  usuarios:  UsuarioAdmin[]
  roles:     RoleAdmin[]
  meuUserId: string | null
  criarAberto:   boolean        // v4.18/M4 — modal "Criar usuário" controlado pela linha das pills
  onFecharCriar: () => void
}) {
  const router = useRouter()
  // isPending mantido: bloqueia a linha até o RSC novo aplicar (o refresh dentro da
  // transition mantém isPending=true enquanto o servidor processa e entrega os novos dados).
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<Mensagem | null>(null)
  // rolesOtimistas: descartamos a entrada quando o dado do servidor já alcançou o
  // valor otimista (usuario.role_id === rolesOtimistas[id]), evitando que o valor
  // otimista sombree o servidor para sempre.
  const [rolesOtimistas, setRolesOtimistas] = useState<Record<string, number>>({})
  // rowPendente: id da linha cuja transition ainda está em voo.
  const [rowPendente, setRowPendente] = useState<string | null>(null)
  const [revelado, setRevelado] = useState<Revelado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmarExcluir, setConfirmarExcluir] = useState<UsuarioAdmin | null>(null)
  // Estado para confirmação de reset de senha (substitui window.confirm).
  const [confirmarReset, setConfirmarReset] = useState<UsuarioAdmin | null>(null)
  // Edição de nome (v4.18/M4): modal com input controlado.
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [nomeEdit, setNomeEdit] = useState('')

  function handleMudarRole(usuario: UsuarioAdmin, novoRoleId: number) {
    const atual = rolesOtimistas[usuario.user_id] ?? usuario.role_id
    if (!novoRoleId || novoRoleId === atual) return
    setMsg(null)
    setRolesOtimistas(prev => ({ ...prev, [usuario.user_id]: novoRoleId }))
    setRowPendente(usuario.user_id)
    startTransition(async () => {
      const res = await atribuirRole(usuario.user_id, novoRoleId)
      if (!res.ok) {
        // Reverte o otimista se a action falhou.
        setRolesOtimistas(prev => { const c = { ...prev }; delete c[usuario.user_id]; return c })
        setMsg({ tipo: 'erro', texto: res.erro })
      } else {
        setMsg({ tipo: 'sucesso', texto: `Permissão de ${usuario.email} atualizada.` })
      }
      setRowPendente(null)
      router.refresh()
    })
  }

  /** Abre o modal de confirmação de reset (separa o gatilho da execução). */
  function abrirConfirmarReset(usuario: UsuarioAdmin) {
    setConfirmarReset(usuario)
  }

  /** Executa o reset após confirmação no modal. */
  function handleResetarSenha(usuario: UsuarioAdmin) {
    setConfirmarReset(null)
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

  /** Abre o modal de edição de nome, pré-preenchendo com o nome atual. */
  function abrirEditar(usuario: UsuarioAdmin) {
    setNomeEdit(usuario.nome ?? '')
    setEditando(usuario)
  }

  /** Salva o novo nome após o modal. Nome vazio é barrado (action + banco). */
  function handleSalvarNome() {
    if (!editando) return
    const alvo = editando
    setMsg(null)
    setRowPendente(alvo.user_id)
    startTransition(async () => {
      const res = await atualizarNome(alvo.user_id, nomeEdit)
      if (res.ok) setMsg({ tipo: 'sucesso', texto: `Nome de ${alvo.email} atualizado.` })
      else setMsg({ tipo: 'erro', texto: res.erro })
      setRowPendente(null)
      setEditando(null)
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

  // v4.18/M4 — "Criar usuário" foi para a LINHA DAS PILLS (AcessosContent). headerRight = só a contagem.
  const headerRight = (
    <p className="text-sm text-zinc-500">
      {usuarios.length === 1 ? '1 usuário registrado' : `${usuarios.length} usuários registrados`}
    </p>
  )

  return (
    <div>
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
              aria-label={`Senha provisória de ${revelado.email}`}
              className="foco-neutro flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-mono text-zinc-600 outline-none"
            />
            <button
              type="button" onClick={copiarRevelado}
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button
              type="button" onClick={() => setRevelado(null)} aria-label="Fechar"
              className="foco-neutro rounded-full border border-zinc-200 p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* CardTabela unifica o chrome da tabela com as telas irmãs de Acessos.
          Sem periodoLabel/temMais/onVerMais — tela de plataforma (ADR-0103 ext.). */}
      <CardTabela titulo="Usuários" headerRight={headerRight}>
        <table className="table-fixed w-full text-sm">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[20%]" />
            <col className="w-[12%]" />
            <col className="w-[23%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Usuário</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Permissão</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Status</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Último acesso</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(usuario => {
              // Descarta o otimista quando o servidor já alcançou o mesmo valor,
              // evitando que o estado otimista sombree o dado real indefinidamente.
              const roleOtimista = rolesOtimistas[usuario.user_id]
              const roleAtual = (roleOtimista != null && roleOtimista !== usuario.role_id)
                ? roleOtimista
                : usuario.role_id
              // Linha está pendente se é a linha em voo E a transition ainda não concluiu.
              const pendente = isPending && rowPendente === usuario.user_id
              const souEu = meuUserId !== null && usuario.user_id === meuUserId
              const nomeExibido = usuario.nome ?? usuario.email
              return (
                <tr key={usuario.user_id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-3 py-2.5">
                    {/* title garante leitura do nome completo quando truncado */}
                    <p className="font-medium text-zinc-900 truncate" title={nomeExibido}>
                      {nomeExibido}
                      {souEu && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--action-primary)' }}>você</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500 truncate" title={usuario.email}>{usuario.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <label htmlFor={`role-${usuario.user_id}`} className="sr-only">Permissão de {usuario.email}</label>
                    <select
                      id={`role-${usuario.user_id}`}
                      value={roleAtual != null ? String(roleAtual) : ''}
                      disabled={pendente}
                      onChange={e => handleMudarRole(usuario, Number(e.target.value))}
                      className="foco-neutro w-full rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 outline-none transition disabled:opacity-50"
                    >
                      {roleAtual == null && <option value="" disabled>Sem role</option>}
                      {roles.map(r => (<option key={r.id} value={String(r.id)}>{r.nome}</option>))}
                    </select>
                  </td>
                  <td className="px-3 py-2.5"><BadgeStatus usuario={usuario} /></td>
                  <td className="px-3 py-2.5">
                    <span className="block text-xs text-zinc-500 tabular-nums truncate" title={fmtDataHoraSP(usuario.ultimo_login)}>
                      {fmtDataHoraSP(usuario.ultimo_login)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {/* Ações da linha em ÍCONE (v4.18/M4): Editar nome · Redefinir senha · Excluir. */}
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => abrirEditar(usuario)}
                        disabled={pendente}
                        title="Editar nome"
                        aria-label={`Editar nome de ${usuario.email}`}
                        className={`${ICON_BTN} ${ICON_NEUTRO}`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirConfirmarReset(usuario)}
                        disabled={pendente}
                        title="Redefinir senha (gera nova provisória; a pessoa troca no próximo acesso)"
                        aria-label={`Redefinir senha de ${usuario.email}`}
                        className={`${ICON_BTN} ${ICON_NEUTRO}`}
                      >
                        {pendente ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                      </button>
                      {!souEu && (
                        <button
                          type="button" onClick={() => setConfirmarExcluir(usuario)} disabled={pendente}
                          title="Excluir definitivamente (irreversível)"
                          aria-label={`Excluir ${usuario.email}`}
                          className={`${ICON_BTN} ${ICON_PERIGO}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-sm text-zinc-400">
                  Nenhum usuário registrado ainda. Use «Criar usuário» para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardTabela>

      {criarAberto && (
        <ModalConvidar roles={roles} onFechar={onFecharCriar} />
      )}

      {/* Modal de edição de nome (v4.18/M4) — usa admin_atualizar_nome. Nome vazio barrado. */}
      {editando && (
        <ModalCentral titulo="Editar nome" onClose={() => setEditando(null)}>
          <p className="text-sm text-zinc-600 mb-3">
            Novo nome para <span className="font-medium">{editando.email}</span>.
          </p>
          <input
            type="text"
            value={nomeEdit}
            onChange={e => setNomeEdit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nomeEdit.trim()) handleSalvarNome() }}
            aria-label={`Nome de ${editando.email}`}
            placeholder="Nome"
            autoFocus
            className="foco-neutro w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none"
          />
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className={`${PILL} ${PILL_NEUTRO}`}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSalvarNome}
              disabled={!nomeEdit.trim() || (rowPendente === editando.user_id && isPending)}
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              {rowPendente === editando.user_id && isPending && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </ModalCentral>
      )}

      {/* Modal de confirmação de reset de senha — substitui window.confirm.
          Pill da ação é PILL_PRIMARIA (não é exclusão; gatilho é PILL_NEUTRO). */}
      {confirmarReset && (
        <ModalCentral titulo="Gerar nova senha" onClose={() => setConfirmarReset(null)}>
          <p className="text-sm text-zinc-600">
            Gerar uma NOVA senha provisória para {confirmarReset.email}? A senha atual deixa de valer.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmarReset(null)}
              className={`${PILL} ${PILL_NEUTRO}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleResetarSenha(confirmarReset)}
              disabled={rowPendente === confirmarReset.user_id && isPending}
              className={`${PILL} ${PILL_PRIMARIA}`}
              style={PILL_PRIMARIA_STYLE}
            >
              {rowPendente === confirmarReset.user_id && isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Gerar nova senha
            </button>
          </div>
        </ModalCentral>
      )}

      {/* Modal de confirmação de exclusão de usuário (existia antes da v4.16.1). */}
      {confirmarExcluir && (
        <ModalCentral titulo="Excluir usuário" onClose={() => setConfirmarExcluir(null)}>
          <p className="text-sm text-zinc-600">
            Excluir definitivamente {confirmarExcluir.nome ?? confirmarExcluir.email} ({confirmarExcluir.email})?
            Esta ação não pode ser desfeita.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmarExcluir(null)}
              className={`${PILL} ${PILL_NEUTRO}`}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => handleConfirmarExcluir(confirmarExcluir)}
              disabled={rowPendente === confirmarExcluir.user_id && isPending}
              className={`${PILL} ${PILL_PERIGO}`}
            >
              {rowPendente === confirmarExcluir.user_id && isPending && (
                <Loader2 size={14} className="animate-spin" />
              )}
              Excluir
            </button>
          </div>
        </ModalCentral>
      )}
    </div>
  )
}
