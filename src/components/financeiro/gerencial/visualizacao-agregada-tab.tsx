'use client'
import { useState, useMemo } from 'react'
import { format, parseISO, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
// v4.22.1 — cor do TEXTO do saldo por sinal (≥0 verde / <0 vermelho), somada ao fundo de faixa.
// v4.24.1 — tokens BASE (--positive/--negative), não -deep: os -deep eram quase pretos e
// positivo/negativo liam-se quase iguais; os base são nitidamente verde/vermelho e legíveis
// tanto sobre branco quanto sobre as faixas claras (bg-success-bg/bg-danger-bg).
function corTextoSaldo(v: number): string {
  return v >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'
}

export default function VisualizacaoAgregadaTab({ saldos, projecao }: Props) {
  const [contas, setContas] = useState<Conta[]>(saldos)
  // Re-sincroniza com o servidor quando os saldos mudam (router.refresh após mutações).
  // Padrão React "ajustar estado na renderização" (sem efeito) — o ContasManager já
  // atualiza `contas` otimisticamente; isto cobre revalidações vindas do servidor.
  const [prevSaldos, setPrevSaldos] = useState(saldos)
  if (saldos !== prevSaldos) { setPrevSaldos(saldos); setContas(saldos) }

  const [gerirOpen, setGerirOpen] = useState(false)
  // v4.22.1 — janela de exibição da projeção: data inicial (default = hoje, a 1ª data vinda do
  // servidor → dinâmico, vira o dia o default acompanha) + horizonte (15/30 dias). A projeção é
  // buscada a partir de HOJE e o saldo acumulado roda desde hoje; aqui apenas FATIAMOS a exibição.
  const [dataInicial, setDataInicial] = useState(projecao[0]?.data ?? '')
  const [horizonte, setHorizonte]     = useState(15)
  const minData = projecao[0]?.data
  const maxData = projecao[projecao.length - 1]?.data

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

  // Fatia exibida: do `dataInicial` por `horizonte` dias (o acumulado já está correto desde hoje).
  const linhasVisiveis = useMemo(
    () => linhas.filter(l => !dataInicial || l.data >= dataInicial).slice(0, horizonte),
    [linhas, dataInicial, horizonte],
  )

  const temIsolada = isolada !== null
  const temReserva = reserva !== null
  const colSpanVazio = 4 + (temIsolada ? 1 : 0) + 1 + (temReserva ? 1 : 0)

  // v4.23.1 (item 9): linha-âncora "Saldo inicial" = abertura da janela exibida (saldo do dia
  // ANTERIOR à 1ª linha visível = saldo_da_linha − resultado_do_dia). No default (janela desde
  // hoje) é o saldo configurado das contas; numa janela futura, o acumulado até a véspera.
  const p0 = linhasVisiveis[0]
  const abertura = p0 ? {
    isolada:       p0.isolada - p0.resultado,
    consolidado:   p0.consolidado - p0.resultado,
    consolReserva: p0.consolReserva - p0.resultado,
  } : null

  return (
    <div className="space-y-6">
      {/* Contas — grade de cards com cabeçalho e botão de gestão dentro do próprio box. */}
      <ContasCards contas={contas} onContasChange={setContas} onGerir={() => setGerirOpen(true)} />

      {gerirOpen && (
        <ListDrawer titulo="Gerenciar contas"
          subtitulo="Configure limite, consolidação e papel de cada conta"
          onClose={() => setGerirOpen(false)}>
          <ContasManager contas={contas} onContasChange={setContas} />
        </ListDrawer>
      )}

      <div className="bg-white rounded-xl shadow-sm px-5 py-4 overflow-x-auto">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">Projeção Diária</p>
          {projecao.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                A partir de
                <input type="date" value={dataInicial} min={minData} max={maxData}
                  onChange={e => setDataInicial(e.target.value || minData || '')}
                  className="text-[11px] border border-zinc-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-brand" />
              </label>
              <select value={horizonte} onChange={e => setHorizonte(Number(e.target.value))}
                aria-label="Horizonte da projeção"
                className="text-[11px] border border-zinc-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-brand">
                <option value={15}>15 dias</option>
                <option value={30}>30 dias</option>
              </select>
            </div>
          )}
        </div>
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
                <th className="py-2 px-2 text-right">Resultado do Dia</th>
                {temIsolada && <th className="py-2 px-2 text-right">Saldo {isolada!.conta} (Final)</th>}
                <th className="py-2 px-2 text-right">Consolidado (Final)</th>
                {temReserva && <th className="py-2 px-2 text-right">Consol.+{reserva!.conta} (Final)</th>}
              </tr>
            </thead>
            <tbody>
              {/* Linha-âncora fixa: saldo inicial da janela (item 9). Fluxos travados em traço. */}
              {abertura && (
                <tr className="border-b border-zinc-100 bg-zinc-50/70">
                  <td className="py-1.5 px-2 font-medium text-[var(--text-muted)]">Saldo inicial</td>
                  <td className="py-1.5 px-2"><span className="block text-right text-zinc-300">—</span></td>
                  <td className="py-1.5 px-2"><span className="block text-right text-zinc-300">—</span></td>
                  <td className="py-1.5 px-2"><span className="block text-right text-zinc-300">—</span></td>
                  {temIsolada && (
                    <td className="py-1.5 px-2"><ValorContabil valor={abertura.isolada} className={`font-medium ${corTextoSaldo(abertura.isolada)}`} /></td>
                  )}
                  <td className="py-1.5 px-2"><ValorContabil valor={abertura.consolidado} className={`font-medium ${corTextoSaldo(abertura.consolidado)}`} /></td>
                  {temReserva && (
                    <td className="py-1.5 px-2"><ValorContabil valor={abertura.consolReserva} className={`font-medium ${corTextoSaldo(abertura.consolReserva)}`} /></td>
                  )}
                </tr>
              )}
              {linhasVisiveis.map(l => {
                const hoje = isToday(parseISO(l.data))
                return (
                  <tr key={l.data} className={`border-b border-zinc-50 ${hoje ? 'bg-warning-bg' : ''}`}>
                    <td className={`py-1.5 px-2 font-medium ${hoje ? 'text-warning' : ''}`}>
                      {format(parseISO(l.data), 'dd/MMM', { locale: ptBR })}
                      {hoje && <span className="ml-1 text-[10px] text-warning">hoje</span>}
                    </td>
                    {/* Fluxos: sem fundo, cor só no número (M3). */}
                    <td className="py-1.5 px-2">
                      {l.a_receber > 0
                        ? <ValorContabil valor={l.a_receber} className="text-[var(--positive)]" />
                        : <span className="block text-right text-zinc-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      {l.a_pagar > 0
                        ? <ValorContabil valor={l.a_pagar} className="text-[var(--negative)]" />
                        : <span className="block text-right text-zinc-300">—</span>}
                    </td>
                    <td className="py-1.5 px-2">
                      <ValorContabil valor={l.resultado}
                        className={`font-medium ${l.resultado >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}`} />
                    </td>
                    {/* Saldos: fundo de faixa no <td> (M4) + TEXTO por sinal ≥0 verde / <0 vermelho (v4.22.1). */}
                    {temIsolada && (
                      <td className={`py-1.5 px-2 ${corIsolada(l.isolada, isoladaLimite)}`}>
                        <ValorContabil valor={l.isolada} className={`font-medium ${corTextoSaldo(l.isolada)}`} />
                      </td>
                    )}
                    <td className={`py-1.5 px-2 ${corDuasFaixas(l.consolidado)}`}>
                      <ValorContabil valor={l.consolidado} className={`font-medium ${corTextoSaldo(l.consolidado)}`} />
                    </td>
                    {temReserva && (
                      <td className={`py-1.5 px-2 ${corDuasFaixas(l.consolReserva)}`}>
                        <ValorContabil valor={l.consolReserva} className={`font-medium ${corTextoSaldo(l.consolReserva)}`} />
                      </td>
                    )}
                  </tr>
                )
              })}
              {linhasVisiveis.length === 0 && (
                <tr><td colSpan={colSpanVazio} className="py-6 text-center text-sm text-zinc-400">Sem dias no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
