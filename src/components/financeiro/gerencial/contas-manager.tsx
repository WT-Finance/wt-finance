'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Check } from 'lucide-react'
import { fmtBRL } from '@/lib/fmt'
import { createConta, updateConta, deleteConta, type PapelConta } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import type { Conta } from './tipos'

// v4.21.0 (M1) — mini-sistema de contas: CRUD + atributos (saldo inicial, limite de crédito,
// "entra no consolidado", papel isolada/reserva). Estado local otimista + router.refresh()
// para a projeção (componente irmão) recalcular. Papéis são exclusivos (0 ou 1 cada).

const PAPEL_LABEL: Record<string, string> = { '': '—', isolada: 'Isolada', reserva: 'Reserva' }

function parseNum(v: string): number | null {
  const n = parseFloat(v.replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}

/** Célula numérica clicável (saldo/limite). Vazio em `limite` = sem limite (null). */
function NumCell({ valor, onSave, permiteVazio }: {
  valor: number | null; onSave: (v: number | null) => Promise<void>; permiteVazio?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(valor == null ? '' : String(valor))
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    const num = txt.trim() === '' ? (permiteVazio ? null : 0) : parseNum(txt)
    if (num === valor) { setEditando(false); return }
    setSaving(true); await onSave(num); setSaving(false); setEditando(false)
  }
  if (editando) {
    return (
      <input
        autoFocus value={txt} onChange={e => setTxt(e.target.value)} onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
        placeholder={permiteVazio ? 'sem limite' : '0'}
        className="w-24 text-right text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none tabular-nums"
      />
    )
  }
  return (
    <button onClick={() => { setTxt(valor == null ? '' : String(valor)); setEditando(true) }}
      className="text-xs tabular-nums hover:text-[var(--brand)] transition-colors"
      title="Clique para editar">
      {saving ? '…' : valor == null ? <span className="text-zinc-300">—</span> : fmtBRL(valor)}
    </button>
  )
}

function NomeCell({ nome, onSave }: { nome: string; onSave: (v: string) => Promise<void> }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(nome)
  const [saving, setSaving] = useState(false)
  const salvar = async () => {
    const v = txt.trim()
    if (!v || v === nome) { setEditando(false); setTxt(nome); return }
    setSaving(true); await onSave(v); setSaving(false); setEditando(false)
  }
  if (editando) {
    return (
      <input autoFocus value={txt} onChange={e => setTxt(e.target.value)} onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setEditando(false); setTxt(nome) } }}
        className="w-28 text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none" />
    )
  }
  return (
    <button onClick={() => setEditando(true)} className="text-sm font-medium hover:text-[var(--brand)] transition-colors" title="Clique para renomear">
      {saving ? '…' : nome}
    </button>
  )
}

