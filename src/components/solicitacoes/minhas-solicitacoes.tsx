'use client'

import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { STATUS_LABEL, statusBadge, fmtDataBR, resumo, vencida } from '@/lib/solicitacoes/format'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

export default function MinhasSolicitacoes({ solicitacoes, onAbrir }: {
  solicitacoes: Solicitacao[]; onAbrir: (s: Solicitacao) => void
}) {
  return (
    <CardTabela titulo="Minhas solicitações">
      {solicitacoes.length === 0 ? (
        <p className="px-3 py-8 text-center text-sm text-zinc-400">Você ainda não abriu nenhuma solicitação.</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup><col className="w-[40%]" /><col className="w-[22%]" /><col className="w-[16%]" /><col className="w-[22%]" /></colgroup>
          <thead><tr className="border-b border-zinc-100 text-left">
            <th className={`${CARD_TABELA_TH} text-left`}>Solicitação</th>
            <th className={`${CARD_TABELA_TH} text-left`}>Destinatário</th>
            <th className={`${CARD_TABELA_TH} text-left`}>Data limite</th>
            <th className={`${CARD_TABELA_TH} text-left`}>Status</th>
          </tr></thead>
          <tbody>
            {solicitacoes.map(s => (
              <tr
                key={s.id}
                onClick={() => onAbrir(s)}
                role="button"
                tabIndex={0}
                aria-label={`Abrir solicitação: ${s.tipo_nome ?? ''}`}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(s) } }}
                className="foco-neutro cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50"
              >
                <td className="px-3 py-2.5">
                  <p className="font-medium text-zinc-900 truncate">{s.tipo_nome}</p>
                  <p className="text-xs text-zinc-500 truncate">{resumo(s.respostas)}</p>
                </td>
                <td className="px-3 py-2.5 text-zinc-600 truncate">{s.destinatario.rotulo}</td>
                <td className={`px-3 py-2.5 ${vencida(s.data_limite, s.status) ? 'font-medium text-red-600' : 'text-zinc-600'}`}>{fmtDataBR(s.data_limite)}</td>
                <td className="px-3 py-2.5"><span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge(s.status)}`}>{STATUS_LABEL[s.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CardTabela>
  )
}
