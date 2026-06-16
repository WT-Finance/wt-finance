'use client'
import { useState, useMemo } from 'react'
import { format, parseISO, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { fmtBRL } from '@/lib/fmt'
import ContasManager from './contas-manager'
import type { Conta, DiaProjecao } from './tipos'

// v4.21.0 (M3+M4) — Visualização Agregada DATA-DRIVEN: as 3 projeções saem das contas
// configuráveis (papéis isolada/reserva + marca-consolidado), SEM nomes hardcoded.
//
// DECISÃO DE MODELO (v4.21): a agregada NÃO distribui o fluxo por conta. As 3 colunas são o
// MESMO resultado diário (a_receber − a_pagar de TODAS as linhas; conta_previsao irrelevante)
// sobre 3 bases de saldo inicial:
//   • Isolada      = saldo da conta 'isolada'                       + resultado acumulado
//   • Consolidado  = soma dos saldos das contas marcadas consolidado + resultado acumulado
//   • Consol.+res. = Consolidado + saldo da conta 'reserva'          + resultado acumulado

interface Props {
  saldos: Conta[]
  projecao: DiaProjecao[]
}

// ── Faixas de cor (tokens semânticos) ───────────────────────────────────────
// Isolada: 3 faixas quando tem limite (>0): < −limite vermelho; [−limite,0) amarelo; ≥0 verde.
function corIsolada(v: number, limite: number | null): string {
  if (limite != null && limite > 0) {
    if (v < -limite) return 'text-[var(--danger)]'
    if (v < 0)       return 'text-[var(--warning)]'
    return 'text-[var(--success)]'
  }
  return v < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'
}
// Consolidado / Consol.+reserva: 2 faixas (sem amarelo).
function corDuasFaixas(v: number): string {
  return v < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'
}

export default function VisualizacaoAgregadaTab({ saldos, projecao }: Props) {
  const [contas, setContas] = useState<Conta[]>(saldos)
  // Re-sincroniza com o servidor quando os saldos mudam (router.refresh após mutações).
  // Padrão React "ajustar estado na renderização" (sem efeito) — o ContasManager já
  // atualiza `contas` otimisticamente; isto cobre revalidações vindas do servidor.
  const [prevSaldos, setPrevSaldos] = useState(saldos)
  if (saldos !== prevSaldos) { setPrevSaldos(saldos); setContas(saldos) }

  const { linhas, isolada, reserva, isoladaLimite } = useMemo(() => {
    const isoladaConta = contas.find(c => c.papel === 'isolada') ?? null
    const reservaConta = contas.find(c => c.papel === 'reserva') ?? null
    const isoladaBase     = isoladaConta?.saldo ?? 0
    const consolidadoBase = contas.filter(c => c.consolidado).reduce((s, c) => s + c.saldo, 0)
    const reservaBase     = consolidadoBase + (reservaConta?.saldo ?? 0)

    let acc = 0
    const rows = projecao.map(d => {
      acc += d.resultado
      return {
        ...d,
        isolada:      isoladaBase + acc,
        consolidado:  consolidadoBase + acc,
        consolReserva: reservaBase + acc,
      }
    })
    return { linhas: rows, isolada: isoladaConta, reserva: reservaConta, isoladaLimite: isoladaConta?.limite ?? null }
  }, [contas, projecao])

  const temIsolada = isolada !== null
  const temReserva = reserva !== null
  const colSpanVazio = 4 + (temIsolada ? 1 : 0) + 1 + (temReserva ? 1 : 0)

  return (
    <div className="space-y-6">
      <ContasManager contas={contas} onContasChange={setContas} />

      <div className="bg-white rounded-xl shadow-sm px-5 py-4 overflow-x-auto">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">Projeção Diária</p>
        {projecao.length === 0 ? (
          <p className="text-sm text-zinc-400 py-8 text-center">
            Nenhum lançamento cadastrado. Importe a planilha ou adicione linhas manualmente na aba Base de Dados.
          </p>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-xs font-medium text-zinc-400 border-b border-zinc-100">
                <th className="py-2 px-2 text-left">Dia</th>
                <th className="py-2 px-2 text-right">A Receber</th>
                <th className="py-2 px-2 text-right">A Pagar</th>
                <th className="py-2 px-2 text-right">Resultado</th>
                {temIsolada && <th className="py-2 px-2 text-right">Saldo {isolada!.conta}</th>}
                <th className="py-2 px-2 text-right">Consolidado</th>
                {temReserva && <th className="py-2 px-2 text-right">Consol.+{reserva!.conta}</th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const hoje = isToday(parseISO(l.data))
                return (
                  <tr key={l.data} className={`border-b border-zinc-50 ${hoje ? 'bg-amber-50' : ''}`}>
                    <td className={`py-1.5 px-2 font-medium ${hoje ? 'text-amber-700' : ''}`}>
                      {format(parseISO(l.data), 'dd/MMM', { locale: ptBR })}
                      {hoje && <span className="ml-1 text-[10px] text-amber-600">hoje</span>}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--positive-deep)]">
                      {l.a_receber > 0 ? fmtBRL(l.a_receber) : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-[var(--negative-deep)]">
                      {l.a_pagar > 0 ? fmtBRL(l.a_pagar) : '—'}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${l.resultado >= 0 ? 'text-[var(--positive-deep)]' : 'text-[var(--negative-deep)]'}`}>
                      {fmtBRL(l.resultado)}
                    </td>
                    {temIsolada && (
                      <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${corIsolada(l.isolada, isoladaLimite)}`}>
                        {fmtBRL(l.isolada)}
                      </td>
                    )}
                    <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${corDuasFaixas(l.consolidado)}`}>
                      {fmtBRL(l.consolidado)}
                    </td>
                    {temReserva && (
                      <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${corDuasFaixas(l.consolReserva)}`}>
                        {fmtBRL(l.consolReserva)}
                      </td>
                    )}
                  </tr>
                )
              })}
              {linhas.length === 0 && (
                <tr><td colSpan={colSpanVazio} className="py-6 text-center text-sm text-zinc-400">Sem projeção.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
