'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import Badge from '@/components/ui/badge'
import Tooltip from '@/components/ui/tooltip'
import { fmtMi, fmtBRL2, fmtDate } from '@/lib/fmt'
import { toNum } from '@/lib/carga/coercao'
import { atualizarSaldoCaixaAction } from '@/app/financeiro/fluxo-caixa/actions'
import type { SaldoCaixaConta, PrevistoDiario } from '@/lib/fluxo/rpc-fluxo'

// Posição do Fluxo Projetado (v5.2.0, checkpoint — modelo do mockup + refinos):
// os 4 KPI cards viraram UM card — bloco Saldo de Caixa | A receber · A pagar · NCG
// (células distribuídas na largura toda) com HORIZONTE AJUSTÁVEL ABAIXO dos indicadores:
// slider fluido com régua de marcações (Dias ≤180 / Meses ≤18) + seletor de modo em
// RÁDIO à direita (Dias/Meses/Sempre). A janela é somada NO CLIENTE sobre a série diária
// (get_fluxo_previsto_diario, 0196) — slider instantâneo, sem RPC por ajuste. Semântica
// idêntica ao card antigo de 10 dias: vencimento em hoje..hoje+N inclusive, vencidos FORA;
// "Sempre" = todo o lançado (inclui o balde de vencidos), dentro do corte.
//
// Saldo de Caixa: OPERACIONAL = contas reserva=false; a Reserva aparece separada, nunca
// somada. Fonte = tabela própria financeiro.saldo_caixa (get_saldo_caixa/atualizar_saldo_
// caixa, 0194), desconectada do Gerencial. "Editar saldos ›" abre o modal EDITÁVEL
// (saldo + data por conta) — idioma de edição MIRRORED de gerencial/contas-cards.tsx,
// mantido local (o desacoplamento é o ponto).
//
// `data_saldo` é DATE PURO (sem fuso) — nunca `new Date(dataSaldo)`/fmtDataSP nele (o
// construtor trata data-only como meia-noite UTC e o dia "volta" em fuso negativo; landmine
// documentada em gerencial/contas-cards.tsx). Usa-se `fmtDate` (split de string, sem
// conversão) e a comparação por componentes abaixo — igual ao padrão já adotado ali.

interface Props {
  /** RPC get_saldo_caixa(). Vazio quando o usuário não tem financeiro/fluxo-caixa
   *  (a página degrada o KPI para "—" em vez de quebrar — RBAC próprio da RPC). */
  saldos: SaldoCaixaConta[]
  /** RPC get_fluxo_previsto_diario() (0196) — série diária que o horizonte soma. */
  previsto: PrevistoDiario
}

// ── Horizonte ajustável ───────────────────────────────────────────────────────

type Modo = 'dias' | 'meses' | 'sempre'

const HORIZONTE: Record<'dias' | 'meses', { min: number; max: number; padrao: number; menor: number; maiores: number[] }> = {
  dias:  { min: 1, max: 180, padrao: 10, menor: 10, maiores: [30, 60, 90, 120, 150, 180] },
  meses: { min: 1, max: 18,  padrao: 3,  menor: 1,  maiores: [3, 6, 9, 12, 15, 18] },
}

/** ISO + n dias (aritmética UTC pura sobre a string — sem fuso). */
function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** ISO + n meses de CALENDÁRIO, com CLAMP no fim do mês-alvo (31/jan + 1m → 28/fev,
 *  nunca "rola" para março — senão o rótulo "próx. 1 mês" somaria dias do mês seguinte;
 *  achado MÉDIO do revisor endereçado). */
function somarMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const ultimoDia = new Date(Date.UTC(y, m + n, 0)).getUTCDate() // dia 0 do mês seguinte ao alvo
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, ultimoDia))).toISOString().slice(0, 10)
}

