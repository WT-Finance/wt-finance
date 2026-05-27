'use client'

import { useState, useTransition } from 'react'
import { salvarClassificacaoContas } from './actions'

interface ContaBancaria {
  id: number
  conta: string
  tipo: string
  eh_cartao_credito: boolean
}

interface ContasBancariasFormProps {
  contas: ContaBancaria[]
  tiposValidos: string[]
}

export default function ContasBancariasForm({ contas, tiposValidos }: ContasBancariasFormProps) {
  const [estado, setEstado] = useState<ContaBancaria[]>(contas)
  const [isPending, startTransition] = useTransition()
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  function setTipo(id: number, tipo: string) {
    setEstado(prev => prev.map(c => c.id === id ? { ...c, tipo } : c))
  }

  function setCartao(id: number, eh_cartao_credito: boolean) {
    setEstado(prev => prev.map(c => c.id === id ? { ...c, eh_cartao_credito } : c))
  }

  function handleSalvar() {
    setMensagem(null)
    startTransition(async () => {
      try {
        await salvarClassificacaoContas(
          estado.map(c => ({ id: c.id, tipo: c.tipo, eh_cartao_credito: c.eh_cartao_credito }))
        )
        setMensagem({ tipo: 'sucesso', texto: `${estado.length} conta(s) salva(s) com sucesso. Recarregue a página para ver a lista atualizada.` })
      } catch (err) {
        setMensagem({ tipo: 'erro', texto: err instanceof Error ? err.message : 'Erro ao salvar' })
      }
    })
  }

  return (
    <div>
      <div className="space-y-3 mb-4">
        {estado.map(c => (
          <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-amber-100 last:border-0">
            <span className="flex-1 text-sm font-medium text-zinc-800 min-w-0 truncate">{c.conta}</span>
            <div className="flex items-center gap-3 shrink-0">
              <select
                value={c.tipo}
                onChange={e => setTipo(c.id, e.target.value)}
                className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 bg-white text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                disabled={isPending}
              >
                {tiposValidos.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-zinc-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={c.eh_cartao_credito}
                  onChange={e => setCartao(c.id, e.target.checked)}
                  disabled={isPending}
                  className="rounded"
                />
                Cartão de crédito
              </label>
            </div>
          </div>
        ))}
      </div>

      {mensagem && (
        <p className={`text-xs mb-3 ${mensagem.tipo === 'sucesso' ? 'text-emerald-600' : 'text-red-600'}`}>
          {mensagem.texto}
        </p>
      )}

      <button
        onClick={handleSalvar}
        disabled={isPending}
        className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
      >
        {isPending ? 'Salvando…' : 'Salvar alterações'}
      </button>
    </div>
  )
}
