'use client'

// =============================================================================
// MOCKUP INTERATIVO do editor da estrutura viva da DRE (v5.3.0 · M0).
// Grade de blocos com categorias, reordenação ↑/↓, mover/classificar/reincluir
// via modal com efeito visível nos subtotais, bandeja + excluídas sempre
// visíveis, salvar em lote (mock, sem persistência). Fonte: mockup-dados.ts
// (fixture LINHAS/BANDEJA/EXCLUIDAS/FORMULAS). Removível quando a estrutura
// real (M1+) chegar via RPC.
//
// Direção visual (rodada 2): a faixa vertical de NATUREZA foi descartada pelo
// usuário (poluía o card) — a hierarquia agora é por BANDA CINZA (tokens
// `--band`/`--band-soft`, alinhados à plataforma) nos headers de bloco e nas
// âncoras de fórmula, e a cor por SINAL passou a viver nos próprios valores
// (verde = receita/entrada, vermelho = gasto/saída). Tudo dentro de UM card
// externo com respiro — os blocos viraram BOXES sem sombra própria.
// =============================================================================

import { useState, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, FolderInput, EyeOff, Undo2, Lock, Loader2, Check } from 'lucide-react'
import Button from '@/components/ui/button'
import Badge from '@/components/ui/badge'
import ModalCentral from '@/components/shared/modal-central'
import ConfirmModal from '@/components/shared/confirm-modal'
import { PILL, PILL_NEUTRO, PILL_PRIMARIA, PILL_PRIMARIA_STYLE } from '@/components/shared/botoes'
import { LINHAS, BANDEJA, EXCLUIDAS, FORMULAS, type LinhaDre } from './mockup-dados'
import { fmtContabil, fmtContabilBRL } from './fmt-contabil'

// ─────────────────────────────────────────────────────────────────────────────
// Modelo de dados local (derivado da fixture)
// ─────────────────────────────────────────────────────────────────────────────

interface CatEditor {
  key: string
  nome: string
  estrela: boolean
  total: number
}

interface BlocoItem {
  chave: string
  rotulo: string
  tipo: LinhaDre['t']
  formula?: string[]
  cats: CatEditor[]
}

interface ExcluidaEditor extends CatEditor {
  grupoMonde: string
}

type ModalMoverEstado =
  | { modo: 'mover'; blocoChave: string; catKey: string }
  | { modo: 'classificar'; catKey: string }
  | { modo: 'reincluir'; catKey: string }

// ─────────────────────────────────────────────────────────────────────────────
// Cor por SINAL (substitui a faixa de natureza) — verde para valor positivo
// (receita/entrada), vermelho para negativo (gasto/saída); zero fica neutro.
// Usada nas linhas de categoria, na bandeja e nas excluídas.
// ─────────────────────────────────────────────────────────────────────────────

function corValor(v: number): string {
  return v < 0 ? 'text-negative' : v > 0 ? 'text-positive' : 'text-text-subtle'
}

// Chaves DETERMINÍSTICAS pelo nome — os nomes de categoria são únicos na DRE
// (0 duplicatas, provado na investigação). Nada de contador módulo-level: mutação
// durante o render viola a regra de imutabilidade do react-hooks v7.

function somaM26(linha: LinhaDre): number {
  return linha.m26.reduce((s, v) => s + v, 0)
}

function subtotalCats(cats: CatEditor[]): number {
  return cats.reduce((s, c) => s + c.total, 0)
}

function derivarBlocos(): BlocoItem[] {
  const cabecas = LINHAS.filter(l => l.t === 'blocoH' || l.t === 'sub' || l.t === 'tot')
  return cabecas.map(l => {
    const chave = l.k ?? `sem-chave-${l.l}`
    const cats: CatEditor[] = l.k
      ? LINHAS.filter(c => c.t === 'cat' && c.g === l.k).map(c => ({
          key: c.l,
          nome: c.l,
          estrela: c.estrela,
          total: somaM26(c),
        }))
      : []
    return {
      chave,
      rotulo: l.l,
      tipo: l.t,
      formula: l.k ? FORMULAS[l.k] : undefined,
      cats,
    }
  })
}

function derivarBandeja(): CatEditor[] {
  return BANDEJA.map(c => ({ key: c.l, nome: c.l, estrela: c.estrela, total: somaM26(c) }))
}

