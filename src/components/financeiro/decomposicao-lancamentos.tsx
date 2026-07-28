'use client'

// Decomposição dos Lançamentos (v5.3.1) — barras horizontais agrupadas por BLOCO
// da ESTRUTURA VIVA da DRE, não pelo grupo nativo do Monde. Por quê: 20 das 130
// categorias são RE-PARENTEADAS pelo de-para curado (a categoria nasce num grupo
// do Monde e é mapeada a um bloco diferente na estrutura) — agrupar pelo grupo
// nativo NÃO fecharia com os subtotais da tabela da DRE logo acima, no mesmo
// card. Agrupar por `bloco_chave` é o que garante a reconciliação ao centavo.
//
// Os valores são REALIZADO no intervalo das pills (sem previsto) — por isso
// reconciliam ao centavo com as colunas MENSAIS da tabela (que também separam
// realizado de previsto), nunca com uma coluna que misture os dois.
//
// Regra de sinal (a mesma reconciliação, agora em nível de categoria): o bloco já
// tem o net SIGNADO (+ entrada / − saída); o LADO (Entradas | Saídas) é derivado
// do sinal do bloco. A CONTRIBUIÇÃO de uma categoria ao seu lado é
// `saida ? -cat.valor : cat.valor` — uma categoria com o MESMO sinal do bloco
// contribui positivo; um ESTORNO (categoria com sinal OPOSTO ao do bloco — existe
// de verdade, ~9 casos medidos em RH/RHB/ESTR) contribui NEGATIVO. Por
// construção, Σ contrib das categorias do bloco === Math.abs(valor do bloco), o
// que mantém a drill reconciliando com a barra. O estorno aparece ENTRE
// PARÊNTESES (fmtContabil) — sinaliza "reduz o total" sem inventar um lado novo.

import { useMemo, useState, type ReactNode } from 'react'
import { fmtBRL } from '@/lib/fmt'
import { fmtContabil, fmtContabilBRL } from './dre/fmt-contabil'
import { fluxoColors } from '@/components/charts'
import { rotuloBloco } from '@/lib/dre/rotulo-bloco'
import type { DecBloco, DecCategoria } from '@/lib/dre/schemas'

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Blocos com movimento no período, em ordem do demonstrativo. `valor` é o net SIGNADO. */
  blocos: DecBloco[]
  /** Categorias com movimento. `bloco_chave === null` ⇒ NÃO CLASSIFICADA (sem de-para). */
  categorias: DecCategoria[]
  /** As pills de período (client component com router), injetadas pela página. */
  slotPills?: ReactNode
  /** true = a RPC do período FALHOU — estado DISTINTO de "período sem lançamentos".
   *  Anunciar "sem lançamentos" quando a chamada quebrou seria dado errado parecendo
   *  certo (a classe de defeito que os gates não pegam). Em qualquer dos dois casos as
   *  pills continuam visíveis: sem elas o usuário ficaria preso no período que falhou. */
  erro?: boolean
}

type Lado = 'entrada' | 'saida'

// ── Paletas dessaturadas (design system) ────────────────────────────────────
// Entradas: viés verde sage. Saídas: viés terracota/quente. "Outros" sempre o
// último tom (mais neutro/claro) de cada paleta.

// Endpoints da paleta = tokens via var() (fonte única; mudar o token propaga aqui).
// Os tons INTERMEDIÁRIOS (sem token correspondente) seguem hex — degradê das barras.
const PALETA_ENTRADAS = [
  'var(--positive)',
  '#7E9658',
  '#9FB37B',
  'var(--positive-deep)',
  'var(--positive-soft)',
]

const PALETA_SAIDAS = [
  'var(--negative)',
  '#B97058',
  '#C98C6E',
  'var(--negative-deep)',
  '#9C7A6A',
  '#BFA292',
  'var(--negative-soft)', // 7º tom: hoje INALCANÇÁVEL (MAX_FATIAS=6 ⇒ índices 0..5) —
                          // "Outros" tem cor própria (COR_OUTROS). Fica como folga se
                          // MAX_FATIAS subir; NÃO é "a cor de Outros", como dizia antes.
]

