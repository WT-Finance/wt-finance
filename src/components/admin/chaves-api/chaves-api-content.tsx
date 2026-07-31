'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Ban, Pencil, Plus, ScrollText } from 'lucide-react'
import type { TipoAdmin } from '@/lib/solicitacoes/schemas'
import type { ChaveApi, TipoDisponivel } from './tipos'
import { TiposExpostos } from './tipos-expostos'
import { ModalCriarChave } from './modal-criar-chave'
import { ModalEditarChave } from './modal-editar-chave'
import { ModalRevogarChave } from './modal-revogar-chave'
import { ModalLogChave } from './modal-log-chave'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import Badge from '@/components/ui/badge'
import Button from '@/components/ui/button'
import { PILL, PILL_GESTAO, PILL_GESTAO_STYLE, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { fmtDataHoraSP } from '@/lib/fmt'

// v5.4.0/M2 (+ Round2/Round3/Round4) — conteúdo client de /admin/chaves-api
// ("API externa"): header de navegação (volta a /admin/solicitacoes — esta
// rota não está na sidebar, mesmo padrão de /admin/solicitacoes; Round3
// acrescenta a pill "Documentação", que leva à página irmã
// /admin/chaves-api/documentacao), a tabela "Chaves de API", a seção "Tipos
// Expostos" (TiposExpostos — Round3: virou só um toggle de exposição por
// linha, a lista de equipes de destino por tipo morreu) e a orquestração dos
// 4 modais (criar / editar / revogar / log). Round4 (pedido do Yan 30/07):
// "Chaves de API" passou a vir ANTES de "Tipos Expostos" (antes era o
// inverso). Dados vêm prontos da page (RSC); após cada mutação, os modais/
// seção chamam router.refresh() antes de fechar.

type ModalState =
  | { modo: 'criar' }
  | { modo: 'editar'; chave: ChaveApi }
  | { modo: 'revogar'; chave: ChaveApi }
  | { modo: 'log'; chave: ChaveApi }
  | null

type Msg = { tipo: 'sucesso' | 'erro'; texto: string }

function BadgeStatusChave({ chave }: { chave: ChaveApi }) {
  return chave.ativo
    ? <Badge variant="success">Ativa</Badge>
    : <Badge variant="danger">Revogada</Badge>
}

export function ChavesApiContent({
  chaves,
  tipos,
  tiposAdmin,
  erroCarga,
}: {
  chaves:     ChaveApi[]
  tipos:      TipoDisponivel[]
  tiposAdmin: TipoAdmin[]
  erroCarga:  string | null
}) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalState>(null)
  const [msg, setMsg] = useState<Msg | null>(null)

  /** ModalEditarChave/ModalRevogarChave chamam isto em sucesso: fecham o
   *  modal, mostram a mensagem e recarregam a lista (RSC via
   *  router.refresh()). O ModalCriarChave é diferente — refresca sozinho e só
   *  fecha ao clique explícito em "Fechar" (depois de revelar o segredo), sem
   *  mensagem extra aqui (o próprio modal já confirma o sucesso inline). */
  function fecharComSucesso(texto: string) {
    setModal(null)
    setMsg({ tipo: 'sucesso', texto })
    router.refresh()
  }

  /** TiposExpostos chama isto a cada toggle (sem modal) — sucesso E erro
   *  passam pela MESMA FaixaMensagem compartilhada desta página; só sucesso
   *  recarrega a lista (mesmo padrão de handleArquivar em tipos-content.tsx:
   *  erro não muda dado nenhum, não há o que recarregar). */
  function handleTipoMudou(resultado: Msg) {
    setMsg(resultado)
    if (resultado.tipo === 'sucesso') router.refresh()
  }

  return (
    <>
      {/* Ações da página: "Ver solicitações" (âmbar --gestao, volta ao módulo) à
          esquerda; "Nova chave" à direita — mesmo padrão de tipos-content.tsx.
          v5.4.0/Round4 (pedido do Yan, 31/07): a pill "Documentação" SAIU daqui —
          o acesso à documentação é pela tela inicial do módulo de Solicitações, que
          é onde ela tem permissão própria. Ter os dois caminhos deixava a permissão
          nova parecendo acessório de uma tela de gestão. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/solicitacoes" className={`${PILL} ${PILL_GESTAO} whitespace-nowrap`} style={PILL_GESTAO_STYLE}>
            <ArrowLeft size={13} /> Ver solicitações
          </Link>
        </div>
        <button
          type="button"
          onClick={() => { setMsg(null); setModal({ modo: 'criar' }) }}
          className={`${PILL} ${PILL_PRIMARIA} whitespace-nowrap`}
          style={PILL_PRIMARIA_STYLE}
        >
          <Plus size={13} /> Nova chave
        </button>
      </div>

      {erroCarga && <FaixaMensagem tipo="erro" texto={erroCarga} />}
      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      <CardTabela titulo="Chaves de API" className="mb-5">
        <table className="table-fixed w-full text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[22%]" />
            <col className="w-[18%]" />
            <col className="w-[10%]" />
            <col className="w-[13%]" />
            <col className="w-[17%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100 text-left">
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Plataforma</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Whitelist</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Callback</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Status</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Última chamada</th>
              <th scope="col" className={`${CARD_TABELA_TH} text-left`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {chaves.map(chave => (
              <tr key={chave.id} className="border-b border-zinc-50 last:border-0">
                <td className="px-3 py-2.5">
                  <p className="font-medium text-zinc-900 truncate" title={chave.plataforma}>{chave.plataforma}</p>
                  <p className="text-xs text-zinc-500 truncate" title={chave.robo.email}>
                    {chave.robo.nome ?? chave.robo.email}
                  </p>
                  <p className="text-3xs text-zinc-400 truncate">Criada em {fmtDataHoraSP(chave.criado_em)}</p>
                </td>
                <td className="px-3 py-2.5">
                  {chave.whitelist_tipos.length === 0 ? (
                    <span className="text-xs text-zinc-400">Nenhum tipo liberado</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {chave.whitelist_tipos.map(t => (
                        <Badge key={t.id} variant="neutro">{t.nome}</Badge>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {chave.callback_url ? (
                    <p className="text-xs text-zinc-600 truncate" title={chave.callback_url}>{chave.callback_url}</p>
                  ) : (
                    <p className="text-xs text-zinc-400">Sem callback</p>
                  )}
                  {chave.tem_callback_segredo && (
                    <p className="text-3xs text-zinc-400">Segredo de saída configurado</p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <BadgeStatusChave chave={chave} />
                  {!chave.ativo && chave.revogado_em && (
                    <p className="mt-1 text-3xs text-zinc-400">em {fmtDataHoraSP(chave.revogado_em)}</p>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block text-xs text-zinc-500 tabular-nums truncate">
                    {fmtDataHoraSP(chave.ultima_chamada_em)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="icone-borda" tone="neutro"
                      onClick={() => setModal({ modo: 'editar', chave })}
                      disabled={!chave.ativo}
                      title={chave.ativo ? 'Editar callback/whitelist' : 'Chave revogada — não pode ser editada'}
                      aria-label={`Editar chave de ${chave.plataforma}`}
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="icone-borda" tone="neutro"
                      onClick={() => setModal({ modo: 'log', chave })}
                      title="Ver log de chamadas"
                      aria-label={`Ver log de chamadas de ${chave.plataforma}`}
                    >
                      <ScrollText size={14} />
                    </Button>
                    <Button
                      variant="icone-borda" tone="perigo"
                      onClick={() => setModal({ modo: 'revogar', chave })}
                      disabled={!chave.ativo}
                      title={chave.ativo ? 'Revogar (irreversível)' : 'Já revogada'}
                      aria-label={`Revogar chave de ${chave.plataforma}`}
                    >
                      <Ban size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {chaves.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-zinc-400">
                  Nenhuma chave de API registrada ainda. Use «Nova chave» para começar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardTabela>

      <TiposExpostos tipos={tiposAdmin} onMudou={handleTipoMudou} />

      {modal?.modo === 'criar' && (
        <ModalCriarChave tipos={tipos} onFechar={() => setModal(null)} />
      )}
      {modal?.modo === 'editar' && (
        <ModalEditarChave
          chave={modal.chave}
          tipos={tipos}
          onFechar={() => setModal(null)}
          onSalvo={fecharComSucesso}
        />
      )}
      {modal?.modo === 'revogar' && (
        <ModalRevogarChave
          chave={modal.chave}
          onFechar={() => setModal(null)}
          onRevogado={fecharComSucesso}
        />
      )}
      {modal?.modo === 'log' && (
        <ModalLogChave chave={modal.chave} onFechar={() => setModal(null)} />
      )}
    </>
  )
}
