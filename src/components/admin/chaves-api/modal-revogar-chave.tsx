'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { revogarChaveApi } from '@/app/admin/chaves-api/actions'
import type { ChaveApi } from './tipos'
import { PILL, PILL_NEUTRO, PILL_PERIGO } from '@/components/shared/botoes'
import ModalCentral from '@/components/shared/modal-central'
import { Input } from '@/components/ui/field'

// v5.4.0/M2 — revogar é IRREVERSÍVEL (nenhuma RPC reativa): confirmação FORTE,
// exigindo digitar o nome exato da plataforma (mesmo rigor de ações destrutivas
// sem window.confirm — padrão ModalCentral do projeto), não um simples "Confirmar".
// onRevogado (não onFechar) dispara o router.refresh()+mensagem do PAI, mesmo
// padrão de ModalEditarChave/ModalRole — o modal não decide como o pai reage.

export function ModalRevogarChave({
  chave,
  onFechar,
  onRevogado,
}: {
  chave:      ChaveApi
  onFechar:   () => void
  onRevogado: (mensagem: string) => void
}) {
  const [confirmacao, setConfirmacao] = useState('')
  const [revogando, setRevogando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const confirmaOk = confirmacao.trim() === chave.plataforma

  async function handleRevogar() {
    setErro(null)
    setRevogando(true)
    const res = await revogarChaveApi(chave.id)
    setRevogando(false)
    if (!res.ok) {
      setErro(res.erro)
      return
    }
    onRevogado(`Chave de ${chave.plataforma} revogada.`)
  }

  return (
    <ModalCentral titulo="Revogar chave de API" onClose={onFechar}>
      {erro && (
        <div role="alert" className="mb-4 rounded-lg border border-danger bg-danger-bg px-3 py-2 text-sm text-danger">
          {erro}
        </div>
      )}

      <p className="text-sm text-zinc-600">
        Revogar a chave de <span className="font-medium">{chave.plataforma}</span>? A integração deixa de
        conseguir chamar a API IMEDIATAMENTE. Esta ação é IRREVERSÍVEL — não existe &ldquo;reativar&rdquo;; se a
        integração precisar voltar, a única saída é criar uma chave nova.
      </p>

      <div className="mt-4">
        <label htmlFor="revogar-confirma" className="block text-xs font-medium text-zinc-600 mb-1">
          Digite <span className="font-mono">{chave.plataforma}</span> para confirmar
        </label>
        <Input
          id="revogar-confirma" type="text" value={confirmacao} autoFocus
          onChange={e => setConfirmacao(e.target.value)}
          placeholder={chave.plataforma}
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onFechar} className={`${PILL} ${PILL_NEUTRO}`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={handleRevogar}
          disabled={!confirmaOk || revogando}
          title={confirmaOk ? undefined : 'Digite o nome exato da plataforma para habilitar'}
          className={`${PILL} ${PILL_PERIGO}`}
        >
          {revogando && <Loader2 size={14} className="animate-spin" />}
          Revogar definitivamente
        </button>
      </div>
    </ModalCentral>
  )
}
