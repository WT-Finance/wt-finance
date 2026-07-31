'use client'

import { useState, type FormEvent } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { atualizarChaveApi, gerarSegredoCallbackAction } from '@/app/admin/api-externa/actions'
import type { ChaveApi, TipoDisponivel } from './tipos'
import { WhitelistTipos } from './whitelist-tipos'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import ModalCentral from '@/components/shared/modal-central'
import { Input } from '@/components/ui/field'

// v5.4.0/M2 — modal de editar chave: callback (url/segredo) + whitelist. O
// segredo de callback ATUAL nunca é exibido (nem a UI o recebe da RPC) — o
// campo em branco = MANTÉM o valor atual (banco: coalesce(p_callback_segredo,
// callback_segredo)); digitar/gerar um novo o SUBSTITUI. Só chaves ATIVAS
// chegam a este modal (o botão «Editar» já vem desabilitado numa revogada).
// onSalvo (não onFechar) dispara o router.refresh()+mensagem do PAI — mesmo
// padrão de ModalRole (admin/acessos): o modal não decide como o pai reage.

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
  const [callbackUrl, setCallbackUrl] = useState(chave.callback_url ?? '')
  const [callbackSegredo, setCallbackSegredo] = useState('')
  const [whitelist, setWhitelist] = useState<number[]>(chave.whitelist_tipos.map(t => t.id))
  const [gerandoSegredo, setGerandoSegredo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function toggleTipo(id: number) {
    setWhitelist(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  async function handleGerarSegredo() {
    setGerandoSegredo(true)
    try {
      setCallbackSegredo(await gerarSegredoCallbackAction())
    } finally {
      setGerandoSegredo(false)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro(null)
    setSalvando(true)
    const res = await atualizarChaveApi({
      id: chave.id,
      callbackUrl,
      callbackSegredo: callbackSegredo.trim() || null,
      whitelist,
    })
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
          <label htmlFor="editar-callback-url" className="block text-xs font-medium text-zinc-600 mb-1">
            Callback — URL <span className="text-zinc-400 font-normal">(opcional)</span>
          </label>
          <Input
            id="editar-callback-url" type="url" value={callbackUrl}
            onChange={e => setCallbackUrl(e.target.value)}
            placeholder="https://integrador.exemplo.com/webhook"
          />
          <p className="mt-1 text-2xs text-zinc-400">
            Endereço que o Janus CHAMA a cada movimentação das solicitações desta chave — o integrador
            fica sabendo <strong>na hora</strong>, sem perguntar. É opcional: sem ele, o desfecho
            continua disponível pela consulta
            (<code className="font-mono">GET /api/externo/solicitacoes/&#123;id&#125;</code>). Apagar a
            URL descarta os avisos que ainda estavam na fila.
          </p>
        </div>

        <div>
          <label htmlFor="editar-callback-segredo" className="block text-xs font-medium text-zinc-600 mb-1">
            Callback — segredo de saída
          </label>
          <div className="flex gap-2">
            <Input
              id="editar-callback-segredo" type="text" value={callbackSegredo}
              onChange={e => setCallbackSegredo(e.target.value)}
              placeholder={chave.tem_callback_segredo ? 'Definido — deixe em branco para manter' : 'Nenhum definido — deixe em branco para não definir'}
              className="font-mono text-xs"
            />
            <button
              type="button" onClick={handleGerarSegredo} disabled={gerandoSegredo}
              className={`shrink-0 ${PILL} ${PILL_NEUTRO}`}
            >
              {gerandoSegredo ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Gerar
            </button>
          </div>
          <p className="mt-1 text-2xs text-zinc-400">
            Senha que o Janus ENVIA em cada callback, no header{' '}
            <code className="font-mono">x-callback-secret</code>, para o integrador conferir que a
            chamada veio daqui (o contrário da chave de API, que ele envia para nós). Por segurança, o
            valor atual nunca é exibido de novo: deixe em branco para MANTÊ-LO; gere ou digite um novo
            para SUBSTITUÍ-LO — e avise quem recebe, senão os callbacks passam a ser recusados do lado dele.
          </p>
        </div>

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
