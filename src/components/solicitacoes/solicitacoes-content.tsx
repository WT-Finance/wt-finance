'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import MinhasSolicitacoes from './minhas-solicitacoes'
import BoardSolicitacoes from './board-solicitacoes'
import DrawerSolicitacao from './drawer-solicitacao'
import ModalNovaSolicitacao from './modal-nova-solicitacao'
import type { Solicitacao, TipoAbertura, Destinatarios } from '@/lib/solicitacoes/schemas'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'

export default function SolicitacoesContent({ view, escopo, lista, pendentes, podeGestao, tipos, destinatarios, erroCarga }: {
  view: 'minhas' | 'caixa'; escopo: Escopo
  /** Lista da view ATUAL (a page busca só uma das duas). */
  lista: Solicitacao[]; pendentes: number; podeGestao: boolean
  tipos: TipoAbertura[]; destinatarios: Destinatarios
  erroCarga: string | null
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const [aberta, setAberta] = useState<Solicitacao | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)
  // useTransition: fornece feedback de pending na navegação de visão (router.push é assíncrono)
  const [isPending, startTransition] = useTransition()

  function setView(v: 'minhas' | 'caixa') {
    const p = new URLSearchParams(sp.toString()); p.set('view', v)
    startTransition(() => router.push(`${pathname}?${p.toString()}`))
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Solicitações</h1>
          <p className="text-sm text-zinc-400 mt-0.5">Abra pedidos ao financeiro e acompanhe os atribuídos a você.</p>
        </div>
        <button type="button" onClick={() => setNovaAberta(true)} className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}><Plus size={14} /> Nova solicitação</button>
      </div>

      {/* tablist: semântica de tabs para as duas visões (Minhas / Caixa de entrada) */}
      <div role="tablist" aria-label="Visões de solicitações" className="flex gap-2 mb-5">
        <button
          type="button"
          role="tab"
          id="tab-minhas"
          aria-selected={view === 'minhas'}
          aria-controls="painel-minhas"
          onClick={() => setView('minhas')}
          className={`${PILL} ${view === 'minhas' ? PILL_PRIMARIA : PILL_NEUTRO}`}
          style={view === 'minhas' ? PILL_PRIMARIA_STYLE : undefined}
        >
          Minhas solicitações
        </button>
        <button
          type="button"
          role="tab"
          id="tab-caixa"
          aria-selected={view === 'caixa'}
          aria-controls="painel-caixa"
          onClick={() => setView('caixa')}
          className={`${PILL} ${view === 'caixa' ? PILL_PRIMARIA : PILL_NEUTRO}`}
          style={view === 'caixa' ? PILL_PRIMARIA_STYLE : undefined}
        >
          {pendentes > 0 ? `Caixa de entrada (${pendentes})` : 'Caixa de entrada'}
        </button>
      </div>

      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} />}

      {/* tabpanel: só o conteúdo condicional fica aqui; drawer e modal ficam fora */}
      <div
        role="tabpanel"
        id={`painel-${view}`}
        aria-labelledby={`tab-${view}`}
        aria-busy={isPending}
        className={isPending ? 'opacity-60 pointer-events-none transition-opacity' : undefined}
      >
        {view === 'minhas'
          ? <MinhasSolicitacoes solicitacoes={lista} onAbrir={setAberta} />
          : <BoardSolicitacoes solicitacoes={lista} escopo={escopo} podeGestao={podeGestao} onAbrir={setAberta} />}
      </div>

      {aberta && <DrawerSolicitacao sol={aberta} onClose={() => setAberta(null)} />}
      {novaAberta && <ModalNovaSolicitacao tipos={tipos} destinatarios={destinatarios} onFechar={() => setNovaAberta(false)} />}
    </div>
  )
}
