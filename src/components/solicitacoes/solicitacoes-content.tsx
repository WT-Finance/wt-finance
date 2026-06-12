'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import MinhasSolicitacoes from './minhas-solicitacoes'
import BoardSolicitacoes from './board-solicitacoes'
import DrawerSolicitacao from './drawer-solicitacao'
import ModalNovaSolicitacao from './modal-nova-solicitacao'
import type { Solicitacao, TipoAbertura, Destinatarios } from '@/lib/solicitacoes/schemas'

type Escopo = 'mim_e_role' | 'so_mim' | 'todas'

export default function SolicitacoesContent({ view, escopo, minhas, caixa, pendentes, podeGestao, tipos, destinatarios }: {
  view: 'minhas' | 'caixa'; escopo: Escopo
  minhas: Solicitacao[]; caixa: Solicitacao[]; pendentes: number; podeGestao: boolean
  tipos: TipoAbertura[]; destinatarios: Destinatarios
}) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams()
  const [aberta, setAberta] = useState<Solicitacao | null>(null)
  const [novaAberta, setNovaAberta] = useState(false)

  function setView(v: 'minhas' | 'caixa') {
    const p = new URLSearchParams(sp.toString()); p.set('view', v); router.push(`${pathname}?${p.toString()}`)
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

      <div className="flex gap-2 mb-5">
        <button type="button" onClick={() => setView('minhas')} className={`${PILL} ${view === 'minhas' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={view === 'minhas' ? PILL_PRIMARIA_STYLE : undefined}>Minhas solicitações</button>
        <button type="button" onClick={() => setView('caixa')} className={`${PILL} ${view === 'caixa' ? PILL_PRIMARIA : PILL_NEUTRO}`} style={view === 'caixa' ? PILL_PRIMARIA_STYLE : undefined}>
          {pendentes > 0 ? `Caixa de entrada (${pendentes})` : 'Caixa de entrada'}
        </button>
      </div>

      {view === 'minhas'
        ? <MinhasSolicitacoes solicitacoes={minhas} onAbrir={setAberta} />
        : <BoardSolicitacoes solicitacoes={caixa} escopo={escopo} podeGestao={podeGestao} onAbrir={setAberta} />}

      {aberta && <DrawerSolicitacao sol={aberta} onClose={() => setAberta(null)} />}
      {novaAberta && <ModalNovaSolicitacao tipos={tipos} destinatarios={destinatarios} onFechar={() => setNovaAberta(false)} />}
    </div>
  )
}
