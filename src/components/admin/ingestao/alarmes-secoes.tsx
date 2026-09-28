'use client'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import Badge from '@/components/ui/badge'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { fmtDataHoraSP } from '@/lib/fmt'
import { Relativo } from './relativo'
import { rotuloAlarme, type IngestaoAlarme } from './tipos'

// Alarmes — a PRIMEIRA pergunta que a tela responde (anexo v6.0.0/M6 §7: "há algo errado
// agora?"), com destaque, e VAZIO DE VERDADE quando não há (nunca "carregando" nem uma faixa
// cinza ambígua — o operador precisa distinguir "nada aconteceu" de "não sei se algo
// aconteceu").

function celulasDetalhe(detalhe: Record<string, unknown> | null): string {
  if (!detalhe || Object.keys(detalhe).length === 0) return ''
  return Object.entries(detalhe)
    .map(([chave, valor]) => `${chave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`)
    .join(' · ')
}

export function AlarmesAbertosFaixa({ alarmes }: { alarmes: IngestaoAlarme[] }) {
  if (alarmes.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-success bg-success-bg px-4 py-3 text-sm text-success">
        <CheckCircle2 size={16} className="shrink-0" />
        Nenhum alarme aberto agora.
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-danger bg-danger-bg p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
        <AlertTriangle size={16} className="shrink-0" />
        {alarmes.length === 1 ? '1 alarme aberto' : `${alarmes.length} alarmes abertos`}
      </div>
      <ul className="space-y-2">
        {alarmes.map(a => {
          const detalhe = celulasDetalhe(a.detalhe)
          return (
            <li key={a.id} className="rounded-lg bg-white px-3 py-2 text-xs text-danger">
              <span className="font-medium">{rotuloAlarme(a.tipo)}</span>
              <span> · {a.chave}</span>
              <span> · aberto <Relativo iso={a.aberto_em} /></span>
              {a.notificado_em === null && (
                <span className="ml-1.5 font-medium">· e-mail ainda não enviado</span>
              )}
              {detalhe && <p className="mt-0.5">{detalhe}</p>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function AlarmesRecentesTabela({ alarmes }: { alarmes: IngestaoAlarme[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Histórico de alarmes</h2>
      {alarmes.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">Nenhum alarme registrado ainda.</p>
      ) : (
        <ScrollAutoHide className="max-h-[320px] pr-3.5" eixo="y">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className={`${CARD_TABELA_TH} text-left`}>Tipo</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Chave</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Aberto</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Resolvido</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Status</th>
              </tr>
            </thead>
            <tbody>
              {alarmes.map(a => (
                <tr key={a.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-3 py-2 text-zinc-700">{rotuloAlarme(a.tipo)}</td>
                  <td className="px-3 py-2 max-w-[220px] truncate text-zinc-500" title={a.chave}>{a.chave}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">{fmtDataHoraSP(a.aberto_em)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">
                    {a.resolvido_em ? fmtDataHoraSP(a.resolvido_em) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {a.resolvido_em ? (
                      <Badge variant="neutro">Resolvido</Badge>
                    ) : (
                      <Badge variant="danger">Aberto</Badge>
                    )}
                    {a.notificado_em === null && (
                      <span className="ml-1.5 text-2xs text-warning-deep">e-mail pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollAutoHide>
      )}
    </div>
  )
}