/** Soma a janela do horizonte sobre a série diária (strings ISO comparam cronológico). */
function somarJanela(previsto: PrevistoDiario, modo: Modo, valor: number) {
  if (modo === 'sempre') {
    let rec = previsto.vencido_r, pag = previsto.vencido_p
    for (const dia of previsto.dias) { rec += dia.r; pag += dia.p }
    return { rec, pag, rotulo: 'todo o lançado' }
  }
  const hoje   = hojeSP()
  const limite = modo === 'dias' ? somarDias(hoje, valor) : somarMeses(hoje, valor)
  let rec = 0, pag = 0
  for (const dia of previsto.dias) {
    if (dia.d > limite) break // série vem ordenada ASC da RPC
    rec += dia.r; pag += dia.p
  }
  const unidade = modo === 'dias' ? (valor === 1 ? 'dia' : 'dias') : (valor === 1 ? 'mês' : 'meses')
  return { rec, pag, rotulo: `próx. ${valor} ${unidade}` }
}

/** Posição na régua do slider (compensa a meia-largura do thumb, ~7px). */
function posTick(f: number): string {
  return `calc(7px + ${(f * 100).toFixed(2)}% - ${(f * 14).toFixed(2)}px)`
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

export default function PosicaoProjetado({ saldos, previsto }: Props) {
  const [drillOpen, setDrillOpen] = useState(false)
  const [modo, setModo]           = useState<Modo>('dias')
  const [valor, setValor]         = useState(HORIZONTE.dias.padrao)

  const { rec, pag, rotulo } = useMemo(() => somarJanela(previsto, modo, valor), [previsto, modo, valor])
  // NCG = A PAGAR − A RECEBER (ajuste do checkpoint): positivo = FALTA caixa no horizonte
  // (vermelho); negativo = sobra (verde). Inverte o sinal e a cor do card antigo.
  const ncg = pag - rec

  const operacionais     = saldos.filter(c => !c.reserva)
  const reservas         = saldos.filter(c => c.reserva)
  const saldoOperacional = operacionais.reduce((s, c) => s + c.saldo, 0)
  const saldoReserva     = reservas.reduce((s, c) => s + c.saldo, 0)

  const trocarModo = (m: Modo) => {
    setModo(m)
    if (m !== 'sempre') setValor(HORIZONTE[m].padrao)
  }

  const cfg = modo === 'sempre' ? null : HORIZONTE[modo]

  return (
    <>
      <div className="rounded-xl shadow-sm bg-white px-5 py-4 flex flex-col md:flex-row gap-4 md:gap-6">
        {/* ── Saldo de Caixa (imune ao horizonte) ─────────────────────────── */}
        <div className="md:min-w-[190px] md:pr-6 md:border-r pb-3 md:pb-0 border-b md:border-b-0 border-zinc-100 flex flex-col">
          <p className="text-2xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Saldo de Caixa</p>
          <p className="text-3xs text-zinc-400 mb-2">operacional · exclui reserva</p>
          {saldos.length === 0 ? (
            <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-muted)' }}>—</p>
          ) : (
            <>
              <p
                className="text-2xl font-bold tabular-nums"
                style={{ color: saldoOperacional >= 0 ? 'var(--text-primary)' : 'var(--danger)' }}
              >
                {fmtMi(saldoOperacional)}
              </p>
              {reservas.length > 0 && (
                <p className="text-2xs mt-1" style={{ color: 'var(--text-muted)' }}>+ {fmtMi(saldoReserva)} em reserva</p>
              )}
              <button
                onClick={() => setDrillOpen(true)}
                className="mt-auto pt-2 self-start text-2xs font-medium text-[var(--brand)] hover:underline"
              >
                Editar saldos ›
              </button>
            </>
          )}
        </div>

        {/* ── A receber · A pagar · NCG + controle de horizonte ABAIXO ────── */}
        <div className="flex-1 flex flex-col justify-between gap-y-4">
          <div className="flex flex-wrap gap-y-3">
            <KpiJanela label="A Receber" valor={rec} primeiro />
            <KpiJanela label="A Pagar"   valor={pag} />
            <KpiJanela
              label="NCG"
              valor={ncg}
              cor={ncg > 0 ? 'var(--negative)' : 'var(--positive)'}
              tooltip="Necessidade de Capital de Giro: A Pagar − A Receber no horizonte selecionado. Positiva (vermelha) = falta caixa; negativa (verde) = sobra."
            />
          </div>

          {/* Controle do horizonte — abaixo dos indicadores (checkpoint): slider ocupa
              TODO o espaço restante (largura estável — o rótulo e os rádios têm largura
              fixa, então o slider não "pula" ao trocar o modo); seletor de modo à
              DIREITA, como grupo de RÁDIO. */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-px flex-1 min-w-[260px]">
              <input
                type="range"
                min={cfg?.min ?? 1}
                max={cfg?.max ?? 180}
                value={valor}
                disabled={!cfg}
                onChange={e => setValor(Number(e.target.value))}
                aria-label="Horizonte"
                className="w-full disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
                style={{ accentColor: 'var(--text-secondary)' }}
              />
              {/* régua de marcações — riscos menores + rótulo nos marcos (% da largura,
                  compensando a meia-largura do thumb — funciona com o slider fluido) */}
              <div className="relative h-[15px] w-full" aria-hidden>
                {cfg && Array.from({ length: Math.floor((cfg.max - cfg.menor) / cfg.menor) + 1 }, (_, i) => {
                  const v = cfg.menor * (i + 1)
                  const f = (v - cfg.min) / (cfg.max - cfg.min)
                  const marco = cfg.maiores.includes(v)
                  return (
                    <span key={v}>
                      <span
                        className="absolute top-px w-px bg-zinc-300"
                        style={{ left: posTick(f), height: marco ? 6 : 4, opacity: marco ? 0.9 : 0.55 }}
                      />
                      {marco && (
                        <span className="absolute top-1.5 -translate-x-1/2 text-[9.5px] text-zinc-400 tabular-nums" style={{ left: posTick(f) }}>
                          {v}
                        </span>
                      )}
                    </span>
                  )
                })}
              </div>
            </div>
            {/* larguras FIXAS (rótulo + rádios) — o slider flex-1 não muda ao trocar o modo */}
            <span className="text-2xs text-zinc-500 tabular-nums w-[104px] shrink-0">{rotulo}</span>
            <div role="radiogroup" aria-label="Unidade do horizonte" className="flex items-center gap-3 shrink-0">
              {([['dias', 'Dias'], ['meses', 'Meses'], ['sempre', 'Sempre']] as [Modo, string][]).map(([v, l]) => (
                <label key={v} className="flex items-center gap-1.5 text-2xs text-zinc-600 cursor-pointer">
                  <input
                    type="radio"
                    name="horizonte-modo"
                    value={v}
                    checked={modo === v}
                    onChange={() => trocarModo(v)}
                    className="cursor-pointer"
                    style={{ accentColor: 'var(--brand)' }}
                  />
                  {l}
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {drillOpen && (
        <SaldoDrillModal saldosIniciais={saldos} onClose={() => setDrillOpen(false)} />
      )}
    </>
  )
}

/** Célula de KPI do card de posição — divisória vertical entre as células (padrão do
 *  card Faturamento/Receita/Margem da Executiva). */
function KpiJanela({ label, valor, cor, tooltip, primeiro = false }: {
  label:     string
  valor:     number
  cor?:      string
  tooltip?:  string
  primeiro?: boolean
}) {
  const rotulo = (
    <p className="text-2xs font-semibold uppercase tracking-wide inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
      {label}
      {tooltip && (
        <Tooltip conteudo={tooltip} className="z-30 w-64 !whitespace-normal font-normal normal-case tracking-normal leading-snug">
          <span aria-label={`Ajuda sobre ${label}`} className="inline-flex h-3 w-3 items-center justify-center rounded-full border border-zinc-300 text-[8px] font-semibold leading-none text-zinc-400">?</span>
        </Tooltip>
      )}
    </p>
  )
  return (
    <div className={`flex-1 min-w-[120px] ${primeiro ? 'pr-7' : 'px-7 border-l border-zinc-100'}`}>
      {rotulo}
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color: cor ?? 'var(--text-primary)' }}>
        {fmtMi(valor)}
      </p>
    </div>
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
