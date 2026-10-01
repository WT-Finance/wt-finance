'use client'

import { AlertTriangle, CheckCircle } from 'lucide-react'
import { fmtDataHoraSP } from '@/lib/fmt'
import type { StatusSincronizacaoMonde } from '@/app/admin/ingestao/actions'

/**
 * Sincronização Monde (v5.4.4; movido do Upload para o Log de Ingestão na v6.1.1) — cartão de
 * LEITURA, sem upload.
 *
 * Não é uma base de planilha: o espelho vem da API do Monde a cada 15 min. O cartão existe
 * porque o tripwire precisa de um lugar para ACENDER — o briefing pede alerta visível, não
 * linha de log. Mostra o frescor das duas engrenagens (incremental e reconciliação) e, quando
 * algum mês verificado diverge, o motivo exato.
 *
 * `status === null` = leitura falhou (fail-safe: o cartão diz "indisponível", nunca derruba a tela).
 */

function formatarNum(n: number): string {
  return n.toLocaleString('pt-BR')
}

export function CardSincronizacaoMonde({ status }: { status: StatusSincronizacaoMonde | null }) {
  const tripwire = status?.tripwire ?? null
  const aceso = tripwire?.acendeu === true

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-900">Sincronização Monde</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Espelho das vendas vindo da API do Monde. Não é upload — sincroniza sozinho a cada 15 min,
            e a reconciliação diária recupera venda lançada com atraso.
          </p>
        </div>
        {status ? (
          <span
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ${
              aceso ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'
            }`}
          >
            {aceso ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
            {aceso ? 'Divergência' : 'Conferido'}
          </span>
        ) : null}
      </div>

      {status === null ? (
        <p className="mt-4 text-xs text-zinc-400">Status indisponível.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
            {/* shrink-0: valor longo encolhe abaixo do próprio conteúdo e invade o vizinho (DS §8). */}
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Vendas que contam</p>
              <p className="text-sm font-semibold text-zinc-900 tabular-nums">
                {formatarNum(status.vendas_que_contam)}
              </p>
              {/* v5.4.5: só aparece quando há diferença — venda cujos produtos a origem cancelou
                  segue espelhada (auditável) e deixa de somar. Sem venda cancelada, a linha some
                  e o cartão fica como era. */}
              {status.vendas > status.vendas_que_contam ? (
                <p className="text-2xs text-zinc-400 tabular-nums">
                  +{formatarNum(status.vendas - status.vendas_que_contam)} cancelada
                  {status.vendas - status.vendas_que_contam > 1 ? 's' : ''} no espelho
                </p>
              ) : null}
            </div>
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Última sincronização</p>
              <p className="text-sm text-zinc-700">{fmtDataHoraSP(status.ultima_sincronizacao)}</p>
            </div>
            <div className="shrink-0">
              <p className="text-2xs uppercase tracking-wide text-zinc-400">Última reconciliação</p>
              <p className="text-sm text-zinc-700">
                {status.ultima_reconciliacao ? fmtDataHoraSP(status.ultima_reconciliacao) : 'Nunca'}
                {status.reconciliacao_cursor ? (
                  <span className="text-zinc-400"> · {status.reconciliacao_cursor}</span>
                ) : null}
              </p>
            </div>
          </div>

          {aceso && tripwire ? (
            <div className="mt-4 rounded-lg bg-danger-bg px-3 py-2.5">
              <p className="text-xs font-medium text-danger">
                O espelho diverge da API {tripwire.motivos.length === 1 ? 'em 1 mês' : `em ${tripwire.motivos.length} meses`}:
              </p>
              <ul className="mt-1 space-y-0.5">
                {tripwire.motivos.map(m => (
                  <li key={m} className="text-2xs text-danger tabular-nums">{m}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {tripwire ? (
            <p className="mt-3 text-2xs text-zinc-400">
              Conferido contra a API em {fmtDataHoraSP(tripwire.atualizado_em)}. Mês que a reconciliação
              ainda não visitou aparece como não verificado e nunca acende.
            </p>
          ) : (
            <p className="mt-3 text-2xs text-zinc-400">
              Nenhuma conferência registrada ainda — a primeira reconciliação diária a produz.
            </p>
          )}
        </>
      )}
    </div>
  )
}
