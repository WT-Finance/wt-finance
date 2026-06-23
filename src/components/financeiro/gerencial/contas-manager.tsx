'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, GripVertical } from 'lucide-react'
import { fmtBRL2 } from '@/lib/fmt'
import { toNum } from '@/lib/carga/coercao'
import { createConta, updateConta, deleteConta, reordenarContas, type PapelConta } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { PAPEL_LABEL, type Conta } from './tipos'

// v4.21.0 (M1) — mini-sistema de contas: CRUD + atributos (saldo inicial, limite de crédito,
// "entra no consolidado", papel isolada/reserva). Estado local otimista + router.refresh()
// para a projeção (componente irmão) recalcular. Papéis são exclusivos (0 ou 1 cada).
//
// v4.22 (M1): vira o PAINEL de gestão (dentro do drawer "Gerenciar contas"). O saldo inicial
// saiu daqui e passou para a grade de cards (ContasCards). PAPEL_LABEL e NumCell são exportados
// para a grade reaproveitar (não duplicar).
// v4.22.4: puxador (drag-handle) por linha para reordenar (RPC reordenar_gerencial_contas; a ordem
// rege os cards da agregada) + botões Salvar/Cancelar do "adicionar" ABAIXO da tabela (antes inline,
// sobrepunham a coluna estreita de ações).
// v4.23.1 (item 11): o parse de número usa o `toNum` CANÔNICO (@/lib/carga/coercao) — o parseNum
// local antigo fazia `replace(/\./g,'')` e, semeado com `String(105993.35)`="105993.35", tratava o
// ponto como milhar → 10599335 (corrupção). Exibição com fmtBRL2 (centavos; saldo é dinheiro).

/** Edita um número como string BR (vírgula decimal, 2 casas, sem milhar) — round-trip seguro com
 *  toNum e imune a ruído de float (toFixed fixa 2 casas; toNum lê ",dd" como decimal BR). */
const editStr = (v: number | null): string => (v == null ? '' : v.toFixed(2).replace('.', ','))

