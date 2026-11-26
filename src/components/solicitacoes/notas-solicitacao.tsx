'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { Textarea } from '@/components/ui/field'
import { fmtDataHoraSP } from '@/lib/fmt'
import { STATUS_LABEL } from '@/lib/solicitacoes/format'
import { linhaDoTempo, type EventoLinhaDoTempo, type TipoEvento } from '@/lib/solicitacoes/linha-do-tempo'
import { adicionarNota } from '@/app/solicitacoes/actions'
import type { Solicitacao } from '@/lib/solicitacoes/schemas'

// v6.5.3 — seção "Notas" do drawer (decisões do Yan, 26/11/2026): a linha do tempo da
// solicitação — movimentações e comentários — e o "Adicionar nota". Substitui os blocos
// "Aprovada por…" e "Encerramento", que passaram a viver só aqui.
//
// Cor por tipo = a mesma das badges de Movimentações (`acaoBadge`): Abertura neutra (o trio
// --brand, que nesta rota de tema group resolve para o neutro do Grupo), Aprovação âmbar
// (tinta -deep: corpo pequeno), Conclusão verde, Rejeição vermelha, Cancelamento cinza.
// Comentário: cor neutra própria (o texto do corpo), com o autor em negrito.

const MAX_NOTA = 2000

const COR: Record<TipoEvento, string> = {
  abertura:     'border-l-[var(--brand)] text-[var(--brand-deep)]',
  aprovacao:    'border-l-warning text-warning-deep',
  conclusao:    'border-l-success text-success',
  rejeicao:     'border-l-danger text-danger',
  cancelamento: 'border-l-zinc-300 text-zinc-500',
  nota:         'border-l-zinc-300 text-text-primary',
}

const VERBO: Record<Exclude<TipoEvento, 'nota'>, string> = {
  abertura:     'Aberta',
  aprovacao:    'Aprovada',
  conclusao:    STATUS_LABEL.concluida,
  rejeicao:     STATUS_LABEL.rejeitada,
  cancelamento: STATUS_LABEL.cancelada,
}

/** Uma entrada da linha do tempo. No módulo (não dentro do componente): `static-components`. */
function Entrada({ e }: { e: EventoLinhaDoTempo }) {
  return (
    <li className={`border-l-2 pl-2.5 text-xs leading-relaxed ${COR[e.tipo]}`}>
      {e.tipo === 'nota' ? (
        <>
          {/* whitespace-pre-wrap: a quebra de linha que a pessoa digitou é parte do texto */}
          <p className="whitespace-pre-wrap break-words"><strong className="font-semibold">{e.ator}</strong> comentou: {e.texto}</p>
          <p className="text-2xs text-text-subtle">{fmtDataHoraSP(e.em)}</p>
        </>
      ) : (
        <>
          <p>{VERBO[e.tipo]} por {e.ator} em {fmtDataHoraSP(e.em)}.</p>
          {e.tipo === 'rejeicao' && e.texto && (
            <p className="mt-0.5 whitespace-pre-wrap break-words"><span className="font-medium">Justificativa:</span> {e.texto}</p>
          )}
        </>
      )}
    </li>
  )
}

export default function NotasSolicitacao({ sol, onAtualizar }: {
  sol: Solicitacao
  /** Quem carrega o detalhe por action (Movimentações) rebusca; a lista do RSC se atualiza
   *  sozinha pelo `router.refresh()` (mesmo contrato de anexar/excluir no drawer). */
  onAtualizar?: () => void
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const eventos = linhaDoTempo(sol)
  const vazio = texto.trim().length === 0

  function cancelar() { setAberto(false); setTexto(''); setErro(null) }

  async function salvar() {
    if (vazio || salvando) return
    setErro(null); setSalvando(true)
    try {
      const r = await adicionarNota(sol.id, texto)
      if (!r.ok) { setErro(r.erro ?? 'Falha ao salvar a nota.'); return }
      setAberto(false); setTexto('')
      router.refresh()
      onAtualizar?.()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mb-5 border-t border-zinc-100 pt-3">
      <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-zinc-400">Notas</p>
      <ol className="space-y-2">
        {eventos.map(e => <Entrada key={e.chave} e={e} />)}
      </ol>

      {erro && <div className="mt-2"><FaixaMensagem tipo="erro" texto={erro} onFechar={() => setErro(null)} /></div>}

      {aberto ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`nota-${sol.id}`} className="sr-only">Nova nota</label>
          <Textarea
            id={`nota-${sol.id}`} rows={3} maxLength={MAX_NOTA} autoFocus
            value={texto} onChange={ev => setTexto(ev.target.value)}
            placeholder="Escreva um comentário para quem acompanha esta solicitação"
            className="resize-none"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-2xs text-text-subtle tabular-nums">{texto.length}/{MAX_NOTA}</span>
            <div className="flex gap-2">
              <button type="button" onClick={cancelar} disabled={salvando} className={`${PILL} ${PILL_NEUTRO}`}>Cancelar</button>
              <button type="button" onClick={salvar} disabled={vazio || salvando}
                className={`${PILL} ${PILL_PRIMARIA}`} style={PILL_PRIMARIA_STYLE}>
                {salvando && <Loader2 size={13} className="animate-spin" />} Salvar nota
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAberto(true)} className={`${PILL} ${PILL_NEUTRO} mt-3`}>
          <MessageSquarePlus size={13} /> Adicionar nota
        </button>
      )}
    </div>
  )
}
