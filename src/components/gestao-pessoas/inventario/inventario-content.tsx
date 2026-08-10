'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { FaixaMensagem } from '@/components/shared/faixa-mensagem'
import { carregarDetalhe } from '@/app/gestao-pessoas/inventario/actions'
import VisaoGeralTab from './visao-geral-tab'
import AtivosTab from './ativos-tab'
import MovimentacoesTab from './movimentacoes-tab'
import FichaDrawer from './ficha-drawer'
import MovimentacaoModal from './movimentacao-modal'
import AtivoFormModal, { retidosDe, type EstadoForm, type ValoresRetidos } from './ativo-form-modal'
import { ultimaMovimentacao } from './derivar'
import type {
  AtivoDetalhe, AtivoLista, CatalogosInventario, Movimentacao, ResumoInventario,
} from './tipos'

// Inventário de Ativos — casca da tela. As três abas ficam SEMPRE montadas, alternando por
// `hidden` (molde de `gerencial-section.tsx`): busca e filtros de cada aba sobrevivem à troca.
// Acessibilidade no molde de `acessos-content.tsx` (role=tablist / tab / tabpanel).
//
// M3/M4: o dado vem PRONTO da page (RSC) e cada escrita é server action + `router.refresh()`
// — o padrão da casa (tipos-content, chaves-api-content). Não há cópia local do razão: o
// estado derivado (status, área, detentor) é sempre o que o BANCO calculou, então a tela não
// tem como discordar de si mesma. O fixture da M0 morreu aqui.

type Aba = 'visao' | 'ativos' | 'movimentacoes'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'visao',         label: 'Visão geral' },
  { key: 'ativos',        label: 'Ativos' },
  { key: 'movimentacoes', label: 'Movimentações' },
]

/** Teto da RPC do razão. Batendo nele, a aba AVISA em vez de truncar em silêncio. */
const LIMITE_RAZAO = 2000

interface Props {
  ativos: AtivoLista[]
  movimentacoes: Movimentacao[]
  catalogos: CatalogosInventario
  resumo: ResumoInventario | null
  /** Alguma leitura falhou — diferente de base legitimamente vazia. */
  erroDeLeitura: boolean
}