// Nota: `PALETA_ENTRADAS` tem 5 tons e `MAX_FATIAS` é 6, então um 6º bloco de Entradas
// repetiria a cor do 1º (`i % length`). Na estrutura real o lado das Entradas tem ~4
// blocos analíticos (ENT_H, RV, RFIN, RNOP), então o caso não acontece hoje; se um dia
// acontecer, o efeito é só colisão de cor entre duas barras distantes na lista.

const COR_OUTROS = '#B8B2A8' // neutro morno
const COR_NAO_CLASSIFICADAS = 'var(--warning)'

const MAX_FATIAS = 6 // top N blocos; demais (ou < LIMITE_PCT) viram "Outros"
const LIMITE_PCT = 2 // blocos abaixo de 2% do total do lado são dobrados em "Outros"

// ── Estruturas internas ──────────────────────────────────────────────────────

type TipoItem = 'bloco' | 'outros' | 'nao_classificadas'

interface ItemBarra {
  key: string // chave do bloco; '__outros__'; '__nc__'
  label: string
  valor: number // magnitude (>= 0) — o lado e a cor já comunicam o sinal
  cor: string
  tipo: TipoItem
  blocosAgregados?: string[] // só p/ tipo 'outros': as chaves dos blocos que entraram
}

interface ItemDrill {
  key: string
  label: string
  valor: number // pode ser NEGATIVO (estorno) — fmtContabil sinaliza com parênteses
}

/**
 * Monta os itens (barras) de um lado a partir dos blocos + a bandeja de "Não
 * classificadas" (categorias sem bloco, mesmo sinal do lado). Mantém os top
 * MAX_FATIAS blocos com pct >= LIMITE_PCT (rankeados por magnitude, não pela
 * ordem do demonstrativo recebida); o restante vira "Outros". A bandeja de não
 * classificadas fica FORA do top-N — sempre visível, sempre por último.
 */
function montarItensLado(
  blocos: DecBloco[],
  categorias: DecCategoria[],
  lado: Lado,
  paleta: string[],
): { itens: ItemBarra[]; totalLado: number } {
  // O épsilon descarta bloco cujo NET é ~zero — ele não tem lado (nem entrada nem saída)
  // nem comprimento de barra. Não é omissão silenciosa: a tabela da DRE logo acima mostra
  // essa mesma linha com travessão, e o payload da RPC continua íntegro (o teste de
  // contrato prova Σ categorias == Σ blocos). Acontece quando categorias grandes do mesmo
  // bloco se cancelam quase por completo no período.
  const filtrados = blocos.filter(b => (lado === 'entrada' ? b.valor > 0.005 : b.valor < -0.005))
  const totalBlocos = filtrados.reduce((s, b) => s + Math.abs(b.valor), 0)

  const ordenados = [...filtrados].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))

  const principais: DecBloco[] = []
  const agregados: DecBloco[] = []
  for (const b of ordenados) {
    const pct = totalBlocos > 0 ? (Math.abs(b.valor) / totalBlocos) * 100 : 0
    if (principais.length < MAX_FATIAS && pct >= LIMITE_PCT) {
      principais.push(b)
    } else {
      agregados.push(b)
    }
  }

  const itens: ItemBarra[] = principais.map((b, i): ItemBarra => ({
    key: b.chave,
    label: rotuloBloco(b.rotulo),
    valor: Math.abs(b.valor),
    cor: paleta[i % paleta.length],
    tipo: 'bloco',
  }))

  if (agregados.length > 0) {
    const valorOutros = agregados.reduce((s, b) => s + Math.abs(b.valor), 0)
    itens.push({
      key: '__outros__',
      label: `Outros (${agregados.length} ${agregados.length === 1 ? 'bloco' : 'blocos'})`,
      valor: valorOutros,
      cor: COR_OUTROS,
      tipo: 'outros',
      blocosAgregados: agregados.map(b => b.chave),
    })
  }

  let totalLado = totalBlocos
  const naoClassificadas = categorias.filter(
    c => c.bloco_chave === null && (lado === 'entrada' ? c.valor > 0.005 : c.valor < -0.005),
  )
  if (naoClassificadas.length > 0) {
    const valorNc = naoClassificadas.reduce((s, c) => s + Math.abs(c.valor), 0)
    itens.push({
      key: '__nc__',
      label: `Não classificadas (${naoClassificadas.length})`,
      valor: valorNc,
      cor: COR_NAO_CLASSIFICADAS,
      tipo: 'nao_classificadas',
    })
    totalLado += valorNc
  }

  return { itens, totalLado }
}

