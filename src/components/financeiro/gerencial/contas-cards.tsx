'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Settings, ChevronRight } from 'lucide-react'
import { fmtDate } from '@/lib/fmt'
import { updateSaldo } from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { NumCell } from './contas-manager'
import { PAPEL_LABEL, type Conta } from './tipos'

// v4.22 (M1) — grade de cards de saldo das contas, SEMPRE visível (a gestão — limite, papel,
// consolidado, CRUD — vive no drawer "Gerenciar contas"). O card edita SÓ o saldo inicial,
// inline, reaproveitando o NumCell do painel e o mesmo caminho otimista (map local + updateSaldo
// + router.refresh para a projeção recalcular). Selos (read-only) no RODAPÉ do card, à esquerda,
// papel PRIMEIRO: "Principal" = âmbar de gestão (mesmo trio dos botões de Solicitações, --gestao*);
// "Rendimento" = verde do DS (--success-bg/--success/--positive-deep); "Consolidado" = neutro zinc.
// Cor sempre por token (id visual da plataforma), nunca hex literal.
//
// v5.2.0 (M5) — `data_saldo`: a DATA a que o saldo se refere (distinta de quando foi editado).
// Editar SÓ o número (NumCell) grava data_saldo = HOJE por padrão (a action assume isso quando
// a data não vem explícita); editar a data (DataSaldoCell) preserva o saldo atual e só corrige a
// referência — os dois caminhos passam pelo MESMO updateSaldo (RPC update_gerencial_saldo de 3
// args). O rótulo visível da célula de data É o staleness ("há N dias"/"hoje"/"sem data"); a
// data exata (fmtDate — sem conversão de fuso, `data_saldo` é `date` puro) vai no tooltip.

/** Dias corridos entre `dataSaldo` ('YYYY-MM-DD', date puro — SEM fuso) e HOJE em São Paulo.
 *  NUNCA `new Date(dataSaldo)` direto: o construtor trata data-only como meia-noite UTC e, ao
 *  formatar num fuso negativo, o dia pode "voltar" (landmine documentada em @/lib/fmt via
 *  parseLocalDate) — aqui os dois lados são comparados como calendário puro (Date.UTC),
 *  independente do fuso de quem roda o código. */
function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
function diasDesde(dataSaldo: string | null): number | null {
  if (!dataSaldo) return null
  const [hy, hm, hd] = hojeSP().split('-').map(Number)
  const [dy, dm, dd] = dataSaldo.split('-').map(Number)
  return Math.round((Date.UTC(hy, hm - 1, hd) - Date.UTC(dy, dm - 1, dd)) / 86_400_000)
}

/** Rótulo + cor do staleness. Neutro até 3 dias; atenção (--warning) de 4 a 7; alerta (--danger)
 *  acima de 7 — não há um limiar de referência no briefing, este é o adotado para o drill por
 *  conta (M5). Cor SEMPRE por token (nunca hex). */
function rotuloStaleness(dias: number | null): { texto: string; cor: string } {
  if (dias === null) return { texto: 'sem data', cor: 'text-zinc-300' }
  if (dias < 0)       return { texto: 'data futura', cor: 'text-zinc-400' }
  if (dias === 0)      return { texto: 'hoje', cor: 'text-zinc-400' }
  if (dias <= 3)       return { texto: `há ${dias} dia${dias > 1 ? 's' : ''}`, cor: 'text-zinc-400' }
  if (dias <= 7)       return { texto: `há ${dias} dias`, cor: 'text-warning' }
  return                     { texto: `há ${dias} dias`, cor: 'text-danger' }
}

/** Data a que o saldo se refere — clique para editar (mesmo padrão de NumCell/NomeCell:
 *  clique abre o `<input type="date">` nativo, blur/Enter salva). O texto exibido em repouso é
 *  o STALENESS; a data exata fica no `title`. */
function DataSaldoCell({ valor, onSave }: {
  valor: string | null; onSave: (v: string | null) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(valor ?? '')
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    const v = txt.trim() === '' ? null : txt
    if (v === valor) { setEditando(false); return }
    setSaving(true); await onSave(v); setSaving(false); setEditando(false)
  }
  if (editando) {
    return (
      <input
        autoFocus type="date" value={txt} onChange={e => setTxt(e.target.value)} onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') setEditando(false) }}
        className="text-2xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none"
      />
    )
  }
  const { texto, cor } = rotuloStaleness(diasDesde(valor))
  return (
    <button onClick={() => { setTxt(valor ?? ''); setEditando(true) }}
      className={`text-2xs hover:text-[var(--brand)] transition-colors ${cor}`}
      title={valor ? `Saldo referente a ${fmtDate(valor)} — clique para editar` : 'Sem data informada — clique para preencher'}>
      {saving ? '…' : texto}
    </button>
  )
}

export default function ContasCards({ contas, onContasChange, onGerir }: {
  contas: Conta[]
  onContasChange: (c: Conta[]) => void
  onGerir: () => void
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  // v4.23.2 (item 1): box recolhível com chevron, igual à barra TopSection. Padrão = aberto.
  const [aberto, setAberto] = useState(true)

  // Edição otimista do saldo. Sem data explícita: a action assume HOJE (SP) — refletido aqui
  // otimisticamente para o rótulo de staleness não "atrasar" até o router.refresh() completar.
  const editarSaldo = async (conta: string, saldo: number) => {
    setErro(null)
    onContasChange(contas.map(c => (c.conta === conta ? { ...c, saldo, data_saldo: hojeSP() } : c)))
    const res = await updateSaldo(conta, saldo)
    if (!res.success) { setErro(res.error); router.refresh(); return }
    router.refresh()
  }

  // Edição otimista SÓ da data — preserva o saldo atual (RPC sempre grava os dois juntos).
  const editarDataSaldo = async (conta: string, dataSaldo: string | null) => {
    setErro(null)
    const atual = contas.find(c => c.conta === conta)
    onContasChange(contas.map(c => (c.conta === conta ? { ...c, data_saldo: dataSaldo } : c)))
    const res = await updateSaldo(conta, atual?.saldo ?? 0, dataSaldo)
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
                <DataSaldoCell valor={c.data_saldo} onSave={d => editarDataSaldo(c.conta, d)} />
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
