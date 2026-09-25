'use client'

import Badge, { type BadgeVariant } from '@/components/ui/badge'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { fmtDataHoraSP } from '@/lib/fmt'
import { ROTULO_PROCESSO, ROTULO_STATUS_EXECUCAO, type IngestaoExecucao } from './tipos'

// Execuções recentes dos processos agendados (anexo v6.0.0/M6 §7): "execução mostra processo,
// status (ok/pulado/erro) e duração. 'pulado' não pode parecer falha — é um processo saudável
// que esperou a vez." Por isso `pulado` NUNCA leva a variante `danger` do Badge — é a mesma
// distinção visual que `em_curso`, nem sucesso nem falha.

const VARIANTE_STATUS: Record<IngestaoExecucao['status'], BadgeVariant> = {
  ok:       'success',
  pulado:   'neutro',
  em_curso: 'warning',
  erro:     'danger',
}

function formatarDuracao(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms} ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)} s`
  const min = Math.floor(s / 60)
  const seg = Math.round(s % 60)
  return `${min}min ${seg}s`
}

export function ExecucoesTabela({ execucoes }: { execucoes: IngestaoExecucao[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Execuções recentes dos processos agendados</h2>
      {execucoes.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">
          Nenhuma execução registrada ainda — as rotas do Monde/CDI só passam a gravar aqui depois do deploy desta versão.
        </p>
      ) : (
        <ScrollAutoHide className="max-h-[360px] pr-3.5" eixo="y">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className={`${CARD_TABELA_TH} text-left`}>Processo</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Status</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Iniciado</th>
                <th className={`${CARD_TABELA_TH} text-right`}>Duração</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Erro</th>
              </tr>
            </thead>
            <tbody>
              {execucoes.map(e => (
                <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-3 py-2 text-zinc-700">{ROTULO_PROCESSO[e.processo] ?? e.processo}</td>
                  <td className="px-3 py-2">
                    <Badge variant={VARIANTE_STATUS[e.status]}>{ROTULO_STATUS_EXECUCAO[e.status] ?? e.status}</Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">{fmtDataHoraSP(e.iniciado_em)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-500">{formatarDuracao(e.duracao_ms)}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate text-danger" title={e.erro ?? undefined}>{e.erro ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollAutoHide>
      )}
    </div>
  )
}
