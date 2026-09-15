'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import ModalCentral from '@/components/shared/modal-central'
import Button from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { carregarFicha, registrarMovimentacao, type Ficha } from '@/app/gestao-pessoas/estante/actions'
import AcervoTab from './acervo-tab'
import FichaDrawer from './ficha-drawer'
import LivroFormModal, { type EstadoForm } from './livro-form-modal'
import RemoverLivroModal from './remover-livro-modal'
import type { LivroLista, MovimentacaoEstante, TipoMovimentacaoEstante } from './tipos'

// Estante Welcome — casca da tela (v5.11.0/M3). As duas abas ficam SEMPRE montadas,
// alternando por `hidden` (molde: inventario-content.tsx): busca/filtro do Acervo
// sobrevivem à troca de aba. A aba Histórico é a Tarefa 9 — aqui é só o placeholder.
//
// Dado vem PRONTO da page (RSC); cada escrita é server action + `router.refresh()` — o
// padrão da casa. A ficha é a ÚNICA exceção: ela é buscada de novo ao abrir o drawer
// (`carregarFicha`), porque a lista da page pode ter ficado desatualizada entre o render
// e o clique (invariante 10 do briefing).

type Aba = 'acervo' | 'historico'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'acervo',    label: 'Acervo' },
  { key: 'historico', label: 'Histórico' },
]

interface Movimentando {
  livro: LivroLista
  tipo: TipoMovimentacaoEstante
}

interface Props {
  livros: LivroLista[]
  movimentacoes: MovimentacaoEstante[]
  erroDeLeitura: boolean
  podeGerir: boolean
  meuId: string | null
}

