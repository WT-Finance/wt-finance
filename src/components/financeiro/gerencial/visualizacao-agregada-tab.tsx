'use client'
import { useState, useMemo } from 'react'
import { format, parseISO, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Settings } from 'lucide-react'
import ListDrawer from '@/components/shared/list-drawer'
import { ValorContabil } from '@/components/shared/valor-contabil'
import ContasManager from './contas-manager'
import ContasCards from './contas-cards'
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
//
// v4.22 (M1/M3/M4): grade de cards de saldo sempre visível + gestão movida para um ListDrawer
// (botão engrenagem). Valores monetários em formato contábil (<ValorContabil>); faixa de cor
// aplicada ao FUNDO do <td> de saldo (M4), texto escuro/legível por cima.

interface Props {
  saldos: Conta[]
  projecao: DiaProjecao[]
}

// ── Faixas de cor (tokens semânticos) — classe de FUNDO do <td> (v4.22, M4) ─────────────────
// Principal: 3 faixas quando tem limite (>0): < −limite vermelho; [−limite,0) amarelo; ≥0 verde.
function corIsolada(v: number, limite: number | null): string {
  if (limite != null && limite > 0) {
    if (v < -limite) return 'bg-danger-bg'
    if (v < 0)       return 'bg-warning-bg'
    return 'bg-success-bg'
  }
  return v < 0 ? 'bg-danger-bg' : 'bg-success-bg'
}
// Consolidado / Consol.+reserva: 2 faixas (sem amarelo).
function corDuasFaixas(v: number): string {
  return v < 0 ? 'bg-danger-bg' : 'bg-success-bg'
}

export default function VisualizacaoAgregadaTab({ saldos, projecao }: Props) {
  const [contas, setContas] = useState<Conta[]>(saldos)
  // Re-sincroniza com o servidor quando os saldos mudam (router.refresh após mutações).
  // Padrão React "ajustar estado na renderização" (sem efeito) — o ContasManager já
  // atualiza `contas` otimisticamente; isto cobre revalidações vindas do servidor.
  const [prevSaldos, setPrevSaldos] = useState(saldos)
  if (saldos !== prevSaldos) { setPrevSaldos(saldos); setContas(saldos) }

  const [gerirOpen, setGerirOpen] = useState(false)

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
      {/* Contas — grade de cards (saldo editável inline) + acesso à gestão (drawer). */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Contas</p>
          <button onClick={() => setGerirOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-zinc-200 rounded hover:border-zinc-300 transition-colors foco-neutro">
            <Settings size={13} /> Gerenciar contas
          </button>
        </div>
        <ContasCards contas={contas} onContasChange={setContas} />
      </div>

      {gerirOpen && (
        <ListDrawer titulo="Gerenciar contas"
          subtitulo="Configure limite, consolidação e papel de cada conta. O saldo inicial é editado nos cartões."
          onClose={() => setGerirOpen(false)}>
          <ContasManager contas={contas} onContasChange={setContas} />
        </ListDrawer>
      )}

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
                    {/* Fluxos: sem fundo, cor só no número (M3). */}
                    <td className="py-1.5 px-2">
                      {l.a_receber > 0
                        ? <ValorContabil valor={l.a_receber} className="text-[var(--positive-deep)]" />
                        : <span className="block text-right text-zinc-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      {l.a_pagar > 0
                        ? <ValorContabil valor={l.a_pagar} className="text-[var(--negative-deep)]" />
                        : <span className="block text-right text-zinc-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      <ValorContabil valor={l.resultado}
                        className={`font-medium ${l.resultado >= 0 ? 'text-[var(--positive-deep)]' : 'text-[var(--negative-deep)]'}`} />
                    </td>
                    {/* Saldos: faixa de cor no FUNDO do <td> (M4); número escuro/legível (M3). */}
                    {temIsolada && (
                      <td className={`py-1.5 px-2 ${corIsolada(l.isolada, isoladaLimite)}`}>
                        <ValorContabil valor={l.isolada} className="font-medium text-[var(--text-primary)]" />
                      </td>
                    )}
                    <td className={`py-1.5 px-2 ${corDuasFaixas(l.consolidado)}`}>
                      <ValorContabil valor={l.consolidado} className="font-medium text-[var(--text-primary)]" />
                    </td>
                    {temReserva && (
                      <td className={`py-1.5 px-2 ${corDuasFaixas(l.consolReserva)}`}>
                        <ValorContabil valor={l.consolReserva} className="font-medium text-[var(--text-primary)]" />
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