/** Conteúdo do drill de um item selecionado (categorias do bloco, blocos agregados
 *  de "Outros", ou categorias não classificadas), ordenado por |valor| desc. */
function montarDrill(
  item: ItemBarra,
  blocos: DecBloco[],
  categorias: DecCategoria[],
  lado: Lado,
): { titulo: string; itens: ItemDrill[]; maior: number } {
  let itens: ItemDrill[]
  let titulo: string

  if (item.tipo === 'outros') {
    titulo = 'Outros blocos'
    itens = (item.blocosAgregados ?? []).map(chave => {
      const b = blocos.find(x => x.chave === chave)
      return { key: chave, label: b ? rotuloBloco(b.rotulo) : chave, valor: b ? Math.abs(b.valor) : 0 }
    })
  } else if (item.tipo === 'nao_classificadas') {
    titulo = item.label
    itens = categorias
      .filter(c => c.bloco_chave === null && (lado === 'entrada' ? c.valor > 0.005 : c.valor < -0.005))
      .map(c => ({ key: String(c.categoria_id), label: c.rotulo, valor: lado === 'saida' ? -c.valor : c.valor }))
  } else {
    titulo = item.label
    itens = categorias
      .filter(c => c.bloco_chave === item.key)
      .map(c => ({ key: String(c.categoria_id), label: c.rotulo, valor: lado === 'saida' ? -c.valor : c.valor }))
  }

  itens = [...itens].sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
  const maior = itens.reduce((m, i) => Math.max(m, Math.abs(i.valor)), 0)
  return { titulo, itens, maior }
}

// ── Ícone de voltar (chevron) ─────────────────────────────────────────────────

function IconeVoltar() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

// ── Um lado (Entradas OU Saídas): barras + Total + drill ──────────────────────

