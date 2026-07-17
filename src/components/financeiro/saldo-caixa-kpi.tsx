'use client'

import { useState } from 'react'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Badge from '@/components/ui/badge'
import type { Conta } from '@/components/financeiro/gerencial/tipos'
import { fmtMi, fmtBRL2, fmtDate } from '@/lib/fmt'

// Saldo de Caixa (v5.2.0/Onda 1, M4) — KPI do topo do Fluxo Projetado. OPERACIONAL =
// soma dos saldos das contas com papel ≠ 'reserva' (regra do modelo §3.6: caixa
// operacional = total − reserva); a Reserva (papel='reserva', ex.: XP/Clara) é mostrada
// SEPARADA, nunca somada ao operacional. Clique abre o drill por conta, com o mesmo
// staleness (dias desde `data_saldo`) e limiares de
// src/components/financeiro/gerencial/contas-cards.tsx (rotuloStaleness, v5.2.0/M5) —
// mesma leitura de "saldo desatualizado" em toda a plataforma.
//
// `data_saldo` é DATE PURO (sem fuso) — nunca `new Date(dataSaldo)`/fmtDataSP nele (o
// construtor trata data-only como meia-noite UTC e o dia "volta" em fuso negativo; landmine
// documentada em contas-cards.tsx). Usa-se `fmtDate` (split de string, sem conversão) e a
// comparação por componentes abaixo — igual ao padrão já adotado ali.

interface Props {
  /** RPC get_gerencial_saldos(). Vazio quando o usuário não tem financeiro/gerencial
   *  (a página degrada o KPI para "—" em vez de quebrar — RBAC próprio da RPC). */
  saldos: Conta[]
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

/** Mesmos limiares de contas-cards.tsx: neutro até 3 dias, atenção 4–7, alerta >7. */
function rotuloStaleness(dias: number | null): { texto: string; cor: string; badge: 'warning' | 'danger' | null } {
  if (dias === null) return { texto: 'sem data',      cor: 'text-zinc-300', badge: null }
  if (dias < 0)       return { texto: 'data futura',   cor: 'text-zinc-400', badge: null }
  if (dias === 0)     return { texto: 'hoje',          cor: 'text-zinc-400', badge: null }
  if (dias <= 3)      return { texto: `há ${dias} dia${dias > 1 ? 's' : ''}`, cor: 'text-zinc-400', badge: null }
  if (dias <= 7)      return { texto: `há ${dias} dias`, cor: 'text-warning', badge: 'warning' }
  return                     { texto: `há ${dias} dias`, cor: 'text-danger',  badge: 'danger' }
}

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

  const operacionais = saldos.filter(c => c.papel !== 'reserva')
  const reservas      = saldos.filter(c => c.papel === 'reserva')
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
        <SaldoDrillModal saldos={saldos} onClose={() => setDrillOpen(false)} />
      )}
    </>
  )
}

function SaldoDrillModal({ saldos, onClose }: { saldos: Conta[]; onClose: () => void }) {
  const ordenados = [...saldos].sort((a, b) => a.ordem - b.ordem)

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
            const dias = diasDesde(c.data_saldo)
            const { texto, cor, badge } = rotuloStaleness(dias)
            return (
              <div key={c.conta} className="flex items-center justify-between gap-3 py-2 border-b border-zinc-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">
                    {c.conta}
                    {c.papel === 'reserva' && <span className="ml-1.5 text-3xs text-zinc-400">(reserva)</span>}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-3xs ${cor}`}
                      title={c.data_saldo ? `Saldo referente a ${fmtDate(c.data_saldo)}` : 'Sem data informada'}
                    >
                      {texto}
                    </span>
                    {badge && <Badge variant={badge}>Desatualizado</Badge>}
                  </div>
                </div>
                <p
                  className="text-xs font-semibold tabular-nums shrink-0"
                  style={{ color: c.saldo >= 0 ? 'var(--positive)' : 'var(--negative)' }}
                >
                  {fmtBRL2(c.saldo)}
                </p>
              </div>
            )
          })}
        </ScrollAutoHide>
      </div>
    </div>
  )
}