export default function ContasManager({ contas, onContasChange }: {
  contas: Conta[]
  onContasChange: (c: Conta[]) => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [adicionando, setAdicionando] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [nova, setNova] = useState<{ conta: string; saldo: string; limite: string; consolidado: boolean; papel: PapelConta }>(
    { conta: '', saldo: '0', limite: '', consolidado: false, papel: null },
  )

  // Aplica um patch localmente (otimista) tratando exclusividade do papel.
  const aplicarLocal = (conta: string, patch: Partial<Conta>) => {
    onContasChange(contas.map(c => {
      if (c.conta === conta) return { ...c, ...patch }
      // Exclusividade: ao atribuir papel a `conta`, limpa de quem detinha o mesmo papel.
      if (patch.papel && c.papel === patch.papel) return { ...c, papel: null }
      return c
    }))
  }

  const editar = async (conta: string, patch: Partial<Conta>, payload: Parameters<typeof updateConta>[1]) => {
    setErro(null)
    aplicarLocal(conta, patch)
    const res = await updateConta(conta, payload)
    if (!res.success) { setErro(res.error); router.refresh(); return }
    router.refresh()
  }

  const remover = async (conta: string) => {
    setErro(null); setConfirmDel(null)
    onContasChange(contas.filter(c => c.conta !== conta))
    const res = await deleteConta(conta)
    if (!res.success) setErro(res.error)
    router.refresh()
  }

  const adicionar = async () => {
    const nome = nova.conta.trim()
    if (!nome) { setErro('Informe o nome da conta.'); return }
    setErro(null)
    const res = await createConta({
      conta: nome,
      saldo: parseNum(nova.saldo) ?? 0,
      limite: nova.limite.trim() === '' ? null : parseNum(nova.limite),
      consolidado: nova.consolidado,
      papel: nova.papel,
    })
    if (!res.success) { setErro(res.error); return }
    setAdicionando(false)
    setNova({ conta: '', saldo: '0', limite: '', consolidado: false, papel: null })
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Contas</p>
        {!adicionando && (
          <button onClick={() => setAdicionando(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors">
            <Plus size={12} /> Adicionar conta
          </button>
        )}
      </div>

      {erro && <p className="mb-2 text-xs text-[var(--danger)]">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[11px] font-medium text-zinc-400 border-b border-zinc-100">
              <th className="py-2 px-2 text-left">Conta</th>
              <th className="py-2 px-2 text-right">Saldo inicial</th>
              <th className="py-2 px-2 text-right">Limite de crédito</th>
              <th className="py-2 px-2 text-center">Consolidado</th>
              <th className="py-2 px-2 text-center">Papel</th>
              <th className="py-2 px-2 w-[36px]"></th>
            </tr>
          </thead>
          <tbody>
            {[...contas].sort((a, b) => a.ordem - b.ordem).map(c => (
              <tr key={c.conta} className="border-b border-zinc-50 last:border-0">
                <td className="py-1.5 px-2"><NomeCell nome={c.conta} onSave={v => editar(c.conta, { conta: v }, { nome: v })} /></td>
                <td className="py-1.5 px-2 text-right">
                  <NumCell valor={c.saldo} onSave={v => editar(c.conta, { saldo: v ?? 0 }, { saldo: v ?? 0 })} />
                </td>
                <td className="py-1.5 px-2 text-right">
                  <NumCell valor={c.limite} permiteVazio onSave={v => editar(c.conta, { limite: v }, { limite: v })} />
                </td>
                <td className="py-1.5 px-2 text-center">
                  <input type="checkbox" checked={c.consolidado}
                    onChange={e => editar(c.conta, { consolidado: e.target.checked }, { consolidado: e.target.checked })}
                    className="accent-[var(--brand)] cursor-pointer" aria-label={`${c.conta} entra no consolidado`} />
                </td>
                <td className="py-1.5 px-2 text-center">
                  <select value={c.papel ?? ''}
                    onChange={e => { const p = (e.target.value || null) as PapelConta; editar(c.conta, { papel: p }, { papel: p }) }}
                    className="text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white cursor-pointer">
                    {(['', 'isolada', 'reserva'] as const).map(v => <option key={v} value={v}>{PAPEL_LABEL[v]}</option>)}
                  </select>
                </td>
                <td className="py-1.5 px-2 text-right">
                  <button onClick={() => confirmDel === c.conta ? remover(c.conta) : setConfirmDel(c.conta)}
                    onBlur={() => setConfirmDel(null)}
                    title={confirmDel === c.conta ? 'Clique novamente para confirmar' : 'Remover conta'}
                    className={`p-1 rounded transition-colors ${confirmDel === c.conta ? 'text-red-500 bg-red-50' : 'text-zinc-300 hover:text-red-400'}`}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}

            {adicionando && (
              <tr className="border-b border-[var(--brand)] bg-[var(--brand-soft)]/20">
                <td className="py-1.5 px-2">
                  <input autoFocus placeholder="Nome" value={nova.conta} onChange={e => setNova(p => ({ ...p, conta: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
                    className="w-28 text-xs border border-zinc-200 rounded px-1 py-0.5" />
                </td>
                <td className="py-1.5 px-2 text-right">
                  <input placeholder="0" value={nova.saldo} onChange={e => setNova(p => ({ ...p, saldo: e.target.value }))}
                    className="w-24 text-right text-xs border border-zinc-200 rounded px-1 py-0.5 tabular-nums" />
                </td>
                <td className="py-1.5 px-2 text-right">
                  <input placeholder="sem limite" value={nova.limite} onChange={e => setNova(p => ({ ...p, limite: e.target.value }))}
                    className="w-24 text-right text-xs border border-zinc-200 rounded px-1 py-0.5 tabular-nums" />
                </td>
                <td className="py-1.5 px-2 text-center">
                  <input type="checkbox" checked={nova.consolidado} onChange={e => setNova(p => ({ ...p, consolidado: e.target.checked }))}
                    className="accent-[var(--brand)] cursor-pointer" />
                </td>
                <td className="py-1.5 px-2 text-center">
                  <select value={nova.papel ?? ''} onChange={e => setNova(p => ({ ...p, papel: (e.target.value || null) as PapelConta }))}
                    className="text-xs border border-zinc-200 rounded px-1 py-0.5 bg-white">
                    {(['', 'isolada', 'reserva'] as const).map(v => <option key={v} value={v}>{PAPEL_LABEL[v]}</option>)}
                  </select>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex gap-1 justify-end">
                    <button onClick={adicionar} className="p-1 rounded text-white" style={{ background: 'var(--brand)' }} title="Salvar"><Check size={13} /></button>
                    <button onClick={() => { setAdicionando(false); setErro(null) }} className="p-1 rounded border border-zinc-200 text-zinc-400" title="Cancelar">✕</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        Marque <strong>Consolidado</strong> nas contas que somam no saldo consolidado. <strong>Papel</strong>: a conta <em>isolada</em> tem coluna própria (com faixas de limite); a <em>reserva</em> é somada à parte.
      </p>
    </div>
  )
}