function LadoDecomposicao({
  titulo,
  lado,
  blocos,
  categorias,
  paleta,
}: {
  titulo: string
  lado: Lado
  blocos: DecBloco[]
  categorias: DecCategoria[]
  paleta: string[]
}) {
  const [selecionado, setSelecionado] = useState<string | null>(null)

  const { itens, totalLado } = useMemo(
    () => montarItensLado(blocos, categorias, lado, paleta),
    [blocos, categorias, lado, paleta],
  )

  const maiorDoLado = useMemo(() => itens.reduce((m, it) => Math.max(m, it.valor), 0), [itens])

  const itemSel = selecionado ? itens.find(it => it.key === selecionado) ?? null : null

  const drill = useMemo(
    () => (itemSel ? montarDrill(itemSel, blocos, categorias, lado) : null),
    [itemSel, blocos, categorias, lado],
  )

  const corTitulo = lado === 'entrada' ? fluxoColors.entrada : fluxoColors.saida
  const toggle = (key: string) => setSelecionado(s => (s === key ? null : key))

  if (itens.length === 0) {
    return (
      <div>
        <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>
        <p className="text-xs text-zinc-400">Sem dados</p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs mb-2 font-medium" style={{ color: corTitulo }}>{titulo}</p>

      <div className="space-y-2.5">
        {itens.map(it => {
          const ativo = selecionado === it.key
          const naoClassif = it.tipo === 'nao_classificadas'
          const pctBarra = maiorDoLado > 0 ? (it.valor / maiorDoLado) * 100 : 0
          const pctTotal = totalLado > 0 ? (it.valor / totalLado) * 100 : 0
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => toggle(it.key)}
              className={`w-full text-left rounded-md px-1.5 py-1 -mx-1.5 transition-colors ${
                ativo ? 'bg-zinc-100' : 'hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className={`text-2xs truncate min-w-0 ${naoClassif ? 'text-warning-deep' : 'text-zinc-700'}`}>
                  {it.label}
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-3xs text-zinc-400 tabular-nums">{pctTotal.toFixed(1)}%</span>
                  <span
                    className="text-2xs font-medium tabular-nums text-zinc-800"
                    title={fmtContabilBRL(it.valor)}
                  >
                    {fmtBRL(it.valor)}
                  </span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pctBarra}%`, background: it.cor, opacity: !selecionado || ativo ? 1 : 0.4 }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Total do lado (inclui as não classificadas) */}
      <div className="flex items-baseline justify-between gap-2 mt-3 pt-2 border-t border-zinc-100">
        <span className="text-2xs font-semibold" style={{ color: corTitulo }}>Total</span>
        <span
          className="text-2xs font-semibold tabular-nums"
          style={{ color: corTitulo }}
          title={fmtContabilBRL(totalLado)}
        >
          {fmtBRL(totalLado)}
        </span>
      </div>

      {/* Drill-down do item selecionado */}
      {itemSel && drill && (
        <div className="mt-3 border-t border-zinc-100 pt-2.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-2xs font-medium text-zinc-700 truncate pr-2">{drill.titulo}</p>
            <button
              type="button"
              onClick={() => setSelecionado(null)}
              className="shrink-0 inline-flex items-center gap-1 text-2xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              <IconeVoltar />
              voltar
            </button>
          </div>
          {drill.itens.length === 0 ? (
            <p className="text-2xs text-zinc-400">Sem itens no período.</p>
          ) : (
            <div className="space-y-2">
              {drill.itens.map(d => {
                const larguraBarra = drill.maior > 0 ? (Math.abs(d.valor) / drill.maior) * 100 : 0
                return (
                  <div key={d.key}>
                    <div className="flex justify-between items-baseline mb-0.5">
                      <span className="text-2xs text-zinc-600 truncate pr-2 min-w-0">
                        {d.label || '(sem categoria)'}
                      </span>
                      <span className="text-2xs font-medium text-zinc-800 tabular-nums shrink-0">
                        {fmtContabil(d.valor)}
                      </span>
                    </div>
                    <div className="h-[3px] rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${larguraBarra}%`, background: itemSel.cor, opacity: 0.55 }}
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

// ── Componente principal ──────────────────────────────────────────────────────
// Card autocontido: cabeçalho interno (título + pills) e os dois lados
// (Entradas | Saídas) lado a lado, cada um com suas próprias barras + Total +
// drill. Sem subtítulo (decisão explícita do Yan).

export default function DecomposicaoLancamentos({ blocos, categorias, slotPills, erro }: Props) {
  const semDados = blocos.length === 0 && categorias.length === 0

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <h2 className="text-[15px] font-semibold text-text-primary">Decomposição dos Lançamentos</h2>
        {slotPills}
      </div>

      {erro ? (
        <p className="text-xs text-warning-deep">
          Não foi possível carregar a decomposição deste período — tente outro período.
        </p>
      ) : semDados ? (
        <p className="text-xs text-zinc-400">Sem lançamentos realizados no período.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
          <LadoDecomposicao
            titulo="Entradas"
            lado="entrada"
            blocos={blocos}
            categorias={categorias}
            paleta={PALETA_ENTRADAS}
          />
          <LadoDecomposicao
            titulo="Saídas"
            lado="saida"
            blocos={blocos}
            categorias={categorias}
            paleta={PALETA_SAIDAS}
          />
        </div>
      )}
    </div>
  )
}
