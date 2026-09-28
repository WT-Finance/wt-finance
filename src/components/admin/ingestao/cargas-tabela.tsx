'use client'

import Link from 'next/link'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import ScrollAutoHide from '@/components/shared/scroll-auto-hide'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { fmtDataHoraSP, fmtBRL2 } from '@/lib/fmt'
import { ROTULO_BASE, ehBaseIngestao } from '@/lib/ingestao/bases'
import { ROTULO_STATUS_CARGA, type IngestaoCarga } from './tipos'

// Cargas recentes (anexo v6.0.0/M6 §7): "uma carga mostra o que o operador precisa para agir —
// base, status, origem, quem, quando, linhas, checksums conferidos, a diferença contra a base,
// e — quando rejeitada — o motivo." `quem` vem de `ingestao_painel()` desde a 0281 (usuário da
// sessão ou "API · plataforma" da chave); `origem` é o texto de `x-ingestao-origem`
// (manual/reprocesso/…) — são coisas diferentes, por isso duas colunas.
//
// Tabela COMPACTA (molde `modal-log-chave.tsx`/`CARD_TABELA_TH`), não a receita de sticky da
// skill `tabela-densa`: até 50 linhas dentro de um card administrativo, não uma grade
// financeira de página inteira — `ScrollAutoHide` com teto de altura basta.

function BadgeStatusCarga({ status }: { status: IngestaoCarga['status'] }) {
  if (status === 'aplicada') return <Badge variant="success">{ROTULO_STATUS_CARGA[status]}</Badge>
  if (status === 'aberta') return <Badge variant="warning">{ROTULO_STATUS_CARGA[status]}</Badge>
  return <Badge variant="danger">{ROTULO_STATUS_CARGA[status]}</Badge>
}

function celulaDiff(diff: IngestaoCarga['diff']): string {
  if (!diff) return '—'
  const partes: string[] = []
  if (typeof diff.linhas === 'number') partes.push(`${diff.linhas >= 0 ? '+' : ''}${diff.linhas} registro(s)`)
  if (typeof diff.soma === 'number') partes.push(`Δ ${fmtBRL2(diff.soma)}`)
  return partes.length > 0 ? partes.join(' · ') : '—'
}

export function CargasTabela({
  cargas,
  onReprocessar,
}: {
  cargas: IngestaoCarga[]
  onReprocessar: (carga: IngestaoCarga) => void
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Cargas recentes</h2>
      {cargas.length === 0 ? (
        <p className="py-6 text-center text-xs text-zinc-400">
          Nenhuma carga registrada ainda — assim que alguém enviar um arquivo pela tela de{' '}
          <Link href="/admin/uploads" className="underline hover:text-zinc-600">Upload de Arquivos</Link>, ela aparece aqui.
        </p>
      ) : (
        <ScrollAutoHide className="max-h-[420px] pr-3.5" eixo="y">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className={`${CARD_TABELA_TH} text-left`}>Base</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Status</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Quem</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Origem</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Quando</th>
                <th className={`${CARD_TABELA_TH} text-right`}>Linhas</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Checksums</th>
                <th className={`${CARD_TABELA_TH} text-left`}>Diferença</th>
                <th className={CARD_TABELA_TH} />
              </tr>
            </thead>
            <tbody>
              {cargas.map(c => (
                <tr key={c.carga_id} className="border-b border-zinc-50 last:border-0 align-top">
                  <td className="px-3 py-2 text-zinc-700">{ehBaseIngestao(c.base) ? ROTULO_BASE[c.base] : c.base}</td>
                  <td className="px-3 py-2">
                    <BadgeStatusCarga status={c.status} />
                    {c.erro && (
                      <p className="mt-1 max-w-[220px] text-2xs text-danger" title={c.erro}>{c.erro}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{c.quem ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-500">{c.origem}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-zinc-500 tabular-nums">{fmtDataHoraSP(c.recebido_em)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{c.linhas ?? '—'}</td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">
                    {c.checksums_conferidos ?? 0}
                    {(c.checksums_falhos ?? 0) > 0 && (
                      <span className="text-danger"> ({c.checksums_falhos} falhou/falharam)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-zinc-500">{celulaDiff(c.diff)}</td>
                  <td className="px-3 py-2">
                    {(c.status === 'aplicada' || c.status === 'rejeitada' || c.status === 'erro') && (
                      <Button variant="ghost" onClick={() => onReprocessar(c)}>Reprocessar</Button>
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
