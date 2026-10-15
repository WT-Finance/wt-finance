'use client'

import { useState, type ReactNode } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PERIGO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import type { ResultadoAcao } from '@/app/financeiro/geral/actions'
import { mensagemDeFalhaDaAcao } from '@/lib/financeiro-geral/gestao'

// Confirmação de uma ação do painel de antecipações (excluir, desfazer). Diferente do `ConfirmModal`
// compartilhado, que fecha ao resolver sem olhar o retorno: aqui o resultado É lido — se a action
// devolve `ok: false`, o erro aparece DENTRO do modal, junto do botão (erro fora da vista não é visto,
// v5.4.3) e o modal continua aberto. Só `ok: true` fecha e avisa o painel.

interface Props {
  titulo: string
  mensagem: ReactNode
  rotuloConfirmar: string
  /** Ação destrutiva (excluir) usa a pill de perigo; reversível (desfazer) a primária. */
  perigo?: boolean
  onConfirmar: () => Promise<ResultadoAcao>
  onFechar: () => void
  onConcluido: (mensagem: string) => void
}

export default function ConfirmarAcaoModal({
  titulo, mensagem, rotuloConfirmar, perigo = false, onConfirmar, onFechar, onConcluido,
}: Props) {
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)

  async function confirmar() {
    setErro(null)
    setProcessando(true)
    // A action pode LANÇAR (sessão expirada, permissão, rede): sem try/finally o botão ficaria preso em
    // "Aguarde…". `onConcluido` fica fora do try — erro dele não é falha da action.
    let res: ResultadoAcao
    try {
      res = await onConfirmar()
    } catch (e) {
      setErro(mensagemDeFalhaDaAcao(e))
      return
    } finally {
      setProcessando(false)
    }
    if (!res.ok) { setErro(res.erro); return }
    onConcluido(res.mensagem)
  }

  const rodape = (
    <div>
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onFechar} disabled={processando} className={`${PILL} ${PILL_NEUTRO}`}>
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirmar}
          disabled={processando}
          className={perigo ? `${PILL} ${PILL_PERIGO}` : `${PILL} ${PILL_PRIMARIA}`}
          style={perigo ? undefined : PILL_PRIMARIA_STYLE}
        >
          {processando ? 'Aguarde…' : rotuloConfirmar}
        </button>
      </div>
    </div>
  )

  return (
    <ModalCentral titulo={titulo} rodape={rodape} onClose={onFechar}>
      <div className="text-sm text-zinc-700">{mensagem}</div>
    </ModalCentral>
  )
}