function derivarExcluidas(): ExcluidaEditor[] {
  return EXCLUIDAS.map(e => ({
    key: e.l,
    nome: e.l,
    estrela: false,
    total: e.total,
    grupoMonde: e.grupoMonde,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de texto (funções puras — NÃO são componentes; retornam ReactNode)
// ─────────────────────────────────────────────────────────────────────────────

function pluralAlteracoes(n: number): string {
  const palavra = n === 1 ? 'alteração' : 'alterações'
  const sufixo = n === 1 ? 'não salva' : 'não salvas'
  return `${n} ${palavra} ${sufixo}`
}

function construirMensagemExcluir(blocos: BlocoItem[], blocoChave: string, catKey: string): ReactNode {
  const bloco = blocos.find(b => b.chave === blocoChave)
  const cat = bloco?.cats.find(c => c.key === catKey)
  if (!bloco || !cat) return null
  const atual = subtotalCats(bloco.cats)
  const novo = atual - cat.total
  return (
    <div className="space-y-2">
      <p>
        Excluir <strong>{cat.nome}</strong> da DRE. {bloco.rotulo}:{' '}
        <span className="tabular-nums">{fmtContabilBRL(atual)}</span>
        {' → '}
        <span className="tabular-nums font-medium">{fmtContabilBRL(novo)}</span>
      </p>
      <p className="text-xs text-text-muted">
        A categoria continua visível em Excluídas e pode ser reincluída a qualquer momento.
      </p>
    </div>
  )
}

interface DadosModalMover {
  acaoTexto: string
  cat: { nome: string; total: number }
  origem?: { rotulo: string; atual: number }
  destinos: { chave: string; rotulo: string; atual: number }[]
}

function construirDadosModalMover(
  modal: ModalMoverEstado,
  blocos: BlocoItem[],
  bandeja: CatEditor[],
  excluidas: ExcluidaEditor[],
): DadosModalMover | null {
  const destinosDisponiveis = (excetoChave?: string) =>
    blocos
      .filter(b => b.cats.length > 0 && b.chave !== excetoChave)
      .map(b => ({ chave: b.chave, rotulo: b.rotulo, atual: subtotalCats(b.cats) }))

  if (modal.modo === 'mover') {
    const origemBloco = blocos.find(b => b.chave === modal.blocoChave)
    const cat = origemBloco?.cats.find(c => c.key === modal.catKey)
    if (!origemBloco || !cat) return null
    return {
      acaoTexto: 'Mover esta categoria para outro bloco:',
      cat: { nome: cat.nome, total: cat.total },
      origem: { rotulo: origemBloco.rotulo, atual: subtotalCats(origemBloco.cats) },
      destinos: destinosDisponiveis(origemBloco.chave),
    }
  }
  if (modal.modo === 'classificar') {
    const cat = bandeja.find(c => c.key === modal.catKey)
    if (!cat) return null
    return {
      acaoTexto: 'Classificar esta categoria (ainda sem bloco) em:',
      cat: { nome: cat.nome, total: cat.total },
      destinos: destinosDisponiveis(),
    }
  }
  const item = excluidas.find(e => e.key === modal.catKey)
  if (!item) return null
  return {
    acaoTexto: 'Reincluir esta categoria excluída em:',
    cat: { nome: item.nome, total: item.total },
    destinos: destinosDisponiveis(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes (hastados no MÓDULO — nunca definidos dentro do render)
// ─────────────────────────────────────────────────────────────────────────────

function FaixaAncora({ item, rotulosPorChave }: { item: BlocoItem; rotulosPorChave: Record<string, string> }) {
  // A fórmula é exibida com os RÓTULOS dos insumos (legível para quem lê a DRE), não com as
  // chaves internas; a forma por chaves — que é o que de fato ancora o cálculo — fica no
  // `title`, preservando a rastreabilidade. (Achado MÉDIO do revisor.)
  const porChaves = item.formula?.join(' + ') ?? ''
  const legivel   = item.formula?.map(k => rotulosPorChave[k] ?? k).join(' + ') ?? ''
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-wt-border bg-band px-3 py-2"
      title={item.formula ? `Ancorada por chave de bloco — não reordenável · = ${porChaves}` : 'Ancorada por chave de bloco — não reordenável'}
    >
      <Lock size={12} className="shrink-0 text-text-subtle" aria-hidden="true" />
      <p className="shrink-0 text-[13px] font-medium text-text-primary">{item.rotulo}</p>
      {item.formula ? (
        <p className="truncate text-2xs text-text-subtle">= {legivel}</p>
      ) : (
        <p className="truncate text-2xs text-text-subtle italic">valor direto — sem categorias</p>
      )}
    </div>
  )
}

function LinhaCategoria({
  nome,
  estrela,
  total,
  index,
  count,
  onSubir,
  onDescer,
  onMover,
  onExcluir,
}: {
  nome: string
  estrela: boolean
  total: number
  index: number
  count: number
  onSubir: () => void
  onDescer: () => void
  onMover: () => void
  onExcluir: () => void
}) {
  return (
    <div className="flex items-center gap-2 border-b border-wt-border/60 px-4 py-2.5 last:border-b-0">
      <p className="min-w-0 flex-1 truncate text-[13px] text-text-secondary">
        {nome}
        {estrela && (
          <sup className="text-warning-deep" title="Nota da controladoria">
            *
          </sup>
        )}
      </p>
      <p className={`shrink-0 text-xs tabular-nums ${corValor(total)}`}>{fmtContabil(total)}</p>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="icone"
          disabled={index === 0}
          onClick={onSubir}
          aria-label={`Mover ${nome} para cima`}
          title="Mover para cima"
        >
          <ChevronUp size={14} />
        </Button>
        <Button
          variant="icone"
          disabled={index === count - 1}
          onClick={onDescer}
          aria-label={`Mover ${nome} para baixo`}
          title="Mover para baixo"
        >
          <ChevronDown size={14} />
        </Button>
        <Button
          variant="icone"
          onClick={onMover}
          aria-label={`Mover ${nome} para outro bloco`}
          title="Mover para outro bloco"
        >
          <FolderInput size={14} />
        </Button>
        <Button
          variant="icone"
          tone="perigo"
          onClick={onExcluir}
          aria-label={`Excluir ${nome} da DRE`}
          title="Excluir da DRE"
        >
          <EyeOff size={14} />
        </Button>
      </div>
    </div>
  )
}

function CardBloco({
  bloco,
  onSubirCat,
  onDescerCat,
  onMoverCat,
  onExcluirCat,
}: {
  bloco: BlocoItem
  onSubirCat: (index: number) => void
  onDescerCat: (index: number) => void
  onMoverCat: (catKey: string) => void
  onExcluirCat: (catKey: string) => void
}) {
  const subtotal = subtotalCats(bloco.cats)
  // -deep (não a base): sobre a banda cinza (--band-soft) os tons base de sinal
  // reprovam AA (contraste medido 3,88–4,31:1); os -deep sobem a 7–10:1.
  const corSubtotal = subtotal < 0 ? 'text-negative-deep' : subtotal > 0 ? 'text-positive-deep' : 'text-text-muted'
  return (
    <div className="overflow-hidden rounded-lg border border-wt-border bg-surface">
      <div className="flex items-center gap-2 border-b border-wt-border bg-band-soft px-4 py-3">
        <p className="text-sm font-medium text-text-primary">{bloco.rotulo}</p>
        <span className="rounded bg-surface-strong px-1.5 py-0.5 font-mono text-2xs text-text-muted">{bloco.chave}</span>
        <span className="text-2xs text-text-subtle">
          {bloco.cats.length} categoria{bloco.cats.length === 1 ? '' : 's'}
        </span>
        <span className={`ml-auto shrink-0 text-sm font-medium tabular-nums ${corSubtotal}`}>
          {fmtContabilBRL(subtotal)}
        </span>
      </div>
      <div>
        {bloco.cats.map((cat, index) => (
          <LinhaCategoria
            key={cat.key}
            nome={cat.nome}
            estrela={cat.estrela}
            total={cat.total}
            index={index}
            count={bloco.cats.length}
            onSubir={() => onSubirCat(index)}
            onDescer={() => onDescerCat(index)}
            onMover={() => onMoverCat(cat.key)}
            onExcluir={() => onExcluirCat(cat.key)}
          />
        ))}
      </div>
    </div>
  )
}

function BandejaCard({ itens, onClassificar }: { itens: CatEditor[]; onClassificar: (catKey: string) => void }) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-l-[3px] border-warning border-l-warning bg-warning-bg">
      <div className="flex flex-wrap items-center gap-2 border-b border-warning/40 px-4 py-3">
        <Badge variant="warning">Não classificadas</Badge>
        <span className="text-2xs text-warning-deep">
          {itens.length} categoria{itens.length === 1 ? '' : 's'}
        </span>
        <span className="text-2xs text-warning-deep">
          categorias novas do Monde aparecem aqui — nada some em silêncio
        </span>
      </div>
      <div>
        {itens.map(cat => (
          <div key={cat.key} className="flex items-center gap-2 border-b border-warning/20 px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              {/* nome na tinta primária (contraste alto sobre o âmbar) e a nota em âmbar
                  escuro: dentro do card, o nome precisa pesar mais que o explicador. */}
              <p className="truncate text-[13px] text-text-primary">{cat.nome}</p>
              <p className="text-2xs text-warning-deep">Sem bloco mapeado — aguardando classificação</p>
            </div>
            <p className={`shrink-0 text-xs tabular-nums ${corValor(cat.total)}`}>{fmtContabil(cat.total)}</p>
            <button type="button" onClick={() => onClassificar(cat.key)} className={`${PILL} ${PILL_NEUTRO} shrink-0`}>
              Classificar…
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function ExcluidasCard({
  itens,
  onReincluir,
}: {
  itens: ExcluidaEditor[]
  onReincluir: (catKey: string) => void
}) {
  if (itens.length === 0) return null
  return (
    <div className="rounded-lg border border-wt-border bg-surface-soft">
      <div className="border-b border-wt-border px-4 py-3">
        <p className="text-sm font-medium text-text-primary">Excluídas da DRE</p>
        <p className="text-2xs text-text-muted">
          transferências internas de caixa (valores reais, netam a zero) — fora da DRE por não serem
          resultado; seguem visíveis e reversíveis
        </p>
      </div>
      <div>
        {itens.map(item => (
          <div key={item.key} className="flex items-center gap-2 border-b border-wt-border px-4 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-text-secondary">{item.nome}</p>
              <p className="text-2xs text-text-subtle">{item.grupoMonde}</p>
            </div>
            <p className={`shrink-0 text-xs tabular-nums ${corValor(item.total)}`}>{fmtContabil(item.total)}</p>
            <button
              type="button"
              onClick={() => onReincluir(item.key)}
              className={`${PILL} ${PILL_NEUTRO} shrink-0 inline-flex items-center gap-1`}
            >
              <Undo2 size={12} /> Reincluir…
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function MoverModal({
  acaoTexto,
  cat,
  origem,
  destinos,
  selecionado,
  onSelecionar,
  onConfirmar,
  onFechar,
}: {
  acaoTexto: string
  cat: { nome: string; total: number }
  origem?: { rotulo: string; atual: number }
  destinos: { chave: string; rotulo: string; atual: number }[]
  selecionado: string | null
  onSelecionar: (chave: string) => void
  onConfirmar: () => void
  onFechar: () => void
}) {
  const destinoSel = destinos.find(d => d.chave === selecionado) ?? null
  return (
    <ModalCentral
      titulo="Mover categoria"
      subtitulo={cat.nome}
      largura="lg"
      onClose={onFechar}
      rodape={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={`${PILL} ${PILL_NEUTRO}`} onClick={onFechar}>
            Cancelar
          </button>
          <button
            type="button"
            className={`${PILL} ${PILL_PRIMARIA}`}
            style={PILL_PRIMARIA_STYLE}
            disabled={!selecionado}
            onClick={onConfirmar}
          >
            Confirmar
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-text-muted">{acaoTexto}</p>
          {destinos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-wt-border px-3 py-4 text-center text-sm text-text-subtle">
              Nenhum bloco de destino disponível.
            </p>
          ) : (
            <div className="space-y-1.5">
              {destinos.map(d => (
                <button
                  key={d.chave}
                  type="button"
                  onClick={() => onSelecionar(d.chave)}
                  className={`foco-neutro w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selecionado === d.chave
                      ? 'border-action-soft-border bg-action-soft text-action-soft-fg'
                      : 'border-wt-border text-text-secondary hover:bg-surface-strong'
                  }`}
                >
                  {d.rotulo}
                </button>
              ))}
            </div>
          )}
        </div>

        {destinoSel && (
          <div className="space-y-1.5 rounded-lg border border-wt-border bg-surface-soft p-3">
            <p className="text-2xs font-medium text-text-muted">Efeito nos subtotais</p>
            {origem && (
              <p className="text-xs text-text-secondary">
                {origem.rotulo}: <span className="tabular-nums">{fmtContabilBRL(origem.atual)}</span>
                {' → '}
                <span className="font-medium tabular-nums">{fmtContabilBRL(origem.atual - cat.total)}</span>
              </p>
            )}
            <p className="text-xs text-text-secondary">
              {destinoSel.rotulo}: <span className="tabular-nums">{fmtContabilBRL(destinoSel.atual)}</span>
              {' → '}
              <span className="font-medium tabular-nums">{fmtContabilBRL(destinoSel.atual + cat.total)}</span>
            </p>
          </div>
        )}
      </div>
    </ModalCentral>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export default function EditorDreMockup() {
  const [blocos, setBlocos] = useState<BlocoItem[]>(() => derivarBlocos())
  const [bandeja, setBandeja] = useState<CatEditor[]>(() => derivarBandeja())
  const [excluidas, setExcluidas] = useState<ExcluidaEditor[]>(() => derivarExcluidas())
  const [alteracoes, setAlteracoes] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState(false)

  const [modalMover, setModalMover] = useState<ModalMoverEstado | null>(null)
  const [destinoSel, setDestinoSel] = useState<string | null>(null)
  const [modalExcluir, setModalExcluir] = useState<{ blocoChave: string; catKey: string } | null>(null)

  function registrar(msg: string) {
    setAlteracoes(prev => [...prev, msg])
    setSalvoEm(false)
  }

  function moverCategoria(blocoChave: string, index: number, delta: -1 | 1) {
    const bloco = blocos.find(b => b.chave === blocoChave)
    if (!bloco) return
    const destino = index + delta
    if (destino < 0 || destino >= bloco.cats.length) return
    const nomeCat = bloco.cats[index].nome
    setBlocos(prev =>
      prev.map(b => {
        if (b.chave !== blocoChave) return b
        const novo = [...b.cats]
        const [item] = novo.splice(index, 1)
        novo.splice(destino, 0, item)
        return { ...b, cats: novo }
      }),
    )
    registrar(`Reordenou '${nomeCat}' em ${bloco.rotulo}`)
  }

  function abrirMover(blocoChave: string, catKey: string) {
    setDestinoSel(null)
    setModalMover({ modo: 'mover', blocoChave, catKey })
  }
  function abrirClassificar(catKey: string) {
    setDestinoSel(null)
    setModalMover({ modo: 'classificar', catKey })
  }
  function abrirReincluir(catKey: string) {
    setDestinoSel(null)
    setModalMover({ modo: 'reincluir', catKey })
  }
  function fecharModalMover() {
    setModalMover(null)
    setDestinoSel(null)
  }

  function confirmarMover() {
    if (!modalMover || !destinoSel) return
    const destinoBloco = blocos.find(b => b.chave === destinoSel)
    if (!destinoBloco) return

    if (modalMover.modo === 'mover') {
      const origemBloco = blocos.find(b => b.chave === modalMover.blocoChave)
      const cat = origemBloco?.cats.find(c => c.key === modalMover.catKey)
      if (!origemBloco || !cat) return
      setBlocos(prev =>
        prev.map(b => {
          if (b.chave === origemBloco.chave) return { ...b, cats: b.cats.filter(c => c.key !== cat.key) }
          if (b.chave === destinoSel) return { ...b, cats: [...b.cats, cat] }
          return b
        }),
      )
      registrar(`Moveu '${cat.nome}' de ${origemBloco.rotulo} para ${destinoBloco.rotulo}`)
    } else if (modalMover.modo === 'classificar') {
      const cat = bandeja.find(c => c.key === modalMover.catKey)
      if (!cat) return
      setBandeja(prev => prev.filter(c => c.key !== cat.key))
      setBlocos(prev => prev.map(b => (b.chave === destinoSel ? { ...b, cats: [...b.cats, cat] } : b)))
      registrar(`Classificou '${cat.nome}' em ${destinoBloco.rotulo}`)
    } else {
      const item = excluidas.find(e => e.key === modalMover.catKey)
      if (!item) return
      setExcluidas(prev => prev.filter(e => e.key !== item.key))
      setBlocos(prev =>
        prev.map(b =>
          b.chave === destinoSel
            ? { ...b, cats: [...b.cats, { key: item.key, nome: item.nome, estrela: item.estrela, total: item.total }] }
            : b,
        ),
      )
      registrar(`Reincluiu '${item.nome}' em ${destinoBloco.rotulo}`)
    }
    fecharModalMover()
  }

  function abrirExcluir(blocoChave: string, catKey: string) {
    setModalExcluir({ blocoChave, catKey })
  }
  function confirmarExcluir() {
    if (!modalExcluir) return
    const bloco = blocos.find(b => b.chave === modalExcluir.blocoChave)
    const cat = bloco?.cats.find(c => c.key === modalExcluir.catKey)
    if (!bloco || !cat) return
    setBlocos(prev => prev.map(b => (b.chave === bloco.chave ? { ...b, cats: b.cats.filter(c => c.key !== cat.key) } : b)))
    setExcluidas(prev => [...prev, { key: cat.key, nome: cat.nome, estrela: cat.estrela, total: cat.total, grupoMonde: bloco.rotulo }])
    registrar(`Excluiu '${cat.nome}' de ${bloco.rotulo}`)
    setModalExcluir(null)
  }

  function salvar() {
    setSalvando(true)
    setTimeout(() => {
      setSalvando(false)
      setAlteracoes([])
      setSalvoEm(true)
      setTimeout(() => setSalvoEm(false), 1500)
    }, 600)
  }

  const dadosModalMover = modalMover ? construirDadosModalMover(modalMover, blocos, bandeja, excluidas) : null
  const rotulosPorChave = Object.fromEntries(blocos.map(b => [b.chave, b.rotulo]))

  return (
    <div className="rounded-xl bg-surface p-5 shadow-sm">
      {/* Conferência visual do Yan ("limpar o que polui"): aviso reduzido a uma linha sem
          jargão interno (padrão Metas/M2/M5 vivem no PR, não na tela); a legenda
          verde/vermelho saiu — é redundante com a da DRE e com os próprios valores. */}
      <p className="text-2xs text-text-subtle">Mockup — as alterações ainda não são salvas.</p>

      <div className="mt-3 space-y-3">
        {blocos.map(item =>
          item.cats.length > 0 ? (
            <CardBloco
              key={item.chave}
              bloco={item}
              onSubirCat={index => moverCategoria(item.chave, index, -1)}
              onDescerCat={index => moverCategoria(item.chave, index, 1)}
              onMoverCat={catKey => abrirMover(item.chave, catKey)}
              onExcluirCat={catKey => abrirExcluir(item.chave, catKey)}
            />
          ) : (
            <FaixaAncora key={item.chave} item={item} rotulosPorChave={rotulosPorChave} />
          ),
        )}

        <BandejaCard itens={bandeja} onClassificar={abrirClassificar} />
        <ExcluidasCard itens={excluidas} onReincluir={abrirReincluir} />
      </div>

      {(alteracoes.length > 0 || salvoEm) && (
        <div className="sticky bottom-0 -mx-5 -mb-5 mt-3 flex items-center justify-between rounded-b-xl border-t border-wt-border bg-surface px-5 py-3">
          {alteracoes.length > 0 ? (
            <>
              <p className="text-xs text-text-muted" title={alteracoes.join('\n')}>
                {pluralAlteracoes(alteracoes.length)}
              </p>
              <Button variant="solido" onClick={salvar} disabled={salvando}>
                {salvando && <Loader2 size={14} className="animate-spin" />}
                {salvando ? 'Salvando…' : 'Salvar alterações'}
              </Button>
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs font-medium text-success">
              <Check size={14} /> Alterações salvas (mock)
            </p>
          )}
        </div>
      )}

      {modalMover && dadosModalMover && (
        <MoverModal
          acaoTexto={dadosModalMover.acaoTexto}
          cat={dadosModalMover.cat}
          origem={dadosModalMover.origem}
          destinos={dadosModalMover.destinos}
          selecionado={destinoSel}
          onSelecionar={setDestinoSel}
          onConfirmar={confirmarMover}
          onFechar={fecharModalMover}
        />
      )}

      {modalExcluir && (
        <ConfirmModal
          titulo="Excluir categoria da DRE"
          mensagem={construirMensagemExcluir(blocos, modalExcluir.blocoChave, modalExcluir.catKey)}
          confirmarLabel="Excluir"
          perigo
          onConfirmar={confirmarExcluir}
          onFechar={() => setModalExcluir(null)}
        />
      )}
    </div>
  )
}