export default function EstanteContent({ livros, movimentacoes, erroDeLeitura, podeGerir, meuId }: Props) {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('acervo')

  const [livroAbertoId, setLivroAbertoId] = useState<number | null>(null)
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [fichaFalhou, setFichaFalhou] = useState(false)

  const [form, setForm] = useState<EstadoForm | null>(null)
  const [livroParaRemover, setLivroParaRemover] = useState<LivroLista | null>(null)
  const [movimentando, setMovimentando] = useState<Movimentando | null>(null)
  const [obsMovimentacao, setObsMovimentacao] = useState('')
  const [erroMovimentacao, setErroMovimentacao] = useState<string | null>(null)
  const [salvandoMovimentacao, setSalvandoMovimentacao] = useState(false)

  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const livroAberto = livros.find(l => l.id === livroAbertoId) ?? null

  // Último pedido de ficha VENCE: abrir A e, antes da resposta, abrir B faz duas leituras
  // correrem juntas — sem este desempate a resposta atrasada de A sobrescreveria a de B
  // (mesmo padrão de `inventario-content.tsx`).
  const pedidoFicha = useRef<number | null>(null)

  async function abrirFicha(id: number) {
    setLivroAbertoId(id)
    setFicha(null)
    setFichaFalhou(false)
    pedidoFicha.current = id
    const res = await carregarFicha(id)
    if (pedidoFicha.current !== id) return
    if (res === null) { setFichaFalhou(true); return }
    setFicha(res)
  }

  function fecharFicha() {
    pedidoFicha.current = null
    setLivroAbertoId(null)
    setFicha(null)
    setFichaFalhou(false)
  }

  async function recarregar(texto: string) {
    setMsg({ tipo: 'sucesso', texto })
    router.refresh()
    if (livroAbertoId != null) await abrirFicha(livroAbertoId)
  }

  function abrirMovimentacao(livro: LivroLista, tipo: TipoMovimentacaoEstante) {
    setMovimentando({ livro, tipo })
    setObsMovimentacao('')
    setErroMovimentacao(null)
  }

  async function confirmarMovimentacao() {
    if (!movimentando) return
    setErroMovimentacao(null)
    setSalvandoMovimentacao(true)
    const res = await registrarMovimentacao({
      livro_id: movimentando.livro.id,
      tipo: movimentando.tipo,
      data_movimentacao: null, // a RPC usa o hoje de São Paulo
      obs: obsMovimentacao.trim() === '' ? null : obsMovimentacao.trim(),
    })
    setSalvandoMovimentacao(false)

    if (!res.ok) { setErroMovimentacao(res.erro); return }

    const texto = movimentando.tipo === 'emprestimo'
      ? `"${movimentando.livro.titulo}" registrado como emprestado.`
      : `"${movimentando.livro.titulo}" devolvido à estante.`
    setMovimentando(null)
    await recarregar(texto)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Estante Welcome</h1>
          <p className="mt-0.5 text-sm text-text-subtle">
            Livros do Welcome Group: quem está com cada exemplar, desde quando e o histórico completo
          </p>
        </div>
        {podeGerir && (
          <button
            type="button"
            onClick={() => setForm({ modo: 'criar' })}
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
          >
            <Plus size={13} /> Cadastrar livro
          </button>
        )}
      </div>

      {erroDeLeitura && (
        <p className="mb-5 rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-sm text-[var(--warning-deep)]">
          <strong className="font-semibold">Leitura incompleta.</strong>{' '}
          Não foi possível carregar a estante. Tente recarregar a página.
        </p>
      )}

      {msg && (
        <div className="mb-4">
          <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />
        </div>
      )}

      <div role="tablist" aria-label="Seções da Estante Welcome" className="flex gap-2 mb-5">
        {ABAS.map(({ key, label }) => {
          const ativa = aba === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              aria-selected={ativa}
              aria-controls={`painel-${key}`}
              onClick={() => setAba(key)}
              className={`${PILL} whitespace-nowrap ${ativa ? PILL_PRIMARIA : PILL_NEUTRO}`}
              style={ativa ? PILL_PRIMARIA_STYLE : undefined}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id="painel-acervo" aria-labelledby="tab-acervo" className={aba === 'acervo' ? '' : 'hidden'}>
        <AcervoTab
          livros={livros}
          podeGerir={podeGerir}
          meuId={meuId}
          onAbrirFicha={abrirFicha}
          onPegar={livro => abrirMovimentacao(livro, 'emprestimo')}
          onDevolver={livro => abrirMovimentacao(livro, 'devolucao')}
        />
      </div>
      <div role="tabpanel" id="painel-historico" aria-labelledby="tab-historico" className={aba === 'historico' ? '' : 'hidden'}>
        {/* Tarefa 9: razão completo da estante (tabela + filtros), consumindo `movimentacoes`.
            Placeholder até lá — a contagem já dá uma ideia do tamanho do razão. */}
        <p className="py-10 text-center text-sm text-[var(--text-subtle)]">
          O histórico completo da estante ({movimentacoes.length} {movimentacoes.length === 1 ? 'movimentação' : 'movimentações'}) chega na próxima etapa.
        </p>
      </div>

      {livroAberto && (
        <FichaDrawer
          livro={livroAberto}
          ficha={ficha}
          falhou={fichaFalhou}
          podeGerir={podeGerir}
          meuId={meuId}
          onFechar={fecharFicha}
          onEditar={() => setForm({ modo: 'editar', livro: livroAberto })}
          onRemover={() => setLivroParaRemover(livroAberto)}
          onPegar={() => abrirMovimentacao(livroAberto, 'emprestimo')}
          onDevolver={() => abrirMovimentacao(livroAberto, 'devolucao')}
        />
      )}

      {form && (
        <LivroFormModal
          estado={form}
          onFechar={() => setForm(null)}
          onSalvo={async texto => {
            setForm(null)
            await recarregar(texto)
          }}
        />
      )}

      {livroParaRemover && (
        <RemoverLivroModal
          livro={livroParaRemover}
          onFechar={() => setLivroParaRemover(null)}
          onRemovido={async texto => {
            const idRemovido = livroParaRemover.id
            setLivroParaRemover(null)
            if (livroAbertoId === idRemovido) fecharFicha()
            setMsg({ tipo: 'sucesso', texto })
            router.refresh()
          }}
        />
      )}

      {movimentando && (
        <ModalCentral
          titulo={movimentando.tipo === 'emprestimo' ? 'Confirmar empréstimo' : 'Confirmar devolução'}
          subtitulo={movimentando.livro.titulo}
          rodape={
            <div>
              {erroMovimentacao && (
                <FaixaMensagem tipo="erro" texto={erroMovimentacao} onFechar={() => setErroMovimentacao(null)} />
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="contorno" size="sm" onClick={() => setMovimentando(null)} disabled={salvandoMovimentacao}>
                  Cancelar
                </Button>
                <Button variant="solido" size="sm" onClick={confirmarMovimentacao} disabled={salvandoMovimentacao}>
                  {salvandoMovimentacao ? 'Registrando…' : movimentando.tipo === 'emprestimo' ? 'Registrar empréstimo' : 'Registrar devolução'}
                </Button>
              </div>
            </div>
          }
          onClose={() => setMovimentando(null)}
        >
          <p className="text-sm text-zinc-700">
            {movimentando.tipo === 'emprestimo'
              ? <>Registrar que você está pegando <strong>{movimentando.livro.titulo}</strong>, com data de hoje.</>
              : <>Registrar a devolução de <strong>{movimentando.livro.titulo}</strong>, com data de hoje.</>}
          </p>
          <label className="mt-3 flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-zinc-600">Observação (opcional)</span>
            <Textarea
              rows={2}
              value={obsMovimentacao}
              onChange={e => setObsMovimentacao(e.target.value)}
              className="resize-none"
            />
          </label>
        </ModalCentral>
      )}
    </div>
  )
}
