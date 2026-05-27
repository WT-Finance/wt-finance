import { getAdminClient } from '@/lib/supabase/admin'
import ContasBancariasForm from './contas-bancarias-form'

const TIPOS_VALIDOS = [
  'banco',
  'gateway',
  'carteira_interna',
  'caixa_fisico',
  'outro',
  'cartao_credito',
  'investimento',
] as const

interface ContaBancaria {
  id: number
  conta: string
  tipo: string
  eh_cartao_credito: boolean
}

export default async function ContasBancariasPage() {
  const db = getAdminClient()

  const { data: todasContas, error } = await (db as any)
    .from('financeiro.dim_conta_bancaria')
    .select('id, conta, tipo, eh_cartao_credito')
    .order('conta', { ascending: true })

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-red-600">Erro ao carregar contas: {error.message}</p>
      </div>
    )
  }

  const contas: ContaBancaria[] = (todasContas ?? []).map((c: any) => ({
    id: c.id,
    conta: c.conta,
    tipo: c.tipo ?? 'outro',
    eh_cartao_credito: c.eh_cartao_credito ?? false,
  }))

  const pendentes = contas.filter(c => c.tipo === 'outro')
  const classificadas = contas.filter(c => c.tipo !== 'outro')

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Contas Bancárias</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Classifique o tipo de cada conta em <code className="text-xs bg-zinc-100 px-1 rounded">financeiro.dim_conta_bancaria</code></p>
      </div>

      {pendentes.length === 0 ? (
        <div className="rounded-xl border border-[--border] bg-white px-5 py-4 mb-6">
          <p className="text-sm text-zinc-500">Nenhuma conta pendente de classificação.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-3">
            Pendentes de classificação ({pendentes.length})
          </p>
          <ContasBancariasForm contas={pendentes} tiposValidos={TIPOS_VALIDOS as unknown as string[]} />
        </div>
      )}

      {/* Tabela de auditoria — contas já classificadas */}
      <div className="rounded-xl border border-[--border] bg-white px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
          Classificadas ({classificadas.length})
        </p>
        {classificadas.length === 0 ? (
          <p className="text-sm text-zinc-400">Nenhuma conta classificada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 pr-4 font-medium text-zinc-500 text-xs">Conta</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500 text-xs">Tipo</th>
                <th className="text-left py-2 font-medium text-zinc-500 text-xs">Cartão de crédito</th>
              </tr>
            </thead>
            <tbody>
              {classificadas.map(c => (
                <tr key={c.id} className="border-b border-zinc-50 last:border-0">
                  <td className="py-2 pr-4 text-zinc-800">{c.conta}</td>
                  <td className="py-2 pr-4 text-zinc-500">{c.tipo}</td>
                  <td className="py-2 text-zinc-500">{c.eh_cartao_credito ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
