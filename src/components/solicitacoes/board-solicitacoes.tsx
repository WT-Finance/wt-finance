'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import { concluirSolicitacao } from '@/app/solicitacoes/actions'
import { fmtDataBR, resumo, vencida } from '@/lib/solicitacoes/format'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'

export default function BoardSolicitacoes({ solicitacoes, escopo, podeGestao, onAbrir }: {
  solicitacoes: Solicitacao[]; escopo: Escopo; podeGestao: boolean; onAbrir: (s: Solicitacao) => void
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const [concluindo, setConcluindo] = useState<number | null>(null)

  function setEscopo(e: Escopo) {
    const p = new URLSearchParams(sp.toString()); p.set('escopo', e); p.set('view', 'caixa')
    router.push(`${pathname}?${p.toString()}`)
  }
  async function concluir(id: number, e: React.MouseEvent) {
    e.stopPropagation(); setConcluindo(id)
    await concluirSolicitacao(id); setConcluindo(null); router.refresh()
  }

  // board exclui canceladas; colunas = tipos presentes (com abertas ou encerradas).
  const visiveis = solicitacoes.filter(s => s.status !== 'cancelada')
  const tipos = Array.from(new Map(visiveis.map(s => [s.tipo_id, s.tipo_nome])).entries())
    .sort((a, b) => (a[1] ?? '').localeCompare(b[1] ?? ''))

  const escopoPills: [Escopo, string][] = [['mim_e_role', 'Mim e minha permissão'], ['so_mim', 'Só a mim']]
  if (podeGestao) escopoPills.push(['todas', 'Todas (gestão)'])

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {escopoPills.map(([e, label]) => (
          <button key={e} type="button" onClick={() => setEscopo(e)} className={`${PILL} ${escopo === e ? PILL_PRIMARIA : PILL_NEUTRO}`} style={escopo === e ? PILL_PRIMARIA_STYLE : undefined}>{label}</button>
        ))}
      </div>

      {tipos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center text-sm text-zinc-400">Nenhuma solicitação na sua caixa de entrada.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {tipos.map(([tipoId, tipoNome]) => {
            const doTipo = visiveis.filter(s => s.tipo_id === tipoId)
            const abertas = doTipo.filter(s => s.status === 'aberta').sort((a, b) => a.data_limite.localeCompare(b.data_limite))
            const encerradas = doTipo.filter(s => s.status === 'concluida' || s.status === 'rejeitada')
            return (
              <div key={tipoId} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-2 px-1">
                  <h3 className="text-sm font-semibold text-zinc-700 truncate">{tipoNome}</h3>
                  <span className="text-xs text-zinc-400">{abertas.length}</span>
                </div>
                <div className="space-y-2">
                  {abertas.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-xs text-zinc-400">Nenhuma aberta</div>}
                  {abertas.map(s => <Card key={s.id} s={s} onAbrir={onAbrir} concluindo={concluindo === s.id} onConcluir={concluir} />)}
                  {encerradas.length > 0 && <Encerradas itens={encerradas} onAbrir={onAbrir} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Card({ s, onAbrir, concluindo, onConcluir }: { s: Solicitacao; onAbrir: (s: Solicitacao) => void; concluindo: boolean; onConcluir: (id: number, e: React.MouseEvent) => void }) {
  const podeConcluir = s.sou_atendente || s.sou_solicitante
  const venc = vencida(s.data_limite, s.status)
  return (
    <div onClick={() => onAbrir(s)} className="card-clicavel cursor-pointer rounded-lg border border-zinc-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="flex items-start gap-2">
        <button type="button" disabled={!podeConcluir || concluindo} onClick={e => onConcluir(s.id, e)} aria-label="Concluir"
          title={podeConcluir ? 'Concluir' : undefined}
          className={`foco-neutro mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${podeConcluir ? 'border-zinc-400 hover:border-emerald-500 hover:bg-emerald-50' : 'border-zinc-200'}`}>
          {concluindo && <Loader2 size={10} className="animate-spin" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900 truncate">{s.solicitante_email}</p>
          <p className="text-xs text-zinc-500 line-clamp-2">{resumo(s.respostas)}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className={`inline-flex items-center gap-1 text-[11px] ${venc ? 'font-medium text-red-600' : 'text-zinc-400'}`}>{venc && <AlertTriangle size={11} />}{fmtDataBR(s.data_limite)}</span>
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 truncate max-w-[45%]">{s.destinatario.tipo === 'usuario' ? 'você' : s.destinatario.rotulo}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Encerradas({ itens, onAbrir }: { itens: Solicitacao[]; onAbrir: (s: Solicitacao) => void }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="pt-1">
      <button type="button" onClick={() => setAberto(a => !a)} className="foco-neutro flex w-full items-center gap-1 rounded px-1 py-1 text-xs text-zinc-400 hover:text-zinc-600">
        <ChevronDown size={13} className={aberto ? 'rotate-180 transition-transform' : 'transition-transform'} /> Concluídas ({itens.length})
      </button>
      {aberto && <div className="space-y-1 mt-1">
        {itens.map(s => (
          <div key={s.id} onClick={() => onAbrir(s)} className="cursor-pointer rounded border border-zinc-100 px-2 py-1.5 text-xs hover:bg-zinc-50">
            <span className="text-zinc-600 truncate block">{s.solicitante_email}</span>
            <span className={s.status === 'rejeitada' ? 'text-red-500' : 'text-emerald-600'}>{s.status === 'rejeitada' ? 'Rejeitada' : 'Concluída'}</span>
          </div>
        ))}
      </div>}
    </div>
  )
}
