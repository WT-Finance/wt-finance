'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Badge from '@/components/ui/badge'
import { fmtMi, fmtBRL2, fmtDate } from '@/lib/fmt'
import { toNum } from '@/lib/carga/coercao'
import { atualizarSaldoCaixaAction } from '@/app/financeiro/fluxo-caixa/actions'
import type { SaldoCaixaConta } from '@/lib/fluxo/rpc-fluxo'

// Saldo de Caixa (v5.2.0/Onda 1) — KPI do topo do Fluxo Projetado. OPERACIONAL = soma dos
// saldos das contas com reserva=false; a Reserva (reserva=true, ex.: XP/Clara) é mostrada
// SEPARADA, nunca somada ao operacional. Clique abre o drill por conta.
//
// Ajuste do checkpoint do Yan: a fonte é a tabela PRÓPRIA do Fluxo Projetado
// (financeiro.saldo_caixa, via get_saldo_caixa/atualizar_saldo_caixa — migration 0194),
// DESCONECTADA de analytics.gerencial_saldos — /fluxo-caixa/gerencial evolui separado a
// partir daqui. O modal do drill agora é EDITÁVEL (saldo + data por conta). O idioma de
// edição (célula numérica / célula de data click-to-edit) é MIRRORED de
// gerencial/contas-cards.tsx, mas mantido LOCAL — sem importar o módulo gerencial (o
// desacoplamento é o ponto: as duas telas não compartilham mais tipo nem estado).
//
// `data_saldo` é DATE PURO (sem fuso) — nunca `new Date(dataSaldo)`/fmtDataSP nele (o
// construtor trata data-only como meia-noite UTC e o dia "volta" em fuso negativo; landmine
// documentada em gerencial/contas-cards.tsx). Usa-se `fmtDate` (split de string, sem
// conversão) e a comparação por componentes abaixo — igual ao padrão já adotado ali.

