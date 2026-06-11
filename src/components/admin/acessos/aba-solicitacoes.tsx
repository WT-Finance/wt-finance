'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, Copy, X } from 'lucide-react'
import { aprovarSolicitacao, rejeitarSolicitacao } from '@/app/admin/acessos/actions'
import type { RoleAdmin, SolicitacaoAdmin } from './tipos'
import { FaixaMensagem } from './faixa-mensagem'

// v4.14 — aba Solicitações: aprovar (cria usuário + senha provisória) / rejeitar
// pedidos de acesso vindos da tela pública /solicitar-acesso.

const OURO = '#BD965C'
const SELECT_CLASSES =
  'rounded-lg border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-700 ' +
  'outline-none focus:border-[#BD965C] focus:ring-2 focus:ring-[#BD965C]/20 transition disabled:opacity-50'

function fmtData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

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
  const [senha, setSenha] = useState<{ email: string; valor: string } | null>(null)
  const [copiado, setCopiado] = useState(false)

  function handleAprovar(s: SolicitacaoAdmin) {
    const roleId = roleEscolhida[s.id]
    if (!roleId) { setMsg({ tipo: 'erro', texto: `Escolha uma role para ${s.email} antes de aprovar.` }); return }
    setMsg(null)
    setPendenteId(s.id)
    startTransition(async () => {
      const res = await aprovarSolicitacao({ id: s.id, email: s.email, nome: s.nome ?? undefined, roleId })
      if (res.ok) {
        setSenha({ email: res.email, valor: res.senha })
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

  function handleRejeitar(s: SolicitacaoAdmin) {
    if (!window.confirm(`Rejeitar a solicitação de ${s.email}?`)) return
    setMsg(null)
    setPendenteId(s.id)
    startTransition(async () => {
      const res = await rejeitarSolicitacao(s.id)
      setMsg(res.ok ? { tipo: 'sucesso', texto: `Solicitação de ${s.email} rejeitada.` } : { tipo: 'erro', texto: res.erro })
      setPendenteId(null)
      router.refresh()
    })
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
          <div className="flex items-center gap-2">
            <input
              readOnly value={senha.valor} onFocus={e => e.currentTarget.select()}
              className="flex-1 rounded border border-zinc-200 bg-white px-2 py-1 text-xs font-mono text-zinc-700 outline-none"
            />
            <button type="button" onClick={copiarSenha} className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium text-white hover:opacity-90" style={{ background: OURO }}>
              {copiado ? <><Check size={13} /> Copiado</> : <><Copy size={13} /> Copiar</>}
            </button>
            <button type="button" onClick={() => setSenha(null)} aria-label="Fechar" className="rounded-lg border border-zinc-200 p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left">
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Solicitante</th>
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Quando</th>
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400">Aprovar com a role</th>
                <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-zinc-400 text-right">Ações</th>
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
                    <td className="px-4 py-3 text-zinc-500">{fmtData(s.criado_em)}</td>
                    <td className="px-4 py-3">
                      <label htmlFor={`role-sol-${s.id}`} className="sr-only">Role para {s.email}</label>
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
                          className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                          style={{ background: OURO }}
                        >
                          {proc && <Loader2 size={12} className="animate-spin" />}
                          Aprovar
                        </button>
                        <button
                          type="button" onClick={() => handleRejeitar(s)} disabled={proc}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-red-600 hover:border-red-200 hover:bg-red-50 disabled:opacity-50"
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
              <li key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                <span className="truncate text-zinc-600">{s.email}</span>
                <span className={`ml-2 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.status === 'aprovada' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-100 text-zinc-500'}`}>
                  {s.status === 'aprovada' ? 'Aprovada' : 'Rejeitada'} · {fmtData(s.decidido_em)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
