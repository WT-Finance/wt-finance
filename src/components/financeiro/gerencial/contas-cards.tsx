'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, ChevronRight } from 'lucide-react'
import { updateConta } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { NumCell } from './contas-manager'
import { PAPEL_LABEL, type Conta } from './tipos'

// v4.22 (M1) — grade de cards de saldo das contas, SEMPRE visível (a gestão — limite, papel,
// consolidado, CRUD — vive no drawer "Gerenciar contas"). O card edita SÓ o saldo inicial,
// inline, reaproveitando o NumCell do painel e o mesmo caminho otimista (map local + updateConta
// + router.refresh para a projeção recalcular). Selos (read-only) no RODAPÉ do card, à esquerda,
// papel PRIMEIRO: "Principal" = âmbar de gestão (mesmo trio dos botões de Solicitações, --gestao*);
// "Rendimento" = verde do DS (--success-bg/--success/--positive-deep); "Consolidado" = neutro zinc.
// Cor sempre por token (id visual da plataforma), nunca hex literal.

export default function ContasCards({ contas, onContasChange, onGerir }: {
  contas: Conta[]
  onContasChange: (c: Conta[]) => void
  onGerir: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  // v4.23.2 (item 1): box recolhível com chevron, igual à barra TopSection. Padrão = aberto.
  const [aberto, setAberto] = useState(true)

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
      <div className={`flex items-center justify-between ${aberto ? 'mb-3' : ''}`}>
        <button type="button" onClick={() => setAberto(v => !v)} aria-expanded={aberto}
          title={aberto ? 'Recolher' : 'Expandir'}
          className="flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded foco-neutro">
          <ChevronRight size={14} className={`text-[var(--text-muted)] transition-transform ${aberto ? 'rotate-90' : ''}`} />
          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Contas</span>
        </button>
        <button onClick={onGerir}
          className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors foco-neutro">
          <Settings size={13} /> Gerenciar contas
        </button>
      </div>
      {aberto && erro && <p className="mb-2 text-xs text-[var(--danger)]">{erro}</p>}
      {aberto && (contas.length === 0 ? (
        <p className="text-sm text-zinc-400 py-4 text-center">
          Nenhuma conta cadastrada. Use <strong>Gerenciar contas</strong> para adicionar.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {[...contas].sort((a, b) => a.ordem - b.ordem).map(c => (
            <div key={c.conta} className="border border-zinc-100 rounded-lg px-3 py-2.5 flex flex-col gap-2">
              <p className="text-sm font-medium text-[var(--text-primary)] truncate" title={c.conta}>{c.conta}</p>
              <div className="text-right">
                <p className="text-3xs uppercase tracking-wide text-[var(--text-subtle)]">Saldo</p>
                <NumCell valor={c.saldo} onSave={v => editarSaldo(c.conta, v ?? 0)} />
              </div>
              {/* Selos no rodapé, à esquerda — papel PRIMEIRO (Principal/Rendimento), depois Consolidado. */}
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                {c.papel === 'isolada' && (
                  // "Principal": âmbar de gestão (mesmo trio dos botões de Solicitações).
                  <span className="text-3xs px-1.5 py-0.5 rounded border"
                    style={{ background: 'var(--gestao-soft)', borderColor: 'var(--gestao)', color: 'var(--gestao-fg)' }}
                    title="Conta principal — coluna própria na projeção, com faixas de limite">
                    {PAPEL_LABEL.isolada}
                  </span>
                )}
                {c.papel === 'reserva' && (
                  // "Rendimento": verde do design system.
                  <span className="text-3xs px-1.5 py-0.5 rounded border"
                    style={{ background: 'var(--success-bg)', borderColor: 'var(--success)', color: 'var(--positive-deep)' }}
                    title="Conta de rendimento — somada à parte no consolidado">
                    {PAPEL_LABEL.reserva}
                  </span>
                )}
                {c.consolidado && (
                  <span className="text-3xs px-1.5 py-0.5 rounded bg-zinc-50 text-zinc-400 border border-zinc-100"
                    title="Entra no saldo consolidado">
                    Consolidado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
