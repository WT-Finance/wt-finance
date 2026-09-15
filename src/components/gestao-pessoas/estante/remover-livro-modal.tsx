'use client'

import { useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import { PILL, PILL_NEUTRO, PILL_PERIGO } from '@/components/shared/botoes'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { removerLivro } from '@/app/gestao-pessoas/estante/actions'
import type { LivroLista } from './tipos'

// Confirmação que diz a verdade ANTES de agir: `tem_historico` decide se a ação vai
// apagar ou arquivar. Depois do `ok`, a frase exibida é a que a RPC devolveu
// (`resultado.mensagem`) — quem decide de verdade é o banco, não o palpite da tela.

interface Props {
  livro: LivroLista
  onFechar: () => void
  onRemovido: (mensagem: string) => void
}

export default function RemoverLivroModal({ livro, onFechar, onRemovido }: Props) {
  const [erro, setErro]         = useState<string | null>(null)
  const [removendo, setRemovendo] = useState(false)

  async function confirmar() {
    setErro(null)
    setRemovendo(true)
    const res = await removerLivro(livro.id)
    setRemovendo(false)

    if (!res.ok) { setErro(res.erro); return }
    onRemovido(res.mensagem ?? 'Livro removido.')
  }

  const rodape = (
    <div>
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onFechar} disabled={removendo} className={`${PILL} ${PILL_NEUTRO}`}>
          Cancelar
        </button>
        <button type="button" onClick={confirmar} disabled={removendo} className={`${PILL} ${PILL_PERIGO}`}>
          {removendo
            ? 'Aguarde…'
            : livro.tem_historico ? 'Arquivar' : 'Excluir'}
        </button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo={livro.tem_historico ? 'Arquivar livro' : 'Excluir livro'}
      rodape={rodape}
      onClose={onFechar}
    >
      <p className="text-sm text-zinc-700">
        {livro.tem_historico ? (
          <>
            Arquivar <strong>{livro.titulo}</strong>? Ele já teve empréstimos, então sai da
            estante mas o histórico continua registrado.
          </>
        ) : (
          <>
            Excluir <strong>{livro.titulo}</strong>? O livro nunca foi emprestado, então some
            da estante para sempre.
          </>
        )}
      </p>
    </ModalCentral>
  )
}
