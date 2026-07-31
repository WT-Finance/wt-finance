'use client'

import { useState, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { atualizarChaveApi } from '@/app/admin/api-externa/actions'
import type { ChaveApi, TipoDisponivel } from './tipos'
import { WhitelistTipos } from './whitelist-tipos'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ModalCentral from '@/components/shared/modal-central'

// v5.4.0/M2 (Round5: callback removido — o modal ficou só com a whitelist) —
// modal de editar chave. Só chaves ATIVAS chegam a este modal (o botão
// «Editar» já vem desabilitado numa revogada). onSalvo (não onFechar) dispara
// o router.refresh()+mensagem do PAI — mesmo padrão de ModalRole
// (admin/acessos): o modal não decide como o pai reage.

export function ModalEditarChave({
  chave,
  tipos,
  onFechar,
  onSalvo,
}: {
  chave:    ChaveApi
  tipos:    TipoDisponivel[]
  onFechar: () => void
  onSalvo:  (mensagem: string) => void
}) {
  const [whitelist, setWhitelist] = useState<number[]>(chave.whitelist_tipos.map(t => t.id))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function toggleTipo(id: number) {
    setWhitelist(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    const res = await atualizarChaveApi({ id: chave.id, whitelist })
    setSalvando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    onSalvo(`Chave de ${chave.plataforma} atualizada.`)
  }

  return (
    <ModalCentral titulo={`Editar chave — ${chave.plataforma}`} onClose={onFechar}>
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <p className="text-xs font-medium text-zinc-600 mb-2">Whitelist de tipos de solicitação</p>
          <WhitelistTipos tipos={tipos} selecionados={whitelist} onToggle={toggleTipo} />
        </div>

        <div className="flex justify-end gap-3 pt-1">
          <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>
            Cancelar
          </button>
          <button
            type="submit" disabled={salvando}
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
          >
            {salvando && <Loader2 size={14} className="animate-spin" />}
            Salvar alterações
          </button>
        </div>
      </form>
    </ModalCentral>
  )
}
