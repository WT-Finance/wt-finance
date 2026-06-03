'use client'

import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { fmtBRL, fmtMi } from '@/lib/fmt'

// ── Tipos ───────────────────────────────────────────────────────────────────

interface DecomposicaoGrupo {
  grupo_categoria: string
  sinal: 'entrada' | 'saida'
  valor_total: number // magnitude positiva (RPC retorna ABS)
}

interface DecomposicaoCategoria {
  categoria: string
  grupo_categoria: string
  sinal: 'entrada' | 'saida'
  valor_total: number // magnitude positiva
}

interface Props {
  entradas: DecomposicaoGrupo[] // sinal === 'entrada', ordenado por valor_total desc
  saidas: DecomposicaoGrupo[] // sinal === 'saida', ordenado por valor_total desc
  categorias: DecomposicaoCategoria[] // todas as categorias (todos os grupos), p/ drill-down
}

// ── Paletas dessaturadas (design system) ────────────────────────────────────
// Entradas: viés verde sage. Saídas: viés terracota/quente. "Outros" sempre o
// último tom (mais neutro/claro) de cada paleta.

const PALETA_ENTRADAS = [
  '#5F7A3D', // --positive
  '#7E9658',
  '#9FB37B',
  '#3F5028', // --positive-deep
  '#C4D5A6', // --positive-soft
]

const PALETA_SAIDAS = [
  '#A35442', // --negative
  '#B97058',
  '#C98C6E',
  '#6B2D1F', // --negative-deep
  '#9C7A6A',
  '#BFA292',
  '#E8C9C0', // --negative-soft (reservada p/ "Outros")
]

const COR_OUTROS = '#B8B2A8' // neutro morno

const MAX_FATIAS = 6 // top N grupos; demais (ou < LIMITE_PCT) viram "Outros"
const LIMITE_PCT = 2 // grupos abaixo de 2% do total são dobrados em "Outros"

// ── Estruturas internas do donut ─────────────────────────────────────────────

interface Fatia {
  key: string // grupo_categoria, ou '__outros__'
  label: string
  valor: number
  pct: number
  cor: string
  ehOutros: boolean
  gruposAgregados?: string[] // só p/ a fatia "Outros": os grupos que entraram
}

/**
 * Constrói as fatias do donut a partir dos grupos ordenados desc.
 * Mantém os top MAX_FATIAS com pct >= LIMITE_PCT; o restante vira "Outros".
 */
function montarFatias(grupos: DecomposicaoGrupo[], paleta: string[]): {
  fatias: Fatia[]
  total: number
} {
  const total = grupos.reduce((s, g) => s + g.valor_total, 0)
  if (total <= 0) return { fatias: [], total: 0 }

  const principais: DecomposicaoGrupo[] = []
  const agregados: DecomposicaoGrupo[] = []

  for (const g of grupos) {
    const pct = (g.valor_total / total) * 100
    if (principais.length < MAX_FATIAS && pct >= LIMITE_PCT) {
      principais.push(g)
    } else {
      agregados.push(g)
    }
  }

  const fatias: Fatia[] = principais.map((g, i) => ({
    key: g.grupo_categoria,
    label: g.grupo_categoria || '(sem grupo)',
    valor: g.valor_total,
    pct: (g.valor_total / total) * 100,
    cor: paleta[i % paleta.length],
    ehOutros: false,
  }))

  if (agregados.length > 0) {
    const valorOutros = agregados.reduce((s, g) => s + g.valor_total, 0)
    fatias.push({
      key: '__outros__',
      label: `Outros (${agregados.length} ${agregados.length === 1 ? 'grupo' : 'grupos'})`,
      valor: valorOutros,
      pct: (valorOutros / total) * 100,
      cor: COR_OUTROS,
      ehOutros: true,
      gruposAgregados: agregados.map(g => g.grupo_categoria),
    })
  }

  return { fatias, total }
}

// ── Item de drill-down (categorias de um grupo / grupos de "Outros") ──────────

interface ItemLista {
  nome: string
  valor: number
}

// ── Donut (panorama) ─────────────────────────────────────────────────────────
// Maior que o legado; sem legenda lateral (a tabela abaixo cumpre esse papel).
// Continua clicável e sincroniza a seleção com a tabela do mesmo lado.

