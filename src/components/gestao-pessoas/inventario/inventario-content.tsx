'use client'

import { useMemo, useState } from 'react'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import VisaoGeralTab from './visao-geral-tab'
import AtivosTab from './ativos-tab'
import MovimentacoesTab from './movimentacoes-tab'
import FichaDrawer from './ficha-drawer'
import MovimentacaoModal, { type NovaMovimentacao } from './movimentacao-modal'
import { derivarLinha, ultimaMovimentacao } from './derivar'
import {
  AREAS_PATRIMONIO, CATEGORIAS, DETENTORES, FICHAS, LOCAIS_SUGERIDOS, MOVIMENTACOES,
} from './fixture'
import type { Detentor, Movimentacao } from './tipos'

// Inventário de Ativos — casca da tela. As três abas ficam SEMPRE montadas, alternando por
// `hidden` (molde de `gerencial-section.tsx`): busca e filtros de cada aba sobrevivem à troca.
// Acessibilidade no molde de `acessos-content.tsx` (role=tablist / tab / tabpanel).
//
// M0: a fonte de dados é `fixture.ts` e o estado vive aqui, em memória — registrar uma
// movimentação de verdade muda o status derivado na hora, que é o comportamento que a
// aprovação precisa exercitar. A M3/M4 trocam a fonte pelas RPCs sem mexer nos componentes.

type Aba = 'visao' | 'ativos' | 'movimentacoes'

const ABAS: { key: Aba; label: string }[] = [
  { key: 'visao',         label: 'Visão geral' },
  { key: 'ativos',        label: 'Ativos' },
  { key: 'movimentacoes', label: 'Movimentações' },
]

export default function InventarioContent() {
  const [aba, setAba] = useState<Aba>('visao')
  const [movs, setMovs] = useState<Movimentacao[]>(MOVIMENTACOES)
  const [detentores, setDetentores] = useState<Detentor[]>(DETENTORES)
  const [fichaAberta, setFichaAberta] = useState<number | null>(null)
  const [movimentando, setMovimentando] = useState<number | null>(null)

  // Estado DERIVADO do razão — nenhuma coluna espelho (invariante 1).
  const ativos = useMemo(
    () => FICHAS.map(f => derivarLinha(f, movs.filter(m => m.ativo_id === f.id))),
    [movs],
  )

  const ativoDaFicha = ativos.find(a => a.id === fichaAberta) ?? null
  const ativoMovimentando = ativos.find(a => a.id === movimentando) ?? null

  function registrar(dados: NovaMovimentacao) {
    if (!ativoMovimentando) return
    const nome = dados.detentor_destino_nome
    if (nome && !detentores.some(d => d.nome === nome)) {
      // Cadastro inline do detentor (na M4 isto vira `upsert_detentor`).
      setDetentores(prev => [...prev, { id: Math.max(0, ...prev.map(d => d.id)) + 1, nome, ativo: true }])
    }
    const area = dados.area_destino_nome
      ? AREAS_PATRIMONIO.find(a => a.nome === dados.area_destino_nome) ?? null
      : null
    setMovs(prev => [...prev, {
      id: Math.max(0, ...prev.map(m => m.id)) + 1,
      ativo_id: ativoMovimentando.id,
      tipo: dados.tipo,
      data_movimentacao: dados.data_movimentacao,
      area_destino_id: area?.id ?? null,
      area_destino_nome: dados.area_destino_nome,
      detentor_destino_id: null,
      detentor_destino_nome: dados.detentor_destino_nome,
      destino_texto: dados.destino_texto,
      motivo_baixa: dados.motivo_baixa,
      obs: dados.obs,
      registrado_por_rotulo: 'Você (sessão atual)',
      criado_em: new Date().toISOString(),
    }])
    setMovimentando(null)
  }

  const abrirFicha = (id: number) => setFichaAberta(id)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-900">Inventário de Ativos</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Máquinas e equipamentos do Welcome Group: onde cada item está, com quem, desde quando e por quê
        </p>
      </div>

      {/* Aviso de MOCKUP — sai na M3, quando a tela passa a ler as RPCs. */}
      <p className="mb-5 rounded-lg border border-warning bg-warning-bg px-4 py-2.5 text-sm text-[var(--warning-deep)]">
        <strong className="font-semibold">Pré-visualização (M0).</strong>{' '}
        Os dados são fictícios e vivem só nesta aba do navegador — nada é gravado. Registrar uma
        movimentação funciona de verdade, para conferir o status derivado e a origem na timeline.
        O cadastro de ativos entra na missão seguinte.
      </p>

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
        <VisaoGeralTab ativos={ativos} movimentacoes={movs} onAbrirFicha={abrirFicha} />
      </div>
      <div role="tabpanel" id="painel-ativos" aria-labelledby="tab-ativos" className={aba === 'ativos' ? '' : 'hidden'}>
        <AtivosTab
          ativos={ativos}
          categorias={CATEGORIAS}
          areas={AREAS_PATRIMONIO}
          onAbrirFicha={abrirFicha}
        />
      </div>
      <div role="tabpanel" id="painel-movimentacoes" aria-labelledby="tab-movimentacoes" className={aba === 'movimentacoes' ? '' : 'hidden'}>
        <MovimentacoesTab ativos={ativos} movimentacoes={movs} onAbrirFicha={abrirFicha} />
      </div>

      {ativoDaFicha && (
        <FichaDrawer
          ativo={ativoDaFicha}
          historico={movs.filter(m => m.ativo_id === ativoDaFicha.id)}
          onFechar={() => setFichaAberta(null)}
          onMovimentar={() => setMovimentando(ativoDaFicha.id)}
        />
      )}

      {ativoMovimentando && (
        <MovimentacaoModal
          ativo={ativoMovimentando}
          ultimaMovimentacao={ultimaMovimentacao(movs.filter(m => m.ativo_id === ativoMovimentando.id))}
          areas={AREAS_PATRIMONIO}
          detentores={detentores}
          locaisSugeridos={LOCAIS_SUGERIDOS}
          onFechar={() => setMovimentando(null)}
          onRegistrar={registrar}
        />
      )}
    </div>
  )
}
