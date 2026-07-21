'use client'

import { useEffect, useState } from 'react'
import { listarLogChaveApi } from '@/app/admin/chaves-api/actions'
import type { ChaveApi, LogChamada } from './tipos'
import ModalCentral from '@/components/shared/modal-central'
import Badge from '@/components/ui/badge'
import { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { fmtDataHoraSP } from '@/lib/fmt'

// v5.4.0/M2 — modal "Ver log": últimas 50 chamadas registradas para a chave
// (app.api_chamada_log, via api_log_listar). Carregado sob demanda ao abrir
// (a lista não vem pronta da page — evita 50 linhas de log por chave em toda
// carga da tela quando ninguém vai olhar).

function BadgeStatus({ status }: { status: number }) {
  if (status >= 200 && status < 300) return <Badge variant="success">{status}</Badge>
  if (status >= 500) return <Badge variant="danger">{status}</Badge>
  if (status >= 400) return <Badge variant="warning">{status}</Badge>
  return <Badge variant="neutro">{status}</Badge>
}

interface Carga { id: number; log: LogChamada[] | null; erro: string | null }

export function ModalLogChave({
  chave,
  onFechar,
}: {
  chave:    ChaveApi
  onFechar: () => void
}) {
  // Sem setLoading(true) síncrono no efeito (ruleset do React Compiler,
  // eslint-plugin-react-hooks v7): `carregando` é DERIVADO de "a carga concluída
  // é desta chave?" — o `.then` seta id+log+erro juntos, nunca um set síncrono
  // na entrada do efeito.
  const [carga, setCarga] = useState<Carga | null>(null)
  const carregando = carga?.id !== chave.id
  const log = carga?.id === chave.id ? carga.log : null
  const erro = carga?.id === chave.id ? carga.erro : null

  useEffect(() => {
    let cancelado = false
    void listarLogChaveApi(chave.id).then(res => {
      if (cancelado) return
      setCarga({
        id:   chave.id,
        log:  res,
        erro: res === null ? 'Não foi possível carregar o log desta chave.' : null,
      })
    })
    return () => { cancelado = true }
  }, [chave.id])

  return (
    <ModalCentral
      titulo={`Log de chamadas — ${chave.plataforma}`}
      subtitulo="Últimas chamadas registradas para esta chave (máx. 50)"
      largura="2xl"
      onClose={onFechar}
    >
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      {carregando ? (
        <p className="py-6 text-center text-sm text-zinc-400">Carregando…</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[12%]" />
            <col className="w-[30%]" />
            <col className="w-[20%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100">
              <th className={`${CARD_TABELA_TH} text-left`}>Rota</th>
              <th className={`${CARD_TABELA_TH} text-left`}>Status</th>
              <th className={`${CARD_TABELA_TH} text-left`}>Detalhe</th>
              <th className={`${CARD_TABELA_TH} text-left`}>Quando</th>
            </tr>
          </thead>
          <tbody>
            {(log ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-zinc-400">
                  Nenhuma chamada registrada ainda.
                </td>
              </tr>
            ) : (
              // key por índice: lista ESTÁTICA pós-fetch (sem interação de add/remover),
              // e a RPC não emite um id próprio por linha de log.
              (log ?? []).map((l, i) => (
                <tr key={i} className="border-b border-zinc-50 last:border-0">
                  <td className="px-3 py-2 truncate" title={l.rota}>{l.rota}</td>
                  <td className="px-3 py-2"><BadgeStatus status={l.status} /></td>
                  <td className="px-3 py-2 truncate text-zinc-500" title={l.detalhe ?? undefined}>{l.detalhe ?? '—'}</td>
                  <td className="px-3 py-2 text-zinc-500 tabular-nums">{fmtDataHoraSP(l.criado_em)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </ModalCentral>
  )
}
