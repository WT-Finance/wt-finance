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
      label: 'Outros',
      valor: valorOutros,
      pct: (valorOutros / total) * 100,
      cor: COR_OUTROS,
      ehOutros: true,
      gruposAgregados: agregados.map(g => g.grupo_categoria),
    })
  }

  return { fatias, total }
}

// ── Lista de drill-down (categorias de um grupo / grupos de "Outros") ─────────

interface ItemLista {
  nome: string
  valor: number
}

function ListaDrill({
  titulo,
  itens,
  totalGrupo,
  cor,
  onVoltar,
}: {
  titulo: string
  itens: ItemLista[]
  totalGrupo: number
  cor: string
  onVoltar: () => void
}) {
  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-medium text-zinc-700 truncate pr-2">{titulo}</p>
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
      {itens.length === 0 ? (
        <p className="text-[11px] text-zinc-400">Sem itens no período.</p>
      ) : (
        <div className="space-y-2">
          {itens.map(it => {
            const pct = totalGrupo > 0 ? (it.valor / totalGrupo) * 100 : 0
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
                    style={{ width: `${pct.toFixed(1)}%`, background: cor, opacity: 0.55 }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Um donut (entradas OU saídas) ─────────────────────────────────────────────

function DonutLado({
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
}) {
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

  if (!fatias.length) {
    return (
      <div>
        <p className="text-xs mb-3 font-medium text-zinc-500">{titulo}</p>
        <p className="text-xs text-zinc-400">Sem dados</p>
      </div>
    )
  }

  const fatiaSel = selecionado ? fatias.find(f => f.key === selecionado) ?? null : null

  // Conteúdo do drill-down
  let drill: { titulo: string; itens: ItemLista[]; totalGrupo: number; cor: string } | null = null
  if (fatiaSel) {
    if (fatiaSel.ehOutros) {
      const itens = (fatiaSel.gruposAgregados ?? []).map(g => {
        const grupo = grupos.find(x => x.grupo_categoria === g)
        return { nome: g || '(sem grupo)', valor: grupo?.valor_total ?? 0 }
      })
      drill = {
        titulo: 'Outros grupos',
        itens,
        totalGrupo: fatiaSel.valor,
        cor: fatiaSel.cor,
      }
    } else {
      drill = {
        titulo: fatiaSel.label,
        itens: categoriasPorGrupo.get(fatiaSel.key) ?? [],
        totalGrupo: fatiaSel.valor,
        cor: fatiaSel.cor,
      }
    }
  }

  return (
    <div>
      <p className="text-xs mb-3 font-medium" style={{ color: sinal === 'entrada' ? 'var(--positive)' : 'var(--negative)' }}>
        {titulo}
      </p>

      <div className="flex items-center gap-3">
        {/* Donut com total no centro */}
        <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={fatias}
                dataKey="valor"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={64}
                paddingAngle={1.5}
                stroke="none"
                isAnimationActive={false}
                onClick={(d) => {
                  const k = (d as unknown as { key?: string } | undefined)?.key
                  if (k) setSelecionado(s => (s === k ? null : k))
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
            <span className="text-sm font-bold text-zinc-800 tabular-nums leading-tight">{fmtMi(total)}</span>
          </div>
        </div>

        {/* Legenda clicável */}
        <div className="flex-1 min-w-0 space-y-1">
          {fatias.map(f => {
            const ativo = selecionado === f.key
            return (
              <button
                key={f.key}
                onClick={() => setSelecionado(s => (s === f.key ? null : f.key))}
                className={`w-full flex items-center gap-1.5 text-left rounded px-1 py-0.5 transition-colors ${
                  ativo ? 'bg-zinc-100' : 'hover:bg-zinc-50'
                }`}
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ background: f.cor, opacity: !selecionado || ativo ? 1 : 0.4 }}
                />
                <span className="text-[11px] text-zinc-600 truncate min-w-0 flex-1">{f.label}</span>
                <span className="text-[10px] text-zinc-400 tabular-nums shrink-0">{f.pct.toFixed(1)}%</span>
              </button>
            )
          })}
        </div>
      </div>

      {drill && (
        <ListaDrill
          titulo={drill.titulo}
          itens={drill.itens}
          totalGrupo={drill.totalGrupo}
          cor={drill.cor}
          onVoltar={() => setSelecionado(null)}
        />
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ComposicaoPeriodo({ entradas, saidas, categorias }: Props) {
  if (!entradas.length && !saidas.length) {
    return <p className="text-xs text-zinc-400">Sem dados</p>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {entradas.length > 0 && (
        <DonutLado
          titulo="Entradas"
          grupos={entradas}
          paleta={PALETA_ENTRADAS}
          categorias={categorias}
          sinal="entrada"
        />
      )}
      {saidas.length > 0 && (
        <DonutLado
          titulo="Saídas"
          grupos={saidas}
          paleta={PALETA_SAIDAS}
          categorias={categorias}
          sinal="saida"
        />
      )}
    </div>
  )
}