/** Célula numérica clicável (saldo/limite). Vazio em `limite` = sem limite (null). */
export function NumCell({ valor, onSave, permiteVazio }: {
  valor: number | null; onSave: (v: number | null) => Promise<void>; permiteVazio?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(editStr(valor))
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    const vazio = txt.trim() === ''
    const num = vazio ? (permiteVazio ? null : 0) : toNum(txt)
    // Entrada não-vazia que não é número (ex.: "abc") → INVÁLIDA: reverte sem salvar,
    // para não zerar um saldo por digitação errada (item 11: "pode levar o usuário ao erro").
    if (!vazio && num === null) { setTxt(editStr(valor)); setEditando(false); return }
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
    <button onClick={() => { setTxt(editStr(valor)); setEditando(true) }}
      className="text-xs tabular-nums hover:text-[var(--brand)] transition-colors"
      title="Clique para editar">
      {saving ? '…' : valor == null ? <span className="text-zinc-300">—</span> : fmtBRL2(valor)}
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
    <button onClick={() => setEditando(true)} className="text-sm font-medium hover:text-[var(--brand)] transition-colors block max-w-full truncate text-left" title={nome || 'Clique para renomear'}>
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
  const [dragIdx, setDragIdx] = useState<number | null>(null)

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
      saldo: toNum(nova.saldo) ?? 0,
      limite: toNum(nova.limite),
      consolidado: nova.consolidado,
      papel: nova.papel,
    })
    if (!res.success) { setErro(res.error); return }
    setAdicionando(false)
    setNova({ conta: '', saldo: '0', limite: '', consolidado: false, papel: null })
    router.refresh()
  }

  const ordenadas = [...contas].sort((a, b) => a.ordem - b.ordem)

  // Arrastar-soltar (puxador à esquerda): reordena local (otimista) + persiste a nova
  // ordem (RPC reordenar_gerencial_contas) + refresh. A ordem define os cards da agregada.
  const persistirOrdem = async (ordem: string[]) => {
    setErro(null)
    const res = await reordenarContas(ordem)
    if (!res.success) setErro(res.error)
    router.refresh()
  }
  const soltarEm = (dropIdx: number) => {
    if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return }
    const arr = [...ordenadas]
    const [movido] = arr.splice(dragIdx, 1)
    arr.splice(dropIdx, 0, movido)
    onContasChange(arr.map((c, i) => ({ ...c, ordem: i + 1 })))
    persistirOrdem(arr.map(c => c.conta))
    setDragIdx(null)
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        {!adicionando && (
          <button onClick={() => setAdicionando(true)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors">
            <Plus size={12} /> Adicionar conta
          </button>
        )}
      </div>

      {erro && <p className="mb-2 text-xs text-[var(--danger)]">{erro}</p>}

      {/* table-fixed + colgroup: Conta flexiona e trunca (sem rolagem horizontal). Coluna de
          PUXADOR à esquerda — arraste para reordenar; a ordem define os cards da agregada. */}
      <table className="w-full text-sm table-fixed">
        <colgroup>
          <col className="w-[28px]" />
          <col />
          <col className="w-[116px]" />
          <col className="w-[96px]" />
          <col className="w-[116px]" />
          <col className="w-[40px]" />
        </colgroup>
        <thead>
          <tr className="text-2xs font-medium text-zinc-400 border-b border-zinc-100">
            <th className="py-2 px-1"></th>
            <th className="py-2 px-2 text-left">Conta</th>
            <th className="py-2 px-2 text-right">Limite</th>
            <th className="py-2 px-2 text-center">Consolidado</th>
            <th className="py-2 px-2 text-center">Papel</th>
            <th className="py-2 px-2"></th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((c, i) => (
            <tr key={c.conta}
              onDragOver={e => e.preventDefault()}
              onDrop={() => soltarEm(i)}
              className={`border-b border-zinc-50 last:border-0 ${dragIdx === i ? 'opacity-40' : ''}`}>
              <td className="py-1.5 px-1 text-center">
                <span draggable onDragStart={() => setDragIdx(i)} onDragEnd={() => setDragIdx(null)}
                  className="inline-flex cursor-grab text-zinc-300 hover:text-zinc-500 active:cursor-grabbing"
                  title="Arraste para reordenar">
                  <GripVertical size={14} />
                </span>
              </td>
              <td className="py-1.5 px-2"><NomeCell nome={c.conta} onSave={v => editar(c.conta, { conta: v }, { nome: v })} /></td>
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
                  className={`p-1 rounded transition-colors ${confirmDel === c.conta ? 'text-danger bg-danger-bg' : 'text-zinc-300 hover:text-danger'}`}>
                  <Trash2 size={13} />
                </button>
              </td>
            </tr>
          ))}

          {adicionando && (
            <tr className="border-b border-[var(--brand)] bg-[var(--brand-soft)]/20">
              <td className="py-1.5 px-1"></td>
              <td className="py-1.5 px-2">
                <input autoFocus placeholder="Nome" value={nova.conta} onChange={e => setNova(p => ({ ...p, conta: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') adicionar() }}
                  className="w-28 text-xs border border-zinc-200 rounded px-1 py-0.5" />
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
              <td className="py-1.5 px-2"></td>
            </tr>
          )}
        </tbody>
      </table>

      {adicionando && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => { setAdicionando(false); setErro(null); setNova({ conta: '', saldo: '0', limite: '', consolidado: false, papel: null }) }}
            className="px-2.5 py-1 text-xs border border-zinc-200 rounded text-zinc-500 hover:border-zinc-300 transition-colors">
            Cancelar
          </button>
          <button onClick={adicionar}
            className="px-2.5 py-1 text-xs rounded text-white transition-opacity hover:opacity-90" style={{ background: 'var(--brand)' }}>
            Salvar
          </button>
        </div>
      )}
      <p className="mt-3 text-3xs text-[var(--text-muted)]">
        O saldo inicial de cada conta é editado nos cards. Marque <strong>Consolidado</strong> nas contas que somam no saldo consolidado. <strong>Papel</strong>: a conta <em>Principal</em> tem coluna própria (com faixas de limite); a <em>Rendimento</em> é somada à parte.
      </p>
    </div>
  )
}
