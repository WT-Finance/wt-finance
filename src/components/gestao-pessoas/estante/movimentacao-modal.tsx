'use client'

import { useState } from 'react'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/field'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { hojeSP } from '@/lib/fmt'
import { registrarMovimentacao } from '@/app/gestao-pessoas/estante/actions'
import type { LivroLista, TipoMovimentacaoEstante } from './tipos'

// Modal de movimentação (pegar/devolver) da Estante — molde:
// `inventario/movimentacao-modal.tsx`. Extraído do `ModalCentral` que a Tarefa 8 deixou
// inline em `estante-content.tsx`: aquele inline chamava a RPC com `data_movimentacao: null`
// (o banco resolve para "hoje de SP") e não tinha campo de data — a Tarefa 9 pede o campo
// explícito (default hoje, retroativa liberada, igual ao razão que a Ficha já mostra).

interface Props {
  livro: LivroLista
  tipo: TipoMovimentacaoEstante
  meuId: string | null
  onFechar: () => void
  onRegistrada: (mensagem: string) => void
}

export default function MovimentacaoModal({ livro, tipo, meuId, onFechar, onRegistrada }: Props) {
  // O modal só monta por interação do usuário (nunca no SSR), então `hojeSP()` no
  // initializer não corre risco de divergência de hidratação (mesma nota do molde).
  const [data, setData] = useState(() => hojeSP())
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Devolvendo em nome de OUTRA pessoa (só a gestão chega aqui — `acaoDaLinha`/`DEVOLUCAO_DE_OUTRO`
  // trava o resto): a frase precisa dizer de quem é a devolução, não tratar como se fosse minha.
  const devolvendoDeOutro = tipo === 'devolucao' && livro.portador_id !== meuId && !!livro.portador_nome

  async function confirmar() {
    if (data.trim() === '') { setErro('Informe a data da movimentação.'); return }
    setErro(null)
    setSalvando(true)
    const res = await registrarMovimentacao({
      livro_id: livro.id,
      tipo,
      data_movimentacao: data,
      obs: obs.trim() === '' ? null : obs.trim(),
    })
    setSalvando(false)

    if (!res.ok) { setErro(res.erro); return }
    onRegistrada(tipo === 'emprestimo'
      ? `"${livro.titulo}" registrado como emprestado.`
      : `"${livro.titulo}" devolvido à estante.`)
  }

  const rodape = (
    <div>
      {/* Erro DENTRO do modal, junto do botão — erro fora da vista não é visto (v5.4.3). */}
      {erro && <FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="contorno" size="sm" onClick={onFechar} disabled={salvando}>Cancelar</Button>
        <Button variant="solido" size="sm" onClick={confirmar} disabled={salvando}>
          {salvando ? 'Registrando…' : tipo === 'emprestimo' ? 'Registrar empréstimo' : 'Registrar devolução'}
        </Button>
      </div>
    </div>
  )

  return (
    <ModalCentral
      titulo={tipo === 'emprestimo' ? 'Confirmar empréstimo' : 'Confirmar devolução'}
      subtitulo={livro.titulo}
      rodape={rodape}
      onClose={onFechar}
    >
      <p className="text-sm text-zinc-700">
        {tipo === 'emprestimo'
          ? <>Registrar que você pegou <strong>{livro.titulo}</strong>.</>
          : devolvendoDeOutro
            ? <>Registrar a devolução de <strong>{livro.titulo}</strong>, que está com {livro.portador_nome}.</>
            : <>Registrar que você está devolvendo <strong>{livro.titulo}</strong>.</>}
      </p>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-zinc-600">Data *</span>
        <Input type="date" value={data} onChange={e => setData(e.target.value)} className="w-40" />
        <span className="text-2xs text-[var(--text-subtle)]">
          Data anterior é permitida — o histórico se reordena sozinho.
        </span>
      </label>

      <label className="mt-3 flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-zinc-600">Observação (opcional)</span>
        <Textarea rows={2} value={obs} onChange={e => setObs(e.target.value)} className="resize-none" />
      </label>
    </ModalCentral>
  )
}
