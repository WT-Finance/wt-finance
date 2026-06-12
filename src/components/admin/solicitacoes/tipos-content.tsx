'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { arquivarTipo, excluirTipo } from '@/app/admin/solicitacoes/actions'
import type { TipoAdmin } from '@/lib/solicitacoes/schemas'
import CardTabela, { CARD_TABELA_TH } from '@/components/shared/card-tabela'
import { FaixaMensagem } from '@/components/admin/acessos/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/admin/acessos/botoes'
import { EditorTipo } from './editor-tipo'

// v4.16.0 (spec §2.4 C) — conteúdo client da página Tipos de Solicitação:
// CTA "Novo tipo", tabela de tipos (arquivados ao final, com chip), ações por
// linha (Editar / Arquivar-Desarquivar / Excluir) e o editor modal. Dados vêm
// prontos da page (RSC); após cada ação, router.refresh() recarrega a lista.

type Msg = { tipo: 'sucesso' | 'erro'; texto: string }
type ModalState = { modo: 'criar' } | { modo: 'editar'; tipo: TipoAdmin } | null

export function TiposContent({ tipos }: { tipos: TipoAdmin[] }) {
  const router = useRouter()
  const [modal, setModal] = useState<ModalState>(null)
  const [msg, setMsg] = useState<Msg | null>(null)
  const [ocupado, setOcupado] = useState<number | null>(null)

  // Ativos primeiro (por nome), arquivados ao final (por nome).
  const ordenados = useMemo(
    () =>
      [...tipos].sort((a, b) => {
        if (a.arquivado !== b.arquivado) return a.arquivado ? 1 : -1
        return a.nome.localeCompare(b.nome, 'pt-BR')
      }),
    [tipos],
  )

  async function handleArquivar(tipo: TipoAdmin) {
    setMsg(null)
    setOcupado(tipo.id)
    const res = await arquivarTipo(tipo.id, !tipo.arquivado)
    setOcupado(null)
    if (!res.ok) {
      setMsg({ tipo: 'erro', texto: res.erro ?? 'Não foi possível atualizar o tipo.' })
      return
    }
    setMsg({ tipo: 'sucesso', texto: tipo.arquivado ? `Tipo «${tipo.nome}» desarquivado.` : `Tipo «${tipo.nome}» arquivado.` })
    router.refresh()
  }

  async function handleExcluir(tipo: TipoAdmin) {
    if (!window.confirm(`Excluir o tipo «${tipo.nome}»? Esta ação não pode ser desfeita.`)) return
    setMsg(null)
    setOcupado(tipo.id)
    const res = await excluirTipo(tipo.id)
    setOcupado(null)
    if (!res.ok) {
      setMsg({ tipo: 'erro', texto: res.erro ?? 'Não foi possível excluir o tipo.' })
      return
    }
    setMsg({ tipo: 'sucesso', texto: `Tipo «${tipo.nome}» excluído.` })
    router.refresh()
  }

  function handleSalvo(texto: string) {
    setModal(null)
    setMsg({ tipo: 'sucesso', texto })
    router.refresh()
  }

  return (
    <>
      {msg && <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />}

      <CardTabela
        titulo="Tipos"
        headerRight={
          <button
            type="button"
            onClick={() => { setMsg(null); setModal({ modo: 'criar' }) }}
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
          >
            + Novo tipo
          </button>
        }
      >
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-72" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100">
              <th className={`${CARD_TABELA_TH} text-left`}>Nome</th>
              <th className={`${CARD_TABELA_TH} text-right`}>Nº de campos</th>
              <th className={`${CARD_TABELA_TH} text-right`}>Solicitações</th>
              <th className={`${CARD_TABELA_TH} text-right`}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-6 text-center text-sm text-zinc-400">
                  Nenhum tipo cadastrado ainda.
                </td>
              </tr>
            ) : (
              ordenados.map(tipo => {
                const linhaOcupada = ocupado === tipo.id
                return (
                  <tr key={tipo.id} className="border-b border-zinc-50 last:border-0">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`truncate ${tipo.arquivado ? 'text-zinc-400' : 'text-zinc-800'}`}>
                          {tipo.nome}
                        </span>
                        {tipo.arquivado && (
                          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                            Arquivado
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-600">{tipo.n_campos}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-zinc-600">{tipo.n_solicitacoes}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setMsg(null); setModal({ modo: 'editar', tipo }) }}
                          disabled={linhaOcupada}
                          className={`${PILL} ${PILL_NEUTRO}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArquivar(tipo)}
                          disabled={linhaOcupada}
                          className={`${PILL} ${PILL_NEUTRO}`}
                        >
                          {linhaOcupada && <Loader2 size={14} className="animate-spin" />}
                          {tipo.arquivado ? 'Desarquivar' : 'Arquivar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExcluir(tipo)}
                          disabled={linhaOcupada}
                          className={`${PILL} ${PILL_PERIGO}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </CardTabela>

      {modal && (
        <EditorTipo
          modo={modal.modo}
          tipo={modal.modo === 'editar' ? modal.tipo : undefined}
          onFechar={() => setModal(null)}
          onSalvo={handleSalvo}
        />
      )}
    </>
  )
}
