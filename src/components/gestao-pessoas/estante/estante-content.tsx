'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { carregarFicha, type Ficha } from '@/app/gestao-pessoas/estante/actions'
import AcervoTab from './acervo-tab'
import FichaDrawer from './ficha-drawer'
import HistoricoTab from './historico-tab'
import LivroFormModal, { type EstadoForm } from './livro-form-modal'
import MovimentacaoModal from './movimentacao-modal'
import RemoverLivroModal from './remover-livro-modal'
import type { LivroLista, MovimentacaoEstante, TipoMovimentacaoEstante } from './tipos'

// Estante Welcome — casca da tela (v5.11.0/M3-M4). As duas abas ficam SEMPRE montadas,
// alternando por `hidden` (molde: inventario-content.tsx): busca/filtro do Acervo e do
// Histórico sobrevivem à troca de aba.
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

  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  // O drawer é montado por ID, não pela linha ENCONTRADA em `livros`: essa lista só traz
  // livros não-arquivados (`p_incluir_arquivados` default false), mas o Histórico e a
  // própria `carregarFicha` não filtram arquivado (invariante 6 — histórico legível após
  // arquivar). Montar por objeto encontrado deixava a ficha de um livro arquivado num no-op
  // silencioso: `carregarFicha` respondia com sucesso, o estado era gravado, e nada
  // renderizava porque `livroAberto` nunca existia em `livros`. `ficha?.livro` já vem no
  // MESMO formato de `LivroLista` (migration 0272 padronizou o `jsonb_build_object` para
  // isso); o fallback em `livros.find` só cobre o instante entre o clique e a resposta da
  // ficha, quando o título ainda precisa aparecer no cabeçalho do drawer.
  const livroAberto = ficha?.livro ?? livros.find(l => l.id === livroAbertoId) ?? null

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
        <HistoricoTab movimentacoes={movimentacoes} onAbrirFicha={abrirFicha} />
      </div>

      {livroAbertoId != null && (
        <FichaDrawer
          livro={livroAberto}
          ficha={ficha}
          falhou={fichaFalhou}
          podeGerir={podeGerir}
          meuId={meuId}
          onFechar={fecharFicha}
          onEditar={() => { if (livroAberto) setForm({ modo: 'editar', livro: livroAberto }) }}
          onRemover={() => { if (livroAberto) setLivroParaRemover(livroAberto) }}
          onPegar={() => { if (livroAberto) abrirMovimentacao(livroAberto, 'emprestimo') }}
          onDevolver={() => { if (livroAberto) abrirMovimentacao(livroAberto, 'devolucao') }}
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
        <MovimentacaoModal
          livro={movimentando.livro}
          tipo={movimentando.tipo}
          meuId={meuId}
          onFechar={() => setMovimentando(null)}
          onRegistrada={async texto => {
            setMovimentando(null)
            await recarregar(texto)
          }}
        />
      )}
    </div>
  )
}