interface Props {
  /** RPC get_saldo_caixa(). Vazio quando o usuário não tem financeiro/fluxo-caixa
   *  (a página degrada o KPI para "—" em vez de quebrar — RBAC próprio da RPC). */
  saldos: SaldoCaixaConta[]
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function diasDesde(dataSaldo: string | null | undefined): number | null {
  if (!dataSaldo) return null
  const [hy, hm, hd] = hojeSP().split('-').map(Number)
  const [dy, dm, dd] = dataSaldo.split('-').map(Number)
  return Math.round((Date.UTC(hy, hm - 1, hd) - Date.UTC(dy, dm - 1, dd)) / 86_400_000)
}

/** Mesmos limiares de gerencial/contas-cards.tsx: neutro até 3 dias, atenção 4–7, alerta >7. */
function rotuloStaleness(dias: number | null): { texto: string; cor: string; badge: 'warning' | 'danger' | null } {
  if (dias === null) return { texto: 'sem data',      cor: 'text-zinc-300', badge: null }
  if (dias < 0)       return { texto: 'data futura',   cor: 'text-zinc-400', badge: null }
  if (dias === 0)     return { texto: 'hoje',          cor: 'text-zinc-400', badge: null }
  if (dias <= 3)      return { texto: `há ${dias} dia${dias > 1 ? 's' : ''}`, cor: 'text-zinc-400', badge: null }
  if (dias <= 7)      return { texto: `há ${dias} dias`, cor: 'text-warning', badge: 'warning' }
  return                     { texto: `há ${dias} dias`, cor: 'text-danger',  badge: 'danger' }
}

/** Saldo BR (vírgula decimal, 2 casas) — round-trip seguro com `toNum` canônico (mesmo idioma
 *  de NumCell em gerencial/contas-manager.tsx; redefinido aqui para não importar o módulo
 *  gerencial). */
const editStr = (v: number): string => v.toFixed(2).replace('.', ',')

export default function SaldoCaixaKpi({ saldos }: Props) {
  const [drillOpen, setDrillOpen] = useState(false)

  if (!saldos.length) {
    return (
      <div className="rounded-xl shadow-sm bg-white px-5 py-4">
        <p className="text-2xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Saldo de Caixa</p>
        <div className="mb-3" />
        <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>—</p>
      </div>
    )
  }

  const operacionais = saldos.filter(c => !c.reserva)
  const reservas      = saldos.filter(c => c.reserva)
  const saldoOperacional = operacionais.reduce((s, c) => s + c.saldo, 0)
  const saldoReserva     = reservas.reduce((s, c) => s + c.saldo, 0)

  return (
    <>
      <div
        className="card-clicavel rounded-xl shadow-sm bg-white px-5 py-4 cursor-pointer"
        onClick={() => setDrillOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setDrillOpen(true)}
        aria-label="Ver saldo de caixa por conta"
      >
        <p className="text-2xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Saldo de Caixa</p>
        <p className="text-3xs text-zinc-400 mb-2">operacional · exclui reserva</p>
        <p
          className="text-2xl font-bold tabular-nums"
          style={{ color: saldoOperacional >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}
        >
          {fmtMi(saldoOperacional)}
        </p>
        {reservas.length > 0 && (
          <p className="text-2xs mt-1" style={{ color: 'var(--text-muted)' }}>+ {fmtMi(saldoReserva)} em reserva</p>
        )}
        <div className="flex justify-end mt-2">
          <span className="card-clicavel-cta text-2xs text-[var(--brand)] font-medium">Ver por conta ›</span>
        </div>
      </div>

      {drillOpen && (
        <SaldoDrillModal saldosIniciais={saldos} onClose={() => setDrillOpen(false)} />
      )}
    </>
  )
}

function SaldoDrillModal({ saldosIniciais, onClose }: { saldosIniciais: SaldoCaixaConta[]; onClose: () => void }) {
  const router = useRouter()
  const [saldos, setSaldos] = useState(saldosIniciais)
  const [erro, setErro] = useState<Record<string, string>>({})
  const ordenados = [...saldos].sort((a, b) => a.ordem - b.ordem)

  // Edição otimista (saldo E/OU data — a RPC sempre grava os dois juntos; o caller passa o
  // valor CORRENTE do campo que não está sendo editado). Erro → reverte o estado local e
  // mostra mensagem discreta na linha (sem refetch — o revert local já é a fonte da verdade).
  const salvar = async (conta: string, novoSaldo: number, novaData: string | null) => {
    setErro(prev => { const n = { ...prev }; delete n[conta]; return n })
    const anterior = saldos
    setSaldos(prev => prev.map(c => (c.conta === conta ? { ...c, saldo: novoSaldo, data_saldo: novaData } : c)))
    const res = await atualizarSaldoCaixaAction(conta, novoSaldo, novaData)
    if ('error' in res) {
      setSaldos(anterior)
      setErro(prev => ({ ...prev, [conta]: res.error }))
      return
    }
    router.refresh() // re-hidrata o KPI/servidor (a página lê get_saldo_caixa de novo)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h3 className="text-sm font-semibold text-zinc-800">Saldo de caixa por conta</h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded"
            aria-label="Fechar"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <ScrollAutoHide className="px-5 py-3">
          {ordenados.map(c => {
            const { badge } = rotuloStaleness(diasDesde(c.data_saldo))
            return (
              <div key={c.conta} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">
                    {c.conta}
                    {c.reserva && <span className="ml-1.5 text-3xs text-zinc-400">(reserva)</span>}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <DataSaldoCell valor={c.data_saldo} onSave={v => salvar(c.conta, c.saldo, v)} />
                    {badge && <Badge variant={badge}>Desatualizado</Badge>}
                  </div>
                  {erro[c.conta] && <p className="text-3xs text-danger mt-0.5">{erro[c.conta]}</p>}
                </div>
                <SaldoCell valor={c.saldo} onSave={v => salvar(c.conta, v, c.data_saldo)} />
              </div>
            )
          })}
        </ScrollAutoHide>
      </div>
    </div>
  )
}

/** Saldo — clique para editar (mirror de NumCell em gerencial/contas-manager.tsx: input
 *  texto, parse com `toNum` canônico no blur/Enter, Esc cancela, campo vazio → 0 — sem
 *  importar o módulo gerencial). */
function SaldoCell({ valor, onSave }: { valor: number; onSave: (v: number) => Promise<void> }) {
  const [editando, setEditando] = useState(false)
  const [txt, setTxt] = useState(editStr(valor))
  const [saving, setSaving] = useState(false)

  const salvar = async () => {
    const vazio = txt.trim() === ''
    const num = vazio ? 0 : toNum(txt)
    if (!vazio && num === null) { setTxt(editStr(valor)); setEditando(false); return }
    if (num === valor) { setEditando(false); return }
    setSaving(true); await onSave(num as number); setSaving(false); setEditando(false)
  }
  if (editando) {
    return (
      <input
        autoFocus value={txt} onChange={e => setTxt(e.target.value)} onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') salvar(); if (e.key === 'Escape') { setTxt(editStr(valor)); setEditando(false) } }}
        className="w-28 text-right text-xs border border-[var(--brand)] rounded px-1 py-0.5 outline-none tabular-nums shrink-0"
      />
    )
  }
  return (
    <button onClick={() => { setTxt(editStr(valor)); setEditando(true) }}
      className="text-xs font-semibold tabular-nums shrink-0 hover:text-[var(--brand)] transition-colors"
      style={{ color: valor >= 0 ? 'var(--positive)' : 'var(--negative)' }}
      title="Clique para editar">
      {saving ? '…' : fmtBRL2(valor)}
    </button>
  )
}

/** Data a que o saldo se refere — clique para editar (mirror de DataSaldoCell em
 *  gerencial/contas-cards.tsx: `<input type="date">` nativo, blur/Enter salva). O texto
 *  exibido em repouso é o STALENESS; a data exata fica no `title`. */
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
      className={`text-3xs hover:text-[var(--brand)] transition-colors ${cor}`}
      title={valor ? `Saldo referente a ${fmtDate(valor)} — clique para editar` : 'Sem data informada — clique para preencher'}>
      {saving ? '…' : texto}
    </button>
  )
}