function Donut({
  titulo,
  fatias,
  total,
  sinal,
  selecionado,
  onSelecionar,
}: {
  titulo: string
  fatias: Fatia[]
  total: number
  sinal: 'entrada' | 'saida'
  selecionado: string | null
  onSelecionar: (key: string) => void
}) {
  const corTitulo = sinal === 'entrada' ? 'var(--positive)' : 'var(--negative)'

  if (!fatias.length) {
    return (
      <div className="flex flex-col items-center">
        <p className="text-xs mb-3 font-medium" style={{ color: corTitulo }}>{titulo}</p>
        <p className="text-xs text-zinc-400">Sem dados</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs mb-3 font-medium" style={{ color: corTitulo }}>{titulo}</p>
      <div className="relative" style={{ width: 184, height: 184 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={fatias}
              dataKey="valor"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={90}
              paddingAngle={1.5}
              stroke="none"
              isAnimationActive={false}
              onClick={(d) => {
                const k = (d as unknown as { key?: string } | undefined)?.key
                if (k) onSelecionar(k)
              }}
              className="cursor-pointer outline-none focus:outline-none"
            >
              {fatias.map(f => (
                <Cell
                  key={f.key}
                  fill={f.cor}
                  fillOpacity={!selecionado || selecionado === f.key ? 1 : 0.35}
                  className="cursor-pointer outline-none focus:outline-none"
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] text-zinc-400 leading-tight">{titulo}</span>
          <span className="text-base font-bold text-zinc-800 tabular-nums leading-tight">{fmtMi(total)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Tabela de decomposição (detalhe) ──────────────────────────────────────────
// Grupo · % · Valor + linha de Total. Clicar num grupo abre o drill (categorias
// do grupo, ou os grupos agregados de "Outros"). Sincroniza com o donut.

function TabelaDecomposicao({
  titulo,
  fatias,
  total,
  sinal,
  selecionado,
  onSelecionar,
  itensDrill,
  totalDrill,
  corDrill,
  onVoltar,
}: {
  titulo: string
  fatias: Fatia[]
  total: number
  sinal: 'entrada' | 'saida'
  selecionado: string | null
  onSelecionar: (key: string) => void
  itensDrill: ItemLista[] | null
  totalDrill: number
  corDrill: string
  onVoltar: () => void
}) {
  const corTitulo = sinal === 'entrada' ? 'var(--positive)' : 'var(--negative)'

  if (!fatias.length) {
    return (
      <div>
        <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>
        <p className="text-xs text-zinc-400">Sem dados</p>
      </div>
    )
  }

  const fatiaSel = selecionado ? fatias.find(f => f.key === selecionado) ?? null : null

  return (
    <div>
      <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>

      <table className="table-fixed w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-zinc-400">
            <th className="text-left font-semibold pb-1.5">Grupo</th>
            <th className="text-right font-semibold pb-1.5 w-14">%</th>
            <th className="text-right font-semibold pb-1.5 w-24">Valor</th>
          </tr>
        </thead>
        <tbody>
          {fatias.map(f => {
            const ativo = selecionado === f.key
            return (
              <tr
                key={f.key}
                onClick={() => onSelecionar(f.key)}
                className={`cursor-pointer border-b border-zinc-50 transition-colors ${
                  ativo ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                }`}
              >
                <td className="py-1.5 pr-2 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: f.cor, opacity: !selecionado || ativo ? 1 : 0.4 }}
                    />
                    <span className="text-[11px] text-zinc-700 truncate">{f.label}</span>
                  </span>
                </td>
                <td className="py-1.5 text-right text-[10px] text-zinc-400 tabular-nums align-middle">
                  {f.pct.toFixed(1)}%
                </td>
                <td className="py-1.5 text-right text-[11px] font-medium text-zinc-800 tabular-nums align-middle">
                  {fmtMi(f.valor)}
                </td>
              </tr>
            )
          })}
          {/* Total */}
          <tr>
            <td className="pt-2 text-[11px] font-semibold" style={{ color: corTitulo }}>Total</td>
            <td className="pt-2 text-right text-[10px] text-zinc-400 tabular-nums">100%</td>
            <td className="pt-2 text-right text-[11px] font-semibold tabular-nums" style={{ color: corTitulo }}>
              {fmtMi(total)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Drill-down do grupo/“Outros” selecionado */}
      {fatiaSel && itensDrill && (
        <div className="mt-3 border-t border-zinc-100 pt-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-medium text-zinc-700 truncate pr-2">
              {fatiaSel.ehOutros ? 'Outros grupos' : fatiaSel.label}
            </p>
            <button
              onClick={onVoltar}
              className="shrink-0 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              voltar
            </button>
          </div>
          {itensDrill.length === 0 ? (
            <p className="text-[11px] text-zinc-400">Sem itens no período.</p>
          ) : (
            <div className="space-y-2">
              {itensDrill.map(it => {
                const pct = totalDrill > 0 ? (it.valor / totalDrill) * 100 : 0
                return (
                  <div key={it.nome}>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-[11px] text-zinc-600 truncate pr-2 min-w-0">
                        {it.nome || '(sem categoria)'}
                      </span>
                      <div className="flex items-baseline gap-1.5 shrink-0">
                        <span className="text-[10px] text-zinc-400 tabular-nums">{pct.toFixed(1)}%</span>
                        <span className="text-[11px] font-medium text-zinc-800 tabular-nums">{fmtBRL(it.valor)}</span>
                      </div>
                    </div>
                    <div className="h-[3px] rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct.toFixed(1)}%`, background: corDrill, opacity: 0.55 }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Um lado (entradas OU saídas): donut + tabela compartilham seleção ─────────
// Custom hook (`use...`) para satisfazer as regras de hooks: o donut (em cima) e a
// tabela (embaixo) ficam em grids distintos no layout, mas precisam compartilhar a
// mesma seleção/drill — então a seleção vive aqui e devolvemos os dois nós prontos.

function useLado({
  titulo,
  grupos,
  paleta,
  categorias,
  sinal,
}: {
  titulo: string
  grupos: DecomposicaoGrupo[]
  paleta: string[]
  categorias: DecomposicaoCategoria[]
  sinal: 'entrada' | 'saida'
}): {
  donut: React.ReactNode
  tabela: React.ReactNode
} {
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const { fatias, total } = useMemo(() => montarFatias(grupos, paleta), [grupos, paleta])

  // Mapa grupo -> categorias (filtradas pelo sinal correto), ordenadas desc
  const categoriasPorGrupo = useMemo(() => {
    const m = new Map<string, ItemLista[]>()
    for (const c of categorias) {
      if (c.sinal !== sinal) continue
      const arr = m.get(c.grupo_categoria) ?? []
      arr.push({ nome: c.categoria, valor: c.valor_total })
      m.set(c.grupo_categoria, arr)
    }
    for (const arr of m.values()) arr.sort((a, b) => b.valor - a.valor)
    return m
  }, [categorias, sinal])

  const toggle = (key: string) => setSelecionado(s => (s === key ? null : key))

  const fatiaSel = selecionado ? fatias.find(f => f.key === selecionado) ?? null : null

  // Conteúdo do drill-down
  let itensDrill: ItemLista[] | null = null
  let totalDrill = 0
  let corDrill = COR_OUTROS
  if (fatiaSel) {
    corDrill = fatiaSel.cor
    totalDrill = fatiaSel.valor
    if (fatiaSel.ehOutros) {
      itensDrill = (fatiaSel.gruposAgregados ?? []).map(g => {
        const grupo = grupos.find(x => x.grupo_categoria === g)
        return { nome: g || '(sem grupo)', valor: grupo?.valor_total ?? 0 }
      })
    } else {
      itensDrill = categoriasPorGrupo.get(fatiaSel.key) ?? []
    }
  }

  return {
    donut: (
      <Donut
        titulo={titulo}
        fatias={fatias}
        total={total}
        sinal={sinal}
        selecionado={selecionado}
        onSelecionar={toggle}
      />
    ),
    tabela: (
      <TabelaDecomposicao
        titulo={titulo}
        fatias={fatias}
        total={total}
        sinal={sinal}
        selecionado={selecionado}
        onSelecionar={toggle}
        itensDrill={itensDrill}
        totalDrill={totalDrill}
        corDrill={corDrill}
        onVoltar={() => setSelecionado(null)}
      />
    ),
  }
}

// ── Componente principal ──────────────────────────────────────────────────────
// EM CIMA: dois donuts (panorama) lado a lado. ABAIXO: tabela de decomposição em
// duas colunas (Entradas | Saídas). Donut e tabela do mesmo lado compartilham a
// seleção/drill — redundância proposital (panorama + detalhe).

export default function ComposicaoPeriodo({ entradas, saidas, categorias }: Props) {
  const ladoEntradas = useLado({
    titulo: 'Entradas',
    grupos: entradas,
    paleta: PALETA_ENTRADAS,
    categorias,
    sinal: 'entrada',
  })
  const ladoSaidas = useLado({
    titulo: 'Saídas',
    grupos: saidas,
    paleta: PALETA_SAIDAS,
    categorias,
    sinal: 'saida',
  })

  if (!entradas.length && !saidas.length) {
    return <p className="text-xs text-zinc-400">Sem dados</p>
  }

  return (
    <div className="space-y-6">
      {/* Donuts (panorama) — lado a lado, maiores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 justify-items-center">
        {ladoEntradas.donut}
        {ladoSaidas.donut}
      </div>

      {/* Tabela de decomposição (detalhe) — duas colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6 border-t border-zinc-100 pt-5">
        {ladoEntradas.tabela}
        {ladoSaidas.tabela}
      </div>
    </div>
  )
}
