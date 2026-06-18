'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings } from 'lucide-react'
import { updateConta } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { NumCell } from './contas-manager'
import { PAPEL_LABEL, type Conta } from './tipos'

// v4.22 (M1) — grade de cards de saldo das contas, SEMPRE visível (a gestão — limite, papel,
// consolidado, CRUD — vive no drawer "Gerenciar contas"). O card edita SÓ o saldo inicial,
// inline, reaproveitando o NumCell do painel e o mesmo caminho otimista (map local + updateConta
// + router.refresh para a projeção recalcular). Selo do papel é INFORMATIVO (read-only):
// "Principal" usa o trio neutro --action-soft (pill de plataforma); "Rendimento" usa zinc.

export default function ContasCards({ contas, onContasChange, onGerir }: {
  contas: Conta[]
  onContasChange: (c: Conta[]) => void
  onGerir: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)

  // Edição otimista APENAS do saldo (não mexe em papel/limite/consolidado, logo sem
  // tratamento de exclusividade de papel — diferente do aplicarLocal do painel).
  const editarSaldo = async (conta: string, saldo: number) => {
    setErro(null)
    onContasChange(contas.map(c => (c.conta === conta ? { ...c, saldo } : c)))
    const res = await updateConta(conta, { saldo })
    if (!res.success) { setErro(res.error); router.refresh(); return }
    router.refresh()
  }

  return (
    <div className="bg-white rounded-xl shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Contas</p>
        <button onClick={onGerir}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors foco-neutro">
          <Settings size={13} /> Gerenciar contas
        </button>
      </div>
      {erro && <p className="mb-2 text-xs text-[var(--danger)]">{erro}</p>}
      {contas.length === 0 ? (
        <p className="text-sm text-zinc-400 py-4 text-center">
          Nenhuma conta cadastrada. Use <strong>Gerenciar contas</strong> para adicionar.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {[...contas].sort((a, b) => a.ordem - b.ordem).map(c => (
            <div key={c.conta} className="border border-zinc-100 rounded-lg px-3 py-2.5 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate" title={c.conta}>{c.conta}</p>
                {c.consolidado && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-400 border border-zinc-100"
                    title="Entra no saldo consolidado">
                    Consolidado
                  </span>
                )}
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">Saldo</p>
                <NumCell valor={c.saldo} onSave={v => editarSaldo(c.conta, v ?? 0)} />
              </div>
              {c.papel === 'isolada' && (
                // "Principal": pill neutra de plataforma (trio --action-soft).
                <span
                  className="self-start text-[10px] px-1.5 py-0.5 rounded border"
                  style={{ background: 'var(--action-soft)', borderColor: 'var(--action-soft-border)', color: 'var(--action-soft-fg)' }}
                >
                  {PAPEL_LABEL.isolada}
                </span>
              )}
              {c.papel === 'reserva' && (
                // "Rendimento": neutro zinc.
                <span className="self-start text-[10px] px-1.5 py-0.5 rounded border bg-zinc-100 text-zinc-600 border-zinc-200">
                  {PAPEL_LABEL.reserva}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
