'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { Movimentacao } from '@/lib/solicitacoes/schemas'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/admin/acessos/botoes'
import { fmtDataHoraSP } from '@/lib/fmt'

// v4.19.1 — lista única de AUDITORIA das movimentações de solicitações (gestão-only).
// Cores neutras de plataforma (sem var(--brand)); emerald/red/zinc são feedback semântico
// permitido (mesmo critério de solicitacoes/format.ts). Timestamptz (UTC) exibido no fuso de
// São Paulo via fmtDataHoraSP. Dados prontos da page (RSC) — sem interação, só leitura.

/** Tom do badge por AÇÃO: Conclusão=verde, Rejeição=vermelho, Cancelamento=neutro,
 *  Abertura=informativo. */
function acaoBadge(acao: string): string {
  switch (acao) {
    case 'Conclusão':    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    case 'Rejeição':     return 'border-red-200 bg-red-50 text-red-700'
    case 'Cancelamento': return 'border-zinc-200 bg-zinc-100 text-zinc-400'
    default:             return 'border-zinc-300 bg-zinc-100 text-zinc-600' // Abertura (informativo)
  }
}

export default function MovimentacoesContent({ movimentacoes, erroCarga }: {
  movimentacoes: Movimentacao[]; erroCarga: string | null
}) {
  const headerRight = (
    <p className="text-sm text-zinc-500">
      {movimentacoes.length === 1 ? '1 movimentação' : `${movimentacoes.length} movimentações`}
    </p>
  )

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <Link href="/solicitacoes" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
          <ArrowLeft size={13} /> Ver solicitações
        </Link>
      </div>

      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} />}

      <CardTabela titulo="Movimentações" headerRight={headerRight}>
        {/* overflow-x-auto + min-w garante leitura em telas estreitas (tabela de auditoria) */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed text-sm">
            <colgroup>
              <col className="w-44" />{/* Quando */}
              <col className="w-32" />{/* Ação */}
              <col className="w-44" />{/* Solicitação */}
              <col />{/* Quem */}
              <col />{/* Detalhe */}
            </colgroup>
            <thead>
              <tr className="border-b border-zinc-100">
                <th className={`${CARD_TABELA_TH} text-left`}>Quando</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Ação</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Solicitação</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Quem</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-zinc-400">
                    Nenhuma movimentação registrada ainda.
                  </td>
                </tr>
              ) : (
                movimentacoes.map((m, i) => (
                  <tr key={`${m.solicitacao_id}-${m.acao}-${i}`} className="border-b border-zinc-50 last:border-0">
                    <td className="py-2.5 px-3 align-top">
                      <span className="block text-xs text-zinc-500 tabular-nums" title={fmtDataHoraSP(m.em)}>
                        {fmtDataHoraSP(m.em)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${acaoBadge(m.acao)}`}>
                        {m.acao}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="block truncate text-zinc-800" title={`${m.tipo_nome ?? 'Solicitação'} #${m.solicitacao_id}`}>
                        {m.tipo_nome ?? 'Solicitação'}
                      </span>
                      <span className="block text-xs text-zinc-400 tabular-nums">#{m.solicitacao_id}</span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="block truncate text-zinc-600" title={m.ator ?? '—'}>
                        {m.ator ?? '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="block truncate text-zinc-500" title={m.detalhe ?? '—'}>
                        {m.detalhe ?? '—'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardTabela>
    </>
  )
}
