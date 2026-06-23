'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Copy, X } from 'lucide-react'
import { aprovarSolicitacao, rejeitarSolicitacao } from '@/app/admin/acessos/actions'
import type { RoleAdmin, SolicitacaoAdmin } from './tipos'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import ConfirmModal from '@/components/shared/confirm-modal'
import { PILL, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtDataSP, fmtDataHoraSP } from '@/lib/fmt'

// v4.14 — aba "Solicitações de acesso": aprovar (cria usuário + senha provisória) /
// rejeitar pedidos de acesso vindos da tela pública /solicitar-acesso. Botões em pill.
// v4.18/M4 — datas no fuso de São Paulo (Intl); histórico mais informativo (quem decidiu,
// quando, motivo se rejeitada); badge do histórico vira texto.

const SELECT_CLASSES =
  'foco-neutro rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 ' +
  'outline-none transition disabled:opacity-50'

interface Mensagem { tipo: 'sucesso' | 'erro'; texto: string }

export function AbaSolicitacoes({
  solicitacoes,
  roles,
}: {
  solicitacoes: SolicitacaoAdmin[]
  roles:        RoleAdmin[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [msg, setMsg] = useState<Mensagem | null>(null)
  const [pendenteId, setPendenteId] = useState<number | null>(null)
  const [roleEscolhida, setRoleEscolhida] = useState<Record<number, number>>({})
  const [senha, setSenha] = useState<{ email: string; valor: string; emailEnviado: boolean } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [rejeitar, setRejeitar] = useState<SolicitacaoAdmin | null>(null)

  function handleAprovar(s: SolicitacaoAdmin) {
    const roleId = roleEscolhida[s.id]
    if (!roleId) { setMsg({ tipo: 'erro', texto: `Escolha uma permissão para ${s.email} antes de aprovar.` }); return }
    setMsg(null)
    setPendenteId(s.id)
    startTransition(async () => {
      const res = await aprovarSolicitacao({ id: s.id, email: s.email, nome: s.nome ?? undefined, roleId })
      if (res.ok) {
        setSenha({ email: res.email, valor: res.senha, emailEnviado: res.emailEnviado })
        setCopiado(false)
        try { await navigator.clipboard.writeText(res.senha); setCopiado(true) } catch { /* painel copiável */ }
        setMsg({ tipo: 'sucesso', texto: `${res.email} aprovado e criado.` })
      } else {
        setMsg({ tipo: 'erro', texto: res.erro })
      }
      setPendenteId(null)
      router.refresh()
    })
  }

  // Rejeição confirmada pelo ConfirmModal (substitui window.confirm — coerência com as abas irmãs).
  async function confirmarRejeitar(s: SolicitacaoAdmin) {
    setMsg(null)
    setPendenteId(s.id)
    const res = await rejeitarSolicitacao(s.id)
    setMsg(res.ok ? { tipo: 'sucesso', texto: `Solicitação de ${s.email} rejeitada.` } : { tipo: 'erro', texto: res.erro })
    setPendenteId(null)
    router.refresh()
  }

  async function copiarSenha() {
    if (!senha) return
    try { await navigator.clipboard.writeText(senha.valor); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* selecionável */ }
  }

  const pendentes = solicitacoes.filter(s => s.status === 'pendente')
  const decididas = solicitacoes.filter(s => s.status !== 'pendente')

  return (
    <div>
      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      {senha && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3">
          <p className="text-xs text-zinc-600 mb-2">
            Senha provisória de <span className="font-medium">{senha.email}</span> — repasse à pessoa.
            Ela troca no primeiro acesso. Não será mostrada de novo.
          </p>
          {/* v4.24.0 — aviso de envio (a senha aparece sempre abaixo, fallback). */}
          {senha.emailEnviado ? (
            <p className="text-xs text-success mb-2">Enviada por e-mail para {senha.email}.</p>
          ) : (
            <p className="text-xs text-warning mb-2">Não foi possível enviar o e-mail — copie e repasse manualmente.</p>
          )}
          <div className="flex items-center gap-2">
            <input
              readOnly value={senha.valor} onFocus={e => e.currentTarget.select()}
              className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-mono text-zinc-700 outline-none"
            />
            <button type="button" onClick={copiarSenha} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button type="button" onClick={() => setSenha(null)} aria-label="Fechar" className="foco-neutro rounded-full border border-zinc-200 p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      <p className="text-sm text-zinc-500 mb-3">
        {pendentes.length === 0 ? 'Nenhuma solicitação pendente.' :
          pendentes.length === 1 ? '1 solicitação pendente' : `${pendentes.length} solicitações pendentes`}
      </p>

      {pendentes.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden mb-6">
          {/* aviso âmbar quando não há permissões cadastradas — Aprovar ficará desabilitado */}
          {roles.length === 0 && (
            <div className="border-b border-warning bg-warning-bg px-4 py-2 text-xs text-warning">
              Nenhuma permissão cadastrada — crie ao menos uma permissão em Permissões para poder aprovar solicitações.
            </div>
          )}
          <table className="table-fixed w-full text-sm">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[18%]" />
              <col className="w-[26%]" />
              <col className="w-[22%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left">
                <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Solicitante</th>
                <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Quando</th>
                <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400">Aprovar com a permissão</th>
                <th scope="col" className="px-4 py-2.5 text-[11px] font-medium text-zinc-400 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map(s => {
                const proc = pendenteId === s.id
                return (
                  <tr key={s.id} className="border-b border-zinc-50 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-zinc-900 truncate">{s.nome ?? s.email}</p>
                      {s.nome && <p className="text-xs text-zinc-500 truncate">{s.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-zinc-500 tabular-nums">{fmtDataSP(s.criado_em)}</td>
                    <td className="px-4 py-3">
                      <label htmlFor={`role-sol-${s.id}`} className="sr-only">Permissão para {s.email}</label>
                      <select
                        id={`role-sol-${s.id}`}
                        value={roleEscolhida[s.id] ? String(roleEscolhida[s.id]) : ''}
                        disabled={proc}
                        onChange={e => setRoleEscolhida(prev => ({ ...prev, [s.id]: Number(e.target.value) }))}
                        className={SELECT_CLASSES}
                      >
                        <option value="" disabled>Selecione…</option>
                        {roles.map(r => (<option key={r.id} value={String(r.id)}>{r.nome}</option>))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button" onClick={() => handleAprovar(s)} disabled={proc || roles.length === 0}
                          title={roles.length === 0 ? 'Crie ao menos uma permissão antes de aprovar' : undefined}
                          className={`${PILL} ${PILL_PRIMARIA}`}
                          style={PILL_PRIMARIA_STYLE}
                        >
                          {proc && <Loader2 size={12} className="animate-spin" />}
                          Aprovar
                        </button>
                        <button
                          type="button" onClick={() => setRejeitar(s)} disabled={proc}
                          className={`${PILL} ${PILL_PERIGO}`}
                        >
                          Rejeitar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {decididas.length > 0 && (
        <>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400 mb-2">Histórico</p>
          <ul className="space-y-1">
            {decididas.map(s => (
              <li key={s.id} className="rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-zinc-700">{s.email}</span>
                  {/* Badge virou TEXTO (v4.18/M4): "Aprovada/Rejeitada em DD/MM/AAAA às HH:MM por …" (fuso SP) */}
                  <span className="shrink-0 text-xs text-zinc-500 tabular-nums">
                    <span className={`font-medium ${s.status === 'aprovada' ? 'text-success' : 'text-danger'}`}>
                      {s.status === 'aprovada' ? 'Aprovada' : 'Rejeitada'}
                    </span>
                    {' em '}{fmtDataHoraSP(s.decidido_em)}
                    {s.decidido_por_rotulo ? ` por ${s.decidido_por_rotulo}` : ''}
                  </span>
                </div>
                {s.status === 'rejeitada' && s.observacao && (
                  <p className="mt-1 text-xs text-zinc-500">Motivo: {s.observacao}</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {rejeitar && (
        <ConfirmModal
          titulo="Rejeitar solicitação"
          mensagem={`Rejeitar a solicitação de acesso de ${rejeitar.email}?`}
          confirmarLabel="Rejeitar"
          onConfirmar={() => confirmarRejeitar(rejeitar)}
          onFechar={() => setRejeitar(null)}
        />
      )}
    </div>
  )
}
