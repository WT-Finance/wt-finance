'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Plus, Eye, ClipboardList, History } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE, PILL_GESTAO, PILL_GESTAO_STYLE } from '@/components/admin/acessos/botoes'
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

  // Supervisão (só admin): "Ver todas" alterna o escopo para todas as solicitações do
  // sistema e leva à Caixa de entrada (onde a supervisão faz sentido); "Minha caixa" volta.
  const supervisao = escopo === 'todas'
  function setEscopo(e: Escopo) {
    const p = new URLSearchParams(sp.toString()); p.set('escopo', e); p.set('view', 'caixa')
    startTransition(() => router.push(`${pathname}?${p.toString()}`))
  }

  return (
    <div className="max-w-5xl mx-auto px-4">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Solicitações</h1>
        <p className="text-sm text-zinc-400 mt-0.5">Abra pedidos ao financeiro e acompanhe os atribuídos a você</p>
      </div>

      {/* Linha das abas (v4.18): Caixa de entrada PRIMEIRO, Minhas depois; os botões de
          gestão (só admin) ficam AO LADO das abas; ação primária "Nova solicitação" à direita. */}
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div role="tablist" aria-label="Visões de solicitações" className="flex gap-2">
            <button
              type="button"
              role="tab"
              id="tab-caixa"
              aria-selected={view === 'caixa'}
              aria-controls="painel-caixa"
              onClick={() => setView('caixa')}
              className={`${PILL} whitespace-nowrap ${view === 'caixa' ? PILL_PRIMARIA : PILL_NEUTRO}`}
              style={view === 'caixa' ? PILL_PRIMARIA_STYLE : undefined}
            >
              Caixa de entrada
              {pendentes > 0 && (
                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                  {pendentes}
                </span>
              )}
            </button>
            <button
              type="button"
              role="tab"
              id="tab-minhas"
              aria-selected={view === 'minhas'}
              aria-controls="painel-minhas"
              onClick={() => setView('minhas')}
              className={`${PILL} whitespace-nowrap ${view === 'minhas' ? PILL_PRIMARIA : PILL_NEUTRO}`}
              style={view === 'minhas' ? PILL_PRIMARIA_STYLE : undefined}
            >
              Minhas solicitações
            </button>
          </div>
          {/* Gestão (só admin): supervisão de todas as solicitações + atalho aos tipos.
              Âmbar --gestao (ADR-0117), ao lado das abas. */}
          {podeGestao && (
            <>
              <button
                type="button"
                onClick={() => setEscopo(supervisao ? 'mim_e_role' : 'todas')}
                className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`}
                style={PILL_GESTAO_STYLE}
                title="Visão de supervisão: todas as solicitações do sistema"
              >
                <Eye size={13} /> {supervisao ? 'Minha caixa' : 'Ver todas'}
              </button>
              <Link href="/admin/solicitacoes" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
                <ClipboardList size={13} /> Gerenciar solicitações
              </Link>
              <Link href="/admin/solicitacoes/movimentacoes" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
                <History size={13} /> Movimentações
              </Link>
            </>
          )}
        </div>
        <button type="button" onClick={() => setNovaAberta(true)} className={`${PILL} ${PILL_PRIMARIA} whitespace-nowrap`} style={PILL_PRIMARIA_STYLE}>
          <Plus size={14} /> Nova solicitação
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
          : <BoardSolicitacoes solicitacoes={lista} escopo={escopo} onAbrir={setAberta} />}
      </div>

      {aberta && <DrawerSolicitacao sol={aberta} onClose={() => setAberta(null)} />}
      {novaAberta && <ModalNovaSolicitacao tipos={tipos} destinatarios={destinatarios} onFechar={() => setNovaAberta(false)} />}
    </div>
  )
}
