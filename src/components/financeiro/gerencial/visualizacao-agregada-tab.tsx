'use client'
import { useState }                    from 'react'
import { useRouter }                   from 'next/navigation'
import { format, parseISO, isToday }   from 'date-fns'
import { ptBR }                        from 'date-fns/locale'
import { updateSaldo }                 from '@/app/financeiro/fluxo-caixa/gerencial/actions'
import { fmtBRL }                      from '@/lib/fmt'

interface Saldo {
  conta: string
  saldo: number
  ordem: number
}

interface DiaProjecao {
  data: string       // YYYY-MM-DD
  a_receber: number
  a_pagar: number
  resultado: number
}

interface Props {
  saldos: Saldo[]
  projecao: DiaProjecao[]
}

// ─── SaldoInput ──────────────────────────────────────────────────────────────

function SaldoInput({ conta, saldo, onSave }: { conta: string; saldo: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [valor, setValor]     = useState(saldo.toFixed(2))
  const [saving, setSaving]   = useState(false)

  const handleBlur = async () => {
    const num = parseFloat(valor.replace(',', '.'))
    if (isNaN(num) || num === saldo) { setEditing(false); return }
    setSaving(true)
    await onSave(num)
    setSaving(false)
    setEditing(false)
  }

  return (
    <div className="text-center">
      <p className="text-[10px] text-zinc-400 mb-1">{conta}</p>
      {editing ? (
        <input
          autoFocus
          value={valor}
          onChange={e => setValor(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => { if (e.key === 'Enter') handleBlur() }}
          className="w-24 text-center text-sm border border-[var(--brand)] rounded px-1 py-0.5 outline-none"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm font-semibold tabular-nums hover:text-[var(--brand)] transition-colors"
          title="Clique para editar"
        >
          {saving ? '...' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldo)}
        </button>
      )}
    </div>
  )
}

// ─── VisualizacaoAgregadaTab ─────────────────────────────────────────────────

export default function VisualizacaoAgregadaTab({ saldos: saldosIniciais, projecao }: Props) {
  const [saldos, setSaldos] = useState(saldosIniciais)
  const router = useRouter()

  const handleSaldoSave = async (conta: string, novoValor: number) => {
    const res = await updateSaldo(conta, novoValor)
    if (res.success) {
      setSaldos(prev => prev.map(s => s.conta === conta ? { ...s, saldo: novoValor } : s))
      router.refresh()
    }
  }

  // Cálculo idêntico à planilha Excel
  const itau0    = saldos.find(s => s.conta === 'Itaú')?.saldo    || 0
  const asaas0   = saldos.find(s => s.conta === 'Asaas')?.saldo   || 0
  const blimboo0 = saldos.find(s => s.conta === 'Blimboo')?.saldo || 0
  const clara0   = saldos.find(s => s.conta === 'Clara')?.saldo   || 0

  let saldoItau = itau0
  const linhas = projecao.map(d => {
    saldoItau += d.resultado
    const consolidado      = saldoItau + asaas0 + blimboo0
    const consolidadoClara = consolidado + clara0
    return { ...d, saldoItau, consolidado, consolidadoClara }
  })

  return (
    <div className="space-y-6">
      {/* Saldos iniciais */}
      <div className="bg-white rounded-xl shadow-sm px-5 py-4">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">
          Saldos Iniciais
        </p>
        <div className="grid grid-cols-4 gap-4">
          {saldos.sort((a, b) => a.ordem - b.ordem).map(s => (
            <SaldoInput
              key={s.conta}
              conta={s.conta}
              saldo={s.saldo}
              onSave={(v) => handleSaldoSave(s.conta, v)}
            />
          ))}
        </div>
      </div>

      {/* Tabela de projeção */}
      <div className="bg-white rounded-xl shadow-sm px-5 py-4 overflow-x-auto">
        <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-4">
          Projeção Diária
        </p>
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
                <th className="py-2 px-2 text-right">Saldo Itaú</th>
                <th className="py-2 px-2 text-right">Consolidado</th>
                <th className="py-2 px-2 text-right">Consol.+Clara</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(l => {
                const hoje = isToday(parseISO(l.data))
                return (
                  <tr
                    key={l.data}
                    className={`border-b border-zinc-50 ${hoje ? 'bg-amber-50' : ''}`}
                  >
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
                    <td className={`py-1.5 px-2 text-right tabular-nums ${l.saldoItau < 0 ? 'text-[var(--negative-deep)] font-semibold' : ''}`}>
                      {fmtBRL(l.saldoItau)}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums ${l.consolidado < 0 ? 'text-[var(--negative-deep)] font-semibold' : ''}`}>
                      {fmtBRL(l.consolidado)}
                    </td>
                    <td className={`py-1.5 px-2 text-right tabular-nums ${l.consolidadoClara < 0 ? 'text-[var(--negative-deep)] font-semibold' : ''}`}>
                      {fmtBRL(l.consolidadoClara)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