export default function InventarioContent({
  ativos, movimentacoes, catalogos, resumo, erroDeLeitura,
}: Props) {
  const router = useRouter()
  const [aba, setAba] = useState<Aba>('visao')
  const [fichaAberta, setFichaAberta] = useState<number | null>(null)
  const [detalhe, setDetalhe] = useState<AtivoDetalhe | null>(null)
  const [movimentando, setMovimentando] = useState<number | null>(null)
  const [form, setForm] = useState<EstadoForm | null>(null)
  // Valores retidos entre cadastros — o parque inteiro será digitado numa sentada.
  const [retidos, setRetidos] = useState<ValoresRetidos | null>(null)
  // Contador de gerações do formulário: entra na `key` para o modal ser REMONTADO a cada
  // "salvar e cadastrar outro". Sem isso o `useState` do formulário não reinicia (initializer
  // só roda na montagem) e a peça seguinte nasceria com o código e a série da anterior.
  const [geracao, setGeracao] = useState(0)
  const [msg, setMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)

  const ativoDaFicha = ativos.find(a => a.id === fichaAberta) ?? null
  const ativoMovimentando = ativos.find(a => a.id === movimentando) ?? null

  /** Último detalhe PEDIDO. Abrir a ficha A e, antes de a resposta chegar, abrir a B faz duas
   *  leituras correrem juntas — sem este desempate, a resposta atrasada de A sobrescreveria a
   *  de B e o drawer mostraria o histórico do ativo errado. Vence o último pedido, não o
   *  último a responder. (Ref, não estado: não pinta tela e não pode disparar re-render.) */
  const pedidoDetalhe = useRef<number | null>(null)

  async function buscarDetalhe(alvo: number) {
    pedidoDetalhe.current = alvo
    const res = await carregarDetalhe(alvo)
    if (pedidoDetalhe.current !== alvo) return   // um pedido mais novo assumiu
    if (!res.ok) { setMsg({ tipo: 'erro', texto: res.erro }); return }
    setDetalhe(res.detalhe)
  }

  async function abrirFicha(id: number) {
    setFichaAberta(id)
    setDetalhe(null)
    await buscarDetalhe(id)
  }

  function fecharFicha() {
    pedidoDetalhe.current = null
    setFichaAberta(null)
    setDetalhe(null)
  }

  /** Depois de escrever: recarrega a página (RSC) e, se o drawer estiver aberto, o histórico. */
  async function recarregar(texto: string) {
    setMsg({ tipo: 'sucesso', texto })
    router.refresh()
    if (fichaAberta != null) await buscarDetalhe(fichaAberta)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Inventário de Ativos</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Máquinas e equipamentos do Welcome Group: onde cada item está, com quem, desde quando e por quê
        </p>
      </div>

      {erroDeLeitura && (
        <p className="mb-5 rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-sm text-[var(--warning-deep)]">
          <strong className="font-semibold">Leitura incompleta.</strong>{' '}
          Parte dos dados não pôde ser carregada agora — o que aparece abaixo pode estar
          incompleto. Recarregue a página; se persistir, avise o time.
        </p>
      )}

      {msg && (
        <div className="mb-4">
          <FaixaMensagem tipo={msg.tipo} texto={msg.texto} onFechar={() => setMsg(null)} />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 mb-5">
        <div role="tablist" aria-label="Seções do inventário de ativos" className="flex gap-2">
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
      </div>

      <div role="tabpanel" id="painel-visao" aria-labelledby="tab-visao" className={aba === 'visao' ? '' : 'hidden'}>
        <VisaoGeralTab
          resumo={resumo}
          ativos={ativos}
          movimentacoes={movimentacoes}
          onAbrirFicha={abrirFicha}
        />
      </div>
      <div role="tabpanel" id="painel-ativos" aria-labelledby="tab-ativos" className={aba === 'ativos' ? '' : 'hidden'}>
        <AtivosTab
          ativos={ativos}
          categorias={catalogos.categorias}
          areas={catalogos.areas}
          onAbrirFicha={abrirFicha}
          onNovoAtivo={() => setForm({ modo: 'criar', retidos })}
        />
      </div>
      <div role="tabpanel" id="painel-movimentacoes" aria-labelledby="tab-movimentacoes" className={aba === 'movimentacoes' ? '' : 'hidden'}>
        <MovimentacoesTab
          ativos={ativos}
          movimentacoes={movimentacoes}
          noTeto={movimentacoes.length >= LIMITE_RAZAO}
          onAbrirFicha={abrirFicha}
        />
      </div>

      {ativoDaFicha && (
        <FichaDrawer
          ativo={ativoDaFicha}
          // Histórico da RPC `detalhe_ativo` (completo e consistente com a ficha), não do
          // razão paginado da página. `null` = ainda carregando.
          historico={detalhe?.ficha.id === ativoDaFicha.id ? detalhe.historico : null}
          onFechar={fecharFicha}
          onMovimentar={() => setMovimentando(ativoDaFicha.id)}
          onEditar={() => setForm({ modo: 'editar', ativo: ativoDaFicha })}
          onDuplicar={() => {
            const base = retidosDe(ativoDaFicha, catalogos)
            setRetidos(base)
            setForm({ modo: 'criar', retidos: base })
          }}
        />
      )}

      {ativoMovimentando && (
        <MovimentacaoModal
          ativo={ativoMovimentando}
          // A ORIGEM sai do histórico COMPLETO da ficha (o modal só abre pelo drawer, que já
          // carregou o detalhe); o razão da página é fallback porque vem com teto de linhas.
          ultimaMovimentacao={ultimaMovimentacao(
            detalhe?.ficha.id === ativoMovimentando.id
              ? detalhe.historico
              : movimentacoes.filter(m => m.ativo_id === ativoMovimentando.id),
          )}
          areas={catalogos.areas}
          detentores={catalogos.detentores}
          locaisSugeridos={catalogos.locais}
          onFechar={() => setMovimentando(null)}
          onRegistrada={async texto => {
            setMovimentando(null)
            await recarregar(texto)
          }}
        />
      )}

      {form && (
        <AtivoFormModal
          estado={form}
          catalogos={catalogos}
          onFechar={() => setForm(null)}
          onSalvo={async (texto, seguintes) => {
            // Seguir cadastrando: o modal é REMONTADO com os valores retidos (a `key` muda),
            // e não mutado — assim os campos únicos nascem em branco sem lógica de limpeza.
            setRetidos(seguintes)
            setGeracao(g => g + 1)
            setForm(seguintes ? { modo: 'criar', retidos: seguintes } : null)
            await recarregar(texto)
          }}
          key={form.modo === 'editar' ? `editar-${form.ativo.id}` : `criar-${geracao}`}
        />
      )}
    </div>
  )
}
